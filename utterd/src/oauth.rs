use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::thread;
use tiny_http::{Response, Server};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const REDIRECT_URI: &str = "http://localhost:3000/oauth/callback";
const SCOPES: &str = "openid email profile";

// OAuth credentials for Utter desktop application
// NOTE: It is safe and normal to embed these in native/desktop applications.
// Google's OAuth security model for native apps does not rely on keeping CLIENT_SECRET
// confidential. The real security comes from redirect URI validation, user consent,
// and ID token verification on the relay server.
// See: https://developers.google.com/identity/protocols/oauth2/native-app
//
// These values are read from GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment
// variables at build time and baked into the binary. To build:
//   1. Copy ../.env.example to ../.env
//   2. Fill in your Google OAuth credentials
//   3. Run: cargo build (build.rs will load ../.env automatically)
const CLIENT_ID: &str = env!("GOOGLE_CLIENT_ID");
const CLIENT_SECRET: &str = env!("GOOGLE_CLIENT_SECRET");

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthTokens {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    id_token: String,
    access_token: String,
    refresh_token: Option<String>,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct RefreshTokenResponse {
    id_token: String,
    access_token: String,
    expires_in: i64,
}

pub struct OAuthManager {
    token_path: PathBuf,
}

impl OAuthManager {
    pub fn new() -> Result<Self, String> {
        let config_dir = dirs::config_dir()
            .ok_or("Cannot determine config directory")?
            .join("utterd");

        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let token_path = config_dir.join("oauth.json");

        Ok(Self {
            token_path,
        })
    }

    pub fn get_or_authenticate(&self) -> Result<OAuthTokens, String> {
        // Try to load existing tokens
        if self.token_path.exists() {
            match self.load_tokens() {
                Ok(tokens) => {
                    let now = Utc::now();

                    // If token valid for at least 5 more minutes
                    if tokens.expires_at > now + chrono::Duration::minutes(5) {
                        return Ok(tokens);
                    } else if let Some(ref refresh_token) = tokens.refresh_token {
                        // Try to refresh
                        println!("⟳ Refreshing OAuth token...");
                        match self.refresh_token(refresh_token) {
                            Ok(new_tokens) => {
                                self.save_tokens(&new_tokens)?;
                                return Ok(new_tokens);
                            }
                            Err(_) => {
                                eprintln!("⚠ Token refresh failed. Re-authenticating...");
                            }
                        }
                    }
                }
                Err(_) => {
                    eprintln!("⚠ Failed to load tokens. Re-authenticating...");
                }
            }
        }

        // Perform new OAuth flow
        println!();
        let tokens = self.browser_auth_flow()?;
        self.save_tokens(&tokens)?;

        Ok(tokens)
    }

    fn browser_auth_flow(&self) -> Result<OAuthTokens, String> {
        let (tx, rx) = mpsc::channel();

        // Start local HTTP server
        let server = Server::http("127.0.0.1:3000")
            .map_err(|e| format!("Failed to start local server: {}", e))?;

        // Generate authorization URL
        let auth_url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            AUTH_URL,
            urlencoding::encode(CLIENT_ID),
            urlencoding::encode(REDIRECT_URI),
            urlencoding::encode(SCOPES)
        );

        println!("📱 Sign in with Google:");
        println!();
        println!("   Visit: \x1b[36m{}\x1b[0m", auth_url);
        println!();
        println!("Waiting for authorization...");
        println!();

        // Handle callback in separate thread
        thread::spawn(move || {
            for request in server.incoming_requests() {
                let url = request.url().to_string();

                if url.starts_with("/oauth/callback") {
                    // Parse query string
                    if let Some(query) = url.split('?').nth(1) {
                        let params: Vec<(&str, &str)> = query
                            .split('&')
                            .filter_map(|pair| {
                                let parts: Vec<&str> = pair.split('=').collect();
                                if parts.len() == 2 {
                                    Some((parts[0], parts[1]))
                                } else {
                                    None
                                }
                            })
                            .collect();

                        let code = params.iter().find(|(k, _)| *k == "code").map(|(_, v)| *v);

                        if let Some(code_encoded) = code {
                            // URL-decode the authorization code
                            let code = match urlencoding::decode(code_encoded) {
                                Ok(decoded) => decoded.to_string(),
                                Err(_) => {
                                    let html = "<h1>Error: Failed to decode authorization code</h1>";
                                    let response = Response::from_string(html)
                                        .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                                    let _ = request.respond(response);
                                    let _ = tx.send(Err("Failed to decode authorization code".to_string()));
                                    break;
                                }
                            };

                            // Send success response to browser
                            let html = r#"
                                <html>
                                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                                        <h1>✓ Authentication Successful!</h1>
                                        <p>You can close this window and return to the terminal.</p>
                                    </body>
                                </html>
                            "#;
                            let response = Response::from_string(html)
                                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                            let _ = request.respond(response);

                            // Send code to main thread
                            let _ = tx.send(Ok(code));
                        } else {
                            let html = "<h1>Error: No authorization code received</h1>";
                            let response = Response::from_string(html)
                                .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html"[..]).unwrap());
                            let _ = request.respond(response);

                            let _ = tx.send(Err("No authorization code received".to_string()));
                        }
                        break;
                    }
                }
            }
        });

        // Wait for callback with timeout
        let code = rx
            .recv_timeout(std::time::Duration::from_secs(300))
            .map_err(|_| "OAuth flow timed out".to_string())??;

        // Exchange code for tokens
        let client = reqwest::blocking::Client::new();
        let params = [
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("code", code.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", REDIRECT_URI),
        ];

        let response = client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .map_err(|e| format!("Token exchange failed: {}", e))?
            .json::<TokenResponse>()
            .map_err(|e| format!("Failed to parse token response: {}", e))?;

        let expires_at = Utc::now() + chrono::Duration::seconds(response.expires_in);

        Ok(OAuthTokens {
            id_token: response.id_token,
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            expires_at,
        })
    }

    fn refresh_token(&self, refresh_token: &str) -> Result<OAuthTokens, String> {
        let client = reqwest::blocking::Client::new();

        let params = [
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        let response = client
            .post(TOKEN_URL)
            .form(&params)
            .send()
            .map_err(|e| format!("Token refresh failed: {}", e))?
            .json::<RefreshTokenResponse>()
            .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

        let expires_at = Utc::now() + chrono::Duration::seconds(response.expires_in);

        Ok(OAuthTokens {
            id_token: response.id_token,
            access_token: response.access_token,
            refresh_token: Some(refresh_token.to_string()),
            expires_at,
        })
    }

    fn load_tokens(&self) -> Result<OAuthTokens, String> {
        let json = fs::read_to_string(&self.token_path)
            .map_err(|e| format!("Failed to read token file: {}", e))?;

        serde_json::from_str(&json)
            .map_err(|e| format!("Failed to parse token file: {}", e))
    }

    fn save_tokens(&self, tokens: &OAuthTokens) -> Result<(), String> {
        let json = serde_json::to_string_pretty(tokens)
            .map_err(|e| format!("Failed to serialize tokens: {}", e))?;

        fs::write(&self.token_path, json)
            .map_err(|e| format!("Failed to write token file: {}", e))?;

        // Set restrictive permissions on Unix
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.token_path, fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Failed to set token file permissions: {}", e))?;
        }

        println!("✓ OAuth tokens saved");

        Ok(())
    }

    pub fn sign_out(&self) -> Result<(), String> {
        if self.token_path.exists() {
            fs::remove_file(&self.token_path)
                .map_err(|e| format!("Failed to remove token file: {}", e))?;
            println!("✓ Signed out");
        }

        Ok(())
    }
}
