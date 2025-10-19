use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

const DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const SCOPES: &str = "openid email profile";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthTokens {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_url: String,
    expires_in: u64,
    interval: u64,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TokenResponse {
    Success {
        id_token: String,
        access_token: String,
        refresh_token: Option<String>,
        expires_in: i64,
    },
    Error {
        error: String,
    },
}

#[derive(Debug, Deserialize)]
struct RefreshTokenResponse {
    id_token: String,
    access_token: String,
    expires_in: i64,
}

pub struct OAuthManager {
    client_id: String,
    token_path: PathBuf,
}

impl OAuthManager {
    pub fn new(client_id: String) -> Result<Self, String> {
        let config_dir = dirs::config_dir()
            .ok_or("Cannot determine config directory")?
            .join("utterd");

        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let token_path = config_dir.join("oauth.json");

        Ok(Self {
            client_id,
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
                        println!("✓ Using cached OAuth token");
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
        let tokens = self.device_auth_flow()?;
        self.save_tokens(&tokens)?;

        Ok(tokens)
    }

    fn device_auth_flow(&self) -> Result<OAuthTokens, String> {
        let client = reqwest::blocking::Client::new();

        // Request device code
        let params = [
            ("client_id", self.client_id.as_str()),
            ("scope", SCOPES),
        ];

        let device_response = client
            .post(DEVICE_CODE_URL)
            .form(&params)
            .send()
            .map_err(|e| format!("Device code request failed: {}", e))?
            .json::<DeviceCodeResponse>()
            .map_err(|e| format!("Failed to parse device code response: {}", e))?;

        // Display instructions to user
        println!("📱 Sign in with Google:");
        println!();
        println!("   Visit: \x1b[36m{}\x1b[0m", device_response.verification_url);
        println!();
        println!("   Enter code: \x1b[1m\x1b[33m{}\x1b[0m", device_response.user_code);
        println!();
        println!("Waiting for authorization...");
        println!();

        // Poll for token
        let poll_interval = Duration::from_secs(device_response.interval);
        let max_attempts = (device_response.expires_in / device_response.interval) + 1;

        for _ in 0..max_attempts {
            thread::sleep(poll_interval);

            let token_params = [
                ("client_id", self.client_id.as_str()),
                ("device_code", device_response.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ];

            let response = client
                .post(TOKEN_URL)
                .form(&token_params)
                .send()
                .map_err(|e| format!("Token request failed: {}", e))?;

            let token_response = response
                .json::<TokenResponse>()
                .map_err(|e| format!("Failed to parse token response: {}", e))?;

            match token_response {
                TokenResponse::Success {
                    id_token,
                    access_token,
                    refresh_token,
                    expires_in,
                } => {
                    let expires_at = Utc::now() + chrono::Duration::seconds(expires_in);

                    return Ok(OAuthTokens {
                        id_token,
                        access_token,
                        refresh_token,
                        expires_at,
                    });
                }
                TokenResponse::Error { error } => {
                    if error == "authorization_pending" {
                        // Keep waiting
                        continue;
                    } else if error == "slow_down" {
                        // Increase interval
                        thread::sleep(Duration::from_secs(5));
                        continue;
                    } else if error == "expired_token" {
                        return Err("Device code expired. Please try again.".to_string());
                    } else {
                        return Err(format!("OAuth error: {}", error));
                    }
                }
            }
        }

        Err("OAuth timed out. Please try again.".to_string())
    }

    fn refresh_token(&self, refresh_token: &str) -> Result<OAuthTokens, String> {
        let client = reqwest::blocking::Client::new();

        let params = [
            ("client_id", self.client_id.as_str()),
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
