# OAuth Implementation Plan

## Overview

This document outlines the implementation plan for Google OAuth authentication across all Utter components, replacing the hardcoded `userId = 'test-user'` with verified Google account authentication.

**Architecture:** Single-layer security model (similar to Tailscale)
- All devices authenticate via Google OAuth
- All authenticated devices belong to user's "trusted pool"
- E2E encryption already implemented (Phases 1-5 complete)
- OAuth is Phase 6 of the E2E encryption roadmap

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component-Specific Implementation](#component-specific-implementation)
3. [Phase-by-Phase Rollout](#phase-by-phase-rollout)
4. [Testing Strategy](#testing-strategy)
5. [Migration & Backward Compatibility](#migration--backward-compatibility)

---

# Architecture Overview

## OAuth Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│ STEP 1: Google Cloud Console Setup                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Create Google Cloud Project: "Utter"                    │
│  2. Enable Google OAuth 2.0 API                             │
│  3. Create OAuth 2.0 credentials:                           │
│     - Client ID (for utterd & linux-test-client)           │
│     - Android Client ID (SHA-1 fingerprint)                │
│  4. Configure OAuth consent screen                          │
│  5. Set authorized redirect URIs                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ STEP 2: Device Authentication Flow                          │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Linux Client (utterd):                                     │
│  ┌────────────────────────────────────────┐                │
│  │ $ utterd --setup                       │                │
│  │                                        │                │
│  │ Opening browser for Google Sign-In... │                │
│  │ Visit: https://accounts.google.com... │                │
│  └────────────────────────────────────────┘                │
│         ↓                                                    │
│  Browser: User signs in with Google                        │
│         ↓                                                    │
│  utterd receives: ID token + refresh token                 │
│         ↓                                                    │
│  Store tokens in ~/.config/utterd/oauth.json               │
│                                                              │
│  Android App:                                               │
│  ┌────────────────────────────────────────┐                │
│  │ [Sign in with Google] button           │                │
│  └────────────────────────────────────────┘                │
│         ↓                                                    │
│  Google Play Services handles OAuth                        │
│         ↓                                                    │
│  App receives: ID token                                    │
│         ↓                                                    │
│  Store token in Android KeyStore                           │
│                                                              │
│  Linux Test Client:                                         │
│  ┌────────────────────────────────────────┐                │
│  │ $ pnpm start                            │                │
│  │                                        │                │
│  │ Sign in with Google:                   │                │
│  │ Visit: https://...                     │                │
│  └────────────────────────────────────────┘                │
│         ↓                                                    │
│  Browser-based OAuth flow                                  │
│         ↓                                                    │
│  Store tokens in ~/.config/utter-client/oauth.json        │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ STEP 3: Registration with Relay Server                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Client sends:                                              │
│  {                                                           │
│    "type": "register",                                      │
│    "token": "google_oauth_id_token",                       │
│    "clientType": "linux|android|controller",               │
│    "deviceId": "unique-device-id",                         │
│    "deviceName": "Human Readable Name",                    │
│    "publicKey": "base64_x25519_public_key",                │
│    "version": "1.0.0",                                      │
│    "platform": "linux|android",                            │
│    "arch": "x86_64|arm64"                                  │
│  }                                                           │
│         ↓                                                    │
│  Relay Server:                                              │
│  1. Verify token with Google OAuth API                     │
│  2. Extract user_id (email) from verified token            │
│  3. Register device: {device_id, user_id, public_key}     │
│  4. Add to user's trusted pool                             │
│  5. Return success                                          │
│         ↓                                                    │
│  Client:                                                    │
│  - Registered successfully                                  │
│  - Can now send/receive encrypted messages                 │
│  - All devices under same email can communicate            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Security Properties

| Property | Implementation | Status |
|----------|---------------|--------|
| **User Authentication** | Google OAuth 2.0 | ✅ Planned |
| **Device Identity** | Unique device_id + public key | ✅ Implemented |
| **Trusted Pool** | All devices with same user_id | ✅ Ready (server-side) |
| **E2E Encryption** | X25519 ECDH + AES-256-GCM | ✅ Implemented (Phase 5) |
| **Token Security** | ID tokens verified server-side | ✅ Planned |
| **Token Storage** | Encrypted files (Linux) / KeyStore (Android) | ✅ Planned |
| **Token Refresh** | Automatic refresh with refresh tokens | ✅ Planned |

---

# Component-Specific Implementation

## 1. Relay Server (Node.js/TypeScript)

### Dependencies

```bash
cd relay-server
npm install google-auth-library dotenv
```

### Environment Variables

Create `.env`:
```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Server Configuration
PORT=8080
NODE_ENV=production

# Optional: Support test mode in development
ALLOW_TEST_MODE=false  # Set to true for local dev
```

### Implementation Files

#### `relay-server/src/auth.ts` (NEW)

```typescript
import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface VerifiedUser {
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/**
 * Verify Google OAuth ID token
 * @param token - Google OAuth ID token from client
 * @returns Verified user information
 * @throws Error if token is invalid
 */
export async function verifyGoogleToken(token: string): Promise<VerifiedUser> {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('No payload in token');
    }

    if (!payload.email_verified) {
      throw new Error('Email not verified');
    }

    return {
      email: payload.email!,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Check if test mode is allowed (for development)
 */
export function isTestModeAllowed(): boolean {
  return process.env.ALLOW_TEST_MODE === 'true';
}
```

#### Update `relay-server/src/index.ts`

```typescript
import { verifyGoogleToken, isTestModeAllowed } from './auth';

async function handleRegister(client: Client, message: any) {
  // Validate public key (existing code)
  if (message.publicKey) {
    try {
      const keyBytes = Buffer.from(message.publicKey, 'base64');
      if (keyBytes.length !== 32) {
        throw new Error('Invalid public key length');
      }
      client.publicKey = message.publicKey;
    } catch (err) {
      console.error(`${colors.dim}[${client.id}]${colors.reset} ${colors.red}✗${colors.reset} Invalid public key:`, err);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid public key format. Must be base64-encoded X25519 key (32 bytes)',
        timestamp: Date.now()
      }));
      return;
    }
  }

  // OAuth authentication
  if (message.token) {
    // Production mode: Verify OAuth token
    try {
      const userInfo = await verifyGoogleToken(message.token);
      client.userId = userInfo.email;

      console.log(`${colors.dim}[${client.id}]${colors.reset} ${colors.green}✓${colors.reset} OAuth verified: ${userInfo.email}`);
    } catch (err) {
      console.error(`${colors.dim}[${client.id}]${colors.reset} ${colors.red}✗${colors.reset} OAuth failed:`, err);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'OAuth verification failed. Please sign in again.',
        timestamp: Date.now()
      }));
      return;
    }
  } else if (isTestModeAllowed()) {
    // Development/test mode: Allow hardcoded userId
    client.userId = 'test-user';
    console.log(`${colors.dim}[${client.id}]${colors.reset} ${colors.yellow}⚠${colors.reset} Test mode: using 'test-user'`);
  } else {
    // No token provided and test mode disabled
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'OAuth token required. Please sign in with Google.',
      timestamp: Date.now()
    }));
    return;
  }

  // Rest of registration logic (existing code)
  client.type = message.clientType || 'unknown';
  client.deviceId = message.deviceId || client.id;
  client.deviceName = message.deviceName || `${client.type}-${client.id}`;
  client.version = message.version;
  client.platform = message.platform;
  client.arch = message.arch;

  const typeColor = client.type === 'target' ? colors.blue : client.type === 'android' ? colors.magenta : client.type === 'controller' ? colors.cyan : colors.gray;

  const metadata = [];
  if (client.version) metadata.push(client.version);
  if (client.platform) metadata.push(client.platform);
  if (client.arch) metadata.push(client.arch);
  const metaStr = metadata.length > 0 ? ` ${colors.dim}• ${metadata.join(' • ')}${colors.reset}` : '';

  console.log(`${colors.dim}[${client.id}]${colors.reset} ${colors.green}●${colors.reset} ${colors.green}UP${colors.reset} ${colors.bright}${client.deviceName}${colors.reset} ${colors.dim}(${typeColor}${client.type}${colors.reset}${colors.dim})${colors.reset} ${colors.dim}user=${client.userId}${colors.reset}${metaStr}`);

  client.ws.send(JSON.stringify({
    type: 'registered',
    clientId: client.id,
    deviceId: client.deviceId,
    clientType: client.type,
    userId: client.userId,
    timestamp: Date.now()
  }));
}
```

---

## 2. utterd (Rust Linux Client)

### Dependencies

Add to `utterd/Cargo.toml`:

```toml
[dependencies]
# Existing dependencies...

# OAuth
oauth2 = "4.4"
reqwest = { version = "0.11", features = ["json", "rustls-tls"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
```

### Implementation Files

#### `utterd/src/oauth/mod.rs` (NEW)

```rust
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, DeviceAuthorizationUrl, Scope,
    StandardDeviceAuthorizationResponse, TokenResponse, TokenUrl,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OAuthTokens {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: u64, // Unix timestamp
}

pub struct OAuthManager {
    config_dir: PathBuf,
    client_id: String,
}

impl OAuthManager {
    pub fn new(client_id: String) -> Self {
        let config_dir = dirs::config_dir()
            .unwrap()
            .join("utterd");

        fs::create_dir_all(&config_dir).ok();

        Self {
            config_dir,
            client_id,
        }
    }

    /// Get stored tokens or initiate OAuth flow
    pub async fn get_or_authenticate(&self) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
        let token_path = self.config_dir.join("oauth.json");

        // Try to load existing tokens
        if token_path.exists() {
            match self.load_tokens(&token_path) {
                Ok(tokens) => {
                    // Check if expired
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_secs();

                    if tokens.expires_at > now + 300 {
                        // Token valid for at least 5 more minutes
                        println!("✓ Using cached OAuth token");
                        return Ok(tokens);
                    } else if let Some(ref refresh_token) = tokens.refresh_token {
                        // Try to refresh
                        println!("⟳ Refreshing OAuth token...");
                        match self.refresh_token(refresh_token).await {
                            Ok(new_tokens) => {
                                self.save_tokens(&token_path, &new_tokens)?;
                                return Ok(new_tokens);
                            }
                            Err(e) => {
                                eprintln!("⚠ Token refresh failed: {}. Re-authenticating...", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("⚠ Failed to load tokens: {}. Re-authenticating...", e);
                }
            }
        }

        // Perform new OAuth flow
        println!("🔑 Starting Google OAuth authentication...");
        let tokens = self.device_auth_flow().await?;
        self.save_tokens(&token_path, &tokens)?;

        Ok(tokens)
    }

    /// Perform OAuth Device Authorization Flow
    /// This is ideal for CLI applications - user opens URL in browser
    async fn device_auth_flow(&self) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
        let client = BasicClient::new(
            ClientId::new(self.client_id.clone()),
            None,
            AuthUrl::new("https://accounts.google.com/o/oauth2/v2/auth".to_string())?,
            Some(TokenUrl::new("https://oauth2.googleapis.com/token".to_string())?),
        )
        .set_device_authorization_url(
            DeviceAuthorizationUrl::new("https://oauth2.googleapis.com/device/code".to_string())?
        );

        let details: StandardDeviceAuthorizationResponse = client
            .exchange_device_code()?
            .add_scope(Scope::new("openid".to_string()))
            .add_scope(Scope::new("email".to_string()))
            .add_scope(Scope::new("profile".to_string()))
            .request_async(oauth2::reqwest::async_http_client)
            .await?;

        println!("\n{}", "=".repeat(60));
        println!("📱 Please visit this URL to sign in with Google:");
        println!("\n  {}\n", details.verification_uri().as_str());
        println!("And enter this code: {}", details.user_code().secret());
        println!("{}\n", "=".repeat(60));

        // Poll for token
        let token_result = client
            .exchange_device_access_token(&details)
            .request_async(oauth2::reqwest::async_http_client, tokio::time::sleep, None)
            .await?;

        println!("✓ Successfully authenticated with Google!");

        // Extract tokens
        let id_token = token_result
            .extra_fields()
            .id_token()
            .ok_or("No ID token received")?
            .secret()
            .clone();

        let expires_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs()
            + token_result.expires_in()
                .map(|d| d.as_secs())
                .unwrap_or(3600);

        Ok(OAuthTokens {
            id_token,
            access_token: token_result.access_token().secret().clone(),
            refresh_token: token_result.refresh_token().map(|t| t.secret().clone()),
            expires_at,
        })
    }

    /// Refresh token using refresh token
    async fn refresh_token(&self, refresh_token: &str) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
        // Implementation of token refresh
        // Call Google's token endpoint with refresh_token grant type
        todo!("Implement token refresh")
    }

    fn load_tokens(&self, path: &PathBuf) -> Result<OAuthTokens, Box<dyn std::error::Error>> {
        let contents = fs::read_to_string(path)?;
        let tokens: OAuthTokens = serde_json::from_str(&contents)?;
        Ok(tokens)
    }

    fn save_tokens(&self, path: &PathBuf, tokens: &OAuthTokens) -> Result<(), Box<dyn std::error::Error>> {
        let json = serde_json::to_string_pretty(tokens)?;
        fs::write(path, json)?;

        // Set restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)?.permissions();
            perms.set_mode(0o600); // rw------- (owner only)
            fs::set_permissions(path, perms)?;
        }

        Ok(())
    }
}
```

#### Update `utterd/src/main.rs`

```rust
mod oauth;

use oauth::{OAuthManager, OAuthTokens};

impl UtterClient {
    pub async fn new(
        server_url: &str,
        client_id: String,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize OAuth
        let oauth_manager = OAuthManager::new(client_id);
        let tokens = oauth_manager.get_or_authenticate().await?;

        // Initialize crypto (existing code)
        let mut key_manager = KeyManager::new().ok();
        let message_encryption = if let Some(ref mut km) = key_manager {
            // ... existing crypto initialization
        };

        // Connect to server
        let (ws_stream, _) = connect_async(server_url).await?;

        // ... rest of initialization

        Ok(Self {
            oauth_tokens: Some(tokens),
            oauth_manager: Some(oauth_manager),
            // ... existing fields
        })
    }

    async fn register(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let hostname = hostname::get()?
            .to_string_lossy()
            .to_string();

        let public_key = self.key_manager
            .as_ref()
            .map(|km| km.get_public_key_base64())
            .unwrap_or_default();

        let token = self.oauth_tokens
            .as_ref()
            .map(|t| t.id_token.clone())
            .unwrap_or_default();

        let register_msg = json!({
            "type": "register",
            "token": token,  // ← Include OAuth token
            "clientType": "target",
            "deviceId": hostname,
            "deviceName": hostname,
            "publicKey": public_key,
            "version": VERSION,
            "platform": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
        });

        self.send(&register_msg.to_string()).await?;
        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client_id = std::env::var("GOOGLE_CLIENT_ID")
        .expect("GOOGLE_CLIENT_ID environment variable not set");

    let server_url = std::env::var("SERVER_URL")
        .unwrap_or_else(|_| "ws://localhost:8080".to_string());

    let mut client = UtterClient::new(&server_url, client_id).await?;
    client.run().await?;

    Ok(())
}
```

---

## 3. Android App (Kotlin)

### Dependencies

Update `android-app/app/build.gradle.kts`:

```kotlin
dependencies {
    // Existing dependencies...

    // Google Sign-In
    implementation("com.google.android.gms:play-services-auth:20.7.0")
    implementation("com.google.android.gms:play-services-identity:18.0.1")
}
```

### Google Services Configuration

1. Download `google-services.json` from Google Cloud Console
2. Place in `android-app/app/google-services.json`
3. Add plugin to `build.gradle.kts`:

```kotlin
plugins {
    // ...
    id("com.google.gms.google-services") version "4.4.0"
}
```

### Implementation Files

#### `android-app/app/src/main/java/com/utter/android/auth/GoogleAuthManager.kt` (NEW)

```kotlin
package com.utter.android.auth

import android.content.Context
import android.content.Intent
import androidx.activity.result.ActivityResultLauncher
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import kotlinx.coroutines.tasks.await

class GoogleAuthManager(private val context: Context) {
    private val googleSignInClient: GoogleSignInClient

    init {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(context.getString(R.string.google_client_id))
            .requestEmail()
            .build()

        googleSignInClient = GoogleSignIn.getClient(context, gso)
    }

    /**
     * Get sign-in intent to launch Google Sign-In flow
     */
    fun getSignInIntent(): Intent {
        return googleSignInClient.signInIntent
    }

    /**
     * Handle sign-in result from activity result
     */
    suspend fun handleSignInResult(data: Intent?): GoogleSignInAccount {
        val task = GoogleSignIn.getSignedInAccountFromIntent(data)
        return task.await()
    }

    /**
     * Get last signed-in account (if any)
     */
    fun getLastSignedInAccount(): GoogleSignInAccount? {
        return GoogleSignIn.getLastSignedInAccount(context)
    }

    /**
     * Get ID token for current user
     */
    fun getIdToken(): String? {
        return getLastSignedInAccount()?.idToken
    }

    /**
     * Sign out
     */
    suspend fun signOut() {
        googleSignInClient.signOut().await()
    }

    /**
     * Check if user is signed in
     */
    fun isSignedIn(): Boolean {
        return getLastSignedInAccount() != null
    }
}
```

#### `android-app/app/src/main/java/com/utter/android/SignInActivity.kt` (NEW)

```kotlin
package com.utter.android

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.common.api.ApiException
import com.utter.android.auth.GoogleAuthManager
import kotlinx.coroutines.launch

class SignInActivity : AppCompatActivity() {
    private lateinit var authManager: GoogleAuthManager

    private val signInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        lifecycleScope.launch {
            try {
                val account = authManager.handleSignInResult(result.data)
                Log.d(TAG, "Sign in successful: ${account.email}")

                // Store ID token
                val idToken = account.idToken
                if (idToken != null) {
                    // Navigate to main activity
                    startActivity(Intent(this@SignInActivity, MainActivity::class.java))
                    finish()
                } else {
                    showError("Failed to get ID token")
                }
            } catch (e: ApiException) {
                Log.e(TAG, "Sign in failed", e)
                showError("Sign in failed: ${e.message}")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sign_in)

        authManager = GoogleAuthManager(this)

        // Check if already signed in
        if (authManager.isSignedIn()) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }

        // Setup sign-in button
        findViewById<View>(R.id.sign_in_button).setOnClickListener {
            signInLauncher.launch(authManager.getSignInIntent())
        }
    }

    private fun showError(message: String) {
        // Show error to user (Snackbar, Toast, etc.)
        Log.e(TAG, message)
    }

    companion object {
        private const val TAG = "SignInActivity"
    }
}
```

#### Update `android-app/app/src/main/java/com/utter/android/WebSocketClient.kt`

```kotlin
class WebSocketClient(
    private val context: Context,
    private val serverUrl: String,
    private val cryptoManager: CryptoManager,
    private val authManager: GoogleAuthManager  // ← Add auth manager
) {
    // ... existing code

    fun connect() {
        // Get OAuth token
        val idToken = authManager.getIdToken()
        if (idToken == null) {
            listener?.onError("Not signed in. Please sign in first.")
            return
        }

        val request = Request.Builder()
            .url(serverUrl)
            .build()

        webSocket = okHttpClient.newWebSocket(request, this)
    }

    override fun onOpen(webSocket: WebSocket, response: Response) {
        isConnected = true
        Log.d(TAG, "WebSocket connected")

        // Register with OAuth token
        val idToken = authManager.getIdToken() ?: ""
        val publicKey = cryptoManager.getPublicKeyBase64()

        val registerMsg = JSONObject().apply {
            put("type", "register")
            put("token", idToken)  // ← Include OAuth token
            put("clientType", "android")
            put("deviceId", getDeviceId())
            put("deviceName", getDeviceName())
            put("publicKey", publicKey)
            put("version", BuildConfig.VERSION_NAME)
            put("platform", "android")
            put("arch", Build.SUPPORTED_ABIS[0])
        }

        webSocket.send(registerMsg.toString())
        listener?.onConnected()
    }

    private fun getDeviceId(): String {
        // Generate or retrieve persistent device ID
        return Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ANDROID_ID
        )
    }

    private fun getDeviceName(): String {
        return "${Build.MANUFACTURER} ${Build.MODEL}"
    }

    // ... rest of existing code
}
```

---

## 4. Linux Test Client (TypeScript)

### Dependencies

```bash
cd linux-test-client
npm install google-auth-library open
```

### Implementation Files

#### `linux-test-client/src/oauth/auth.ts` (NEW)

```typescript
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { URL } from 'url';
import open from 'open';

export interface OAuthTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in seconds
}

export class OAuthManager {
  private configDir: string;
  private tokenPath: string;
  private client: OAuth2Client;
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;

    this.configDir = path.join(os.homedir(), '.config', 'utter-client');
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    this.tokenPath = path.join(this.configDir, 'oauth.json');

    this.client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      'http://localhost:3000/oauth/callback'
    );
  }

  /**
   * Get stored tokens or initiate OAuth flow
   */
  async getOrAuthenticate(): Promise<OAuthTokens> {
    // Try to load existing tokens
    if (fs.existsSync(this.tokenPath)) {
      try {
        const tokens = this.loadTokens();
        const now = Math.floor(Date.now() / 1000);

        if (tokens.expiresAt > now + 300) {
          // Token valid for at least 5 more minutes
          console.log('✓ Using cached OAuth token');
          return tokens;
        } else if (tokens.refreshToken) {
          // Try to refresh
          console.log('⟳ Refreshing OAuth token...');
          try {
            const newTokens = await this.refreshToken(tokens.refreshToken);
            this.saveTokens(newTokens);
            return newTokens;
          } catch (e) {
            console.error('⚠ Token refresh failed. Re-authenticating...');
          }
        }
      } catch (e) {
        console.error('⚠ Failed to load tokens. Re-authenticating...');
      }
    }

    // Perform new OAuth flow
    console.log('🔑 Starting Google OAuth authentication...');
    const tokens = await this.browserAuthFlow();
    this.saveTokens(tokens);

    return tokens;
  }

  /**
   * Perform OAuth flow with local HTTP server
   */
  private async browserAuthFlow(): Promise<OAuthTokens> {
    return new Promise((resolve, reject) => {
      let server: http.Server;

      // Create local HTTP server to receive callback
      server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://localhost:3000`);

          if (url.pathname === '/oauth/callback') {
            const code = url.searchParams.get('code');

            if (!code) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end('<h1>Error: No authorization code received</h1>');
              server.close();
              reject(new Error('No authorization code received'));
              return;
            }

            // Exchange code for tokens
            const { tokens } = await this.client.getToken(code);

            if (!tokens.id_token) {
              throw new Error('No ID token received');
            }

            const expiresAt = tokens.expiry_date
              ? Math.floor(tokens.expiry_date / 1000)
              : Math.floor(Date.now() / 1000) + 3600;

            const oauthTokens: OAuthTokens = {
              idToken: tokens.id_token,
              accessToken: tokens.access_token!,
              refreshToken: tokens.refresh_token,
              expiresAt,
            };

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                  <h1>✓ Authentication Successful!</h1>
                  <p>You can close this window and return to the terminal.</p>
                </body>
              </html>
            `);

            server.close();
            resolve(oauthTokens);
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`<h1>Error: ${error.message}</h1>`);
          server.close();
          reject(error);
        }
      });

      server.listen(3000, async () => {
        // Generate auth URL
        const authUrl = this.client.generateAuthUrl({
          access_type: 'offline',
          scope: [
            'openid',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile',
          ],
          prompt: 'consent', // Force consent to get refresh token
        });

        console.log('\n' + '='.repeat(60));
        console.log('📱 Opening browser for Google Sign-In...');
        console.log('\nIf the browser doesn\'t open, visit this URL:');
        console.log(`\n  ${authUrl}\n`);
        console.log('='.repeat(60) + '\n');

        // Open browser
        await open(authUrl);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out'));
      }, 300000);
    });
  }

  /**
   * Refresh token using refresh token
   */
  private async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    this.client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.client.refreshAccessToken();

    if (!credentials.id_token) {
      throw new Error('No ID token in refreshed credentials');
    }

    const expiresAt = credentials.expiry_date
      ? Math.floor(credentials.expiry_date / 1000)
      : Math.floor(Date.now() / 1000) + 3600;

    return {
      idToken: credentials.id_token,
      accessToken: credentials.access_token!,
      refreshToken: credentials.refresh_token || refreshToken,
      expiresAt,
    };
  }

  private loadTokens(): OAuthTokens {
    const json = fs.readFileSync(this.tokenPath, 'utf-8');
    return JSON.parse(json);
  }

  private saveTokens(tokens: OAuthTokens): void {
    const json = JSON.stringify(tokens, null, 2);
    fs.writeFileSync(this.tokenPath, json);

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.tokenPath, 0o600);
    }

    console.log('✓ OAuth tokens saved');
  }

  /**
   * Sign out (delete tokens)
   */
  signOut(): void {
    if (fs.existsSync(this.tokenPath)) {
      fs.unlinkSync(this.tokenPath);
      console.log('✓ Signed out');
    }
  }
}
```

#### Update `linux-test-client/src/index.ts`

```typescript
import { OAuthManager } from './oauth/auth';

// Load config from environment or .env file
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:8080';

class TestClient {
  private oauthManager: OAuthManager;
  private idToken: string = '';

  // ... existing fields

  constructor(serverUrl: string, deviceId: string, deviceName: string) {
    // ... existing initialization

    // Initialize OAuth
    this.oauthManager = new OAuthManager(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  }

  async initialize(): Promise<void> {
    // Authenticate with Google OAuth
    const tokens = await this.oauthManager.getOrAuthenticate();
    this.idToken = tokens.idToken;

    console.log('✓ Authenticated with Google OAuth\n');
  }

  private register(): void {
    const publicKey = this.keyManager.getPublicKeyBase64();

    const registerMsg = {
      type: 'register',
      token: this.idToken,  // ← Include OAuth token
      clientType: 'controller',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      publicKey,
      version: VERSION,
      platform: process.platform,
      arch: process.arch,
    };

    this.send(registerMsg);
  }

  // ... rest of existing code
}

// Main
async function main() {
  // ... existing setup

  const client = new TestClient(SERVER_URL, deviceId, deviceName);

  // Initialize OAuth before starting
  await client.initialize();

  client.startREPL();

  try {
    await client.connect();
  } catch (error) {
    // Will auto-reconnect
  }
}

main().catch(console.error);
```

---

# Phase-by-Phase Rollout

## Phase 1: Google Cloud Setup (30 minutes)

**Tasks:**
1. Create Google Cloud Project
2. Enable Google OAuth 2.0 API
3. Create OAuth 2.0 credentials:
   - Web application client (for linux-test-client)
   - Desktop application client (for utterd)
   - Android client (with SHA-1 fingerprint)
4. Configure OAuth consent screen
5. Add test users (during development)

**Deliverables:**
- `GOOGLE_CLIENT_ID` for each platform
- `GOOGLE_CLIENT_SECRET` (for web/desktop clients)
- `google-services.json` (for Android)

---

## Phase 2: Relay Server Implementation (2-3 hours)

**Tasks:**
1. Install dependencies (`google-auth-library`)
2. Create `src/auth.ts` with token verification
3. Update `handleRegister()` to verify tokens
4. Add test mode support for development
5. Update environment variables
6. Test token verification

**Testing:**
```bash
# Test with mock token
curl -X POST http://localhost:8080/api/verify-token \
  -H "Content-Type: application/json" \
  -d '{"token": "test-token"}'
```

**Success Criteria:**
- Server verifies valid tokens
- Server rejects invalid tokens
- Test mode works for development

---

## Phase 3: Linux Test Client (TypeScript) (2-3 hours)

**Tasks:**
1. Install dependencies (`google-auth-library`, `open`)
2. Create `src/oauth/auth.ts` with OAuth manager
3. Update `src/index.ts` to include OAuth
4. Add `.env` for configuration
5. Test OAuth flow

**Testing:**
```bash
# Set environment variables
export GOOGLE_CLIENT_ID=your-client-id
export GOOGLE_CLIENT_SECRET=your-client-secret

# Run client
pnpm start

# Should open browser for OAuth
# After signing in, should connect successfully
```

**Success Criteria:**
- OAuth flow opens browser
- Token stored in `~/.config/utter-client/oauth.json`
- Client connects with verified token
- Token refresh works

---

## Phase 4: utterd (Rust) Implementation (3-4 hours)

**Tasks:**
1. Add OAuth dependencies to `Cargo.toml`
2. Create `src/oauth/mod.rs` with OAuth manager
3. Implement device authorization flow
4. Update `src/main.rs` to include OAuth
5. Add environment variable configuration
6. Test OAuth flow

**Testing:**
```bash
# Set environment variable
export GOOGLE_CLIENT_ID=your-client-id

# Run utterd
./utterd

# Should display URL and device code
# After signing in, should connect successfully
```

**Success Criteria:**
- Device auth flow displays URL + code
- User can sign in via browser
- Token stored in `~/.config/utterd/oauth.json`
- Client connects with verified token
- Token refresh works

---

## Phase 5: Android App Implementation (3-4 hours)

**Tasks:**
1. Add Google Sign-In dependencies
2. Add `google-services.json`
3. Create `GoogleAuthManager.kt`
4. Create `SignInActivity.kt`
5. Update `WebSocketClient.kt` to include token
6. Update app flow to require sign-in
7. Test OAuth flow

**Testing:**
1. Install app on device/emulator
2. Open app → See Sign In screen
3. Tap "Sign in with Google"
4. Select Google account
5. App connects to relay server
6. Check server logs for verified user_id

**Success Criteria:**
- Sign-in flow works on Android
- ID token sent to relay server
- Server verifies token successfully
- App connects and sends messages
- Token persists across app restarts

---

## Phase 6: End-to-End Testing (2-3 hours)

**Test Scenarios:**

### Scenario 1: Full Flow
```
1. Android: Sign in with Google → you@gmail.com
2. utterd: Sign in with Google → you@gmail.com
3. Android: Fetch device list → See utterd device
4. Android: Send encrypted message
5. utterd: Receive and decrypt message
6. Verify: Message types correctly on Linux
```

### Scenario 2: Multi-Device
```
1. Sign in on multiple devices (same account)
2. Verify all appear in device list
3. Send messages between different combinations
4. All devices can communicate
```

### Scenario 3: Token Expiry
```
1. Sign in and connect
2. Wait for token to expire (or manually edit expiry time)
3. Verify automatic token refresh works
4. Connection maintained without re-auth
```

### Scenario 4: Invalid Token
```
1. Sign in successfully
2. Manually corrupt token in storage
3. Restart client
4. Verify re-authentication required
```

### Scenario 5: Different Accounts
```
1. Sign in Android with user1@gmail.com
2. Sign in utterd with user2@gmail.com
3. Verify devices do NOT appear in each other's lists
4. Verify messages cannot be sent between accounts
```

---

# Migration & Backward Compatibility

## Test Mode for Development

During development, allow running without OAuth:

**Relay Server `.env`:**
```bash
ALLOW_TEST_MODE=true  # Enable test mode
```

**Client behavior:**
- If `ALLOW_TEST_MODE=true` on server:
  - Clients can omit `token` field
  - Server uses `userId = 'test-user'`
  - Logs warning about test mode
- If `ALLOW_TEST_MODE=false` (production):
  - Clients MUST provide valid `token`
  - Server rejects registration without token

## Gradual Rollout Strategy

### Step 1: Deploy Server Update
- Update relay server with OAuth verification
- Enable test mode initially
- Deploy to production
- Existing clients continue working (test mode)

### Step 2: Update Clients (One at a Time)
- Update linux-test-client → Test → Deploy
- Update utterd → Test → Deploy
- Update Android app → Test → Release

### Step 3: Disable Test Mode
- Once all clients updated
- Set `ALLOW_TEST_MODE=false`
- OAuth now required for all connections

---

# Security Considerations

## Token Storage

| Platform | Storage Method | Security |
|----------|---------------|----------|
| **Android** | Android KeyStore | Hardware-backed encryption |
| **utterd (Rust)** | `~/.config/utterd/oauth.json` (0600 perms) | File permissions |
| **linux-test-client (TS)** | `~/.config/utter-client/oauth.json` (0600) | File permissions |

**Future Improvement (Linux):**
- Encrypt token files with device password
- Use system keyring (libsecret, gnome-keyring)

## Token Lifecycle

1. **Acquisition:** User signs in → Client receives ID token
2. **Storage:** Token stored securely on device
3. **Usage:** Token sent to relay server on registration
4. **Verification:** Server verifies with Google OAuth API
5. **Refresh:** Access token refreshed before expiry (using refresh token)
6. **Revocation:** User can sign out → Token deleted

## OAuth Scopes

Request minimal scopes:
```
- openid (user ID)
- email (user email)
- profile (user name, picture - optional)
```

**Do NOT request:**
- Gmail access
- Drive access
- Calendar access
- Any unnecessary permissions

---

# Troubleshooting

## Common Issues

### Issue: "OAuth verification failed"

**Cause:** Invalid or expired token

**Solution:**
1. Delete token file:
   - utterd: `rm ~/.config/utterd/oauth.json`
   - linux-test-client: `rm ~/.config/utter-client/oauth.json`
   - Android: Clear app data
2. Restart client → Re-authenticate

### Issue: "Token refresh failed"

**Cause:** Refresh token expired or revoked

**Solution:**
1. Delete token file
2. Re-authenticate (full OAuth flow)

### Issue: Android sign-in fails

**Possible Causes:**
1. SHA-1 fingerprint not added to Google Cloud Console
2. `google-services.json` missing or incorrect
3. Package name mismatch

**Solution:**
1. Get SHA-1: `./gradlew signingReport`
2. Add to Google Cloud Console → OAuth 2.0 Client
3. Re-download `google-services.json`
4. Verify package name matches

### Issue: "Email not verified"

**Cause:** User's Google account email not verified

**Solution:**
1. User must verify email with Google
2. OR: Remove email_verified check (less secure)

---

# References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android/start)
- [OAuth 2.0 Device Flow](https://developers.google.com/identity/protocols/oauth2/limited-input-device)
- [google-auth-library (Node.js)](https://github.com/googleapis/google-auth-library-nodejs)
- [oauth2-rs (Rust)](https://github.com/ramosbugs/oauth2-rs)
- [Token Verification](https://developers.google.com/identity/sign-in/web/backend-auth)

---

## Appendix: Environment Variables

### Relay Server (`.env`)
```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
PORT=8080
NODE_ENV=production
ALLOW_TEST_MODE=false
```

### utterd
```bash
GOOGLE_CLIENT_ID=your-desktop-client-id.apps.googleusercontent.com
SERVER_URL=ws://localhost:8080
```

### linux-test-client (`.env`)
```bash
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
SERVER_URL=ws://localhost:8080
```

### Android (`strings.xml`)
```xml
<resources>
    <string name="google_client_id">your-android-client-id.apps.googleusercontent.com</string>
</resources>
```
