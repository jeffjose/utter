# JWT Authentication for Relay Server

## Overview

The relay server uses JWT (JSON Web Tokens) to authenticate clients and ensure multi-user device isolation without requiring OAuth verification on every WebSocket connection.

## Architecture

The relay server acts as both:
1. **Auth Server** - Issues JWTs after verifying OAuth tokens
2. **Relay Server** - Verifies JWTs on WebSocket connections

## Authentication Flow

```
┌─────────┐                 ┌──────────┐                ┌─────────────┐
│ Client  │                 │  Relay   │                │   Google    │
│(utterd) │                 │  Server  │                │    OAuth    │
└────┬────┘                 └────┬─────┘                └──────┬──────┘
     │                           │                             │
     │  1. OAuth Login           │                             │
     ├──────────────────────────────────────────────────────────>
     │                           │                             │
     │  2. OAuth Token           │                             │
     <──────────────────────────────────────────────────────────┤
     │                           │                             │
     │  3. POST /auth            │                             │
     │     (OAuth token)         │                             │
     ├──────────────────────────>│                             │
     │                           │                             │
     │                           │  4. Verify OAuth Token      │
     │                           ├────────────────────────────>│
     │                           │                             │
     │                           │  5. User Info (email)       │
     │                           <────────────────────────────┤
     │                           │                             │
     │                           │  6. Create & Sign JWT       │
     │                           │     {userId: "user@email"}  │
     │                           │                             │
     │  7. JWT Response          │                             │
     <──────────────────────────┤                             │
     │                           │                             │
     │  8. WebSocket Connect     │                             │
     │     (with JWT)            │                             │
     ├──────────────────────────>│                             │
     │                           │                             │
     │                           │  9. Verify JWT Signature    │
     │                           │     (cryptographic, fast)   │
     │                           │                             │
     │  10. Registered           │                             │
     │      (userId from JWT)    │                             │
     <──────────────────────────┤                             │
     │                           │                             │
```

## Benefits

### Security
- **No Impersonation**: Clients cannot forge JWTs without the server's signing key
- **User Isolation**: userId is cryptographically verified, ensuring User1 cannot see User2's devices
- **Token Expiry**: JWTs can have expiration times (24hr, 7 days, etc.)

### Performance
- **One OAuth Verification**: OAuth verification happens once when obtaining JWT
- **Fast WebSocket Auth**: JWT signature verification is cryptographic (no API calls)
- **Reconnection Friendly**: Same JWT can be reused until expiry
- **Scalable**: 100 devices = 1 Google API call + 100 fast signature checks

### Architecture
- **Single Server**: No need for separate auth infrastructure
- **Relay Independence**: Relay doesn't depend on Google for every connection
- **User-Agnostic Relay**: Relay server itself has no user accounts
- **E2E Encryption**: Combined with public key encryption for message content

## Implementation Details

### JWT Payload Structure

```json
{
  "userId": "user@gmail.com",
  "iat": 1234567890,
  "exp": 1234654290
}
```

### HTTP Auth Endpoint

**Request:**
```http
POST /auth
Content-Type: application/json

{
  "token": "google-oauth-token-here"
}
```

**Response:**
```http
200 OK
Content-Type: application/json

{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400
}
```

### WebSocket Registration

**Client sends:**
```json
{
  "type": "register",
  "clientType": "target",
  "deviceId": "nomad",
  "deviceName": "nomad",
  "publicKey": "base64-encoded-key",
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "version": "utterd v0.1.0",
  "platform": "Ubuntu 22.04.5 LTS",
  "arch": "x86_64"
}
```

**Relay extracts userId from verified JWT and uses it for:**
- Device list filtering (`get_devices` returns only same-user devices)
- Message routing (only route to devices with same userId)
- Connection grouping

## Security Properties

### What JWT Prevents
✓ User impersonation (can't forge signature)
✓ Device list leakage (User1 can't see User2's devices)
✓ Cross-user messaging (User1 can't message User2's devices)
✓ Replay attacks (JWT expiry)

### What E2E Encryption Adds
✓ Message content privacy (relay can't read messages)
✓ End-to-end authenticity (signature verification)
✓ Protection even if relay is compromised

## Comparison with Previous Approach

### Before JWT (What We Removed)
```
Every WebSocket connection:
  1. Client sends OAuth token
  2. Relay verifies with Google
  3. Extract userId
  4. Register client

Problems:
  - Google API call on every connection
  - Reconnections = more API calls
  - Slow, not scalable
```

### With JWT (Proposed)
```
Initial auth:
  1. Client sends OAuth token to /auth
  2. Relay verifies with Google ONCE
  3. Relay issues signed JWT

Every WebSocket connection:
  1. Client sends JWT
  2. Relay verifies signature (fast, offline)
  3. Extract userId from JWT
  4. Register client

Advantages:
  - One Google API call per session
  - Fast reconnections
  - Offline signature verification
  - Same security guarantees
```

## Privacy Model

### Device Metadata Protected by JWT
- Device list (only see your own devices)
- Device names
- Device types (target/controller)
- Online/offline status
- Public keys

### Message Content Protected by E2E
- Message text
- Commands
- Any application data

### Defense in Depth
1. **JWT** prevents wrong users from seeing devices
2. **E2E Encryption** prevents relay from reading messages
3. **Public Key Crypto** ensures end-to-end authenticity

Even if JWT is compromised, E2E encryption protects message content.
Even if relay is compromised, E2E encryption protects message content.

## Token Management

### JWT Lifetime
- Recommended: 24 hours for active sessions
- Can be shorter for high-security environments
- Can be longer for convenience

### Token Refresh
- Client can request new JWT before expiry
- No need to re-authenticate with Google if old JWT is still valid
- Or: require new OAuth authentication for refresh (more secure)

### Token Revocation
- For immediate revocation: maintain token blacklist
- Or: use short-lived JWTs and don't implement refresh
- Trade-off: security vs. convenience

## Implementation Guide

### Dependencies

**Required npm packages:**
```bash
# Production dependencies
pnpm add jsonwebtoken express

# Development dependencies
pnpm add -D @types/jsonwebtoken @types/express
```

### Environment Variables

Add to `.env` file:
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# JWT Configuration
JWT_SECRET=generate-a-secure-random-string-at-least-32-chars
JWT_EXPIRATION=24h

# Server Configuration
PORT=8080
MAX_MESSAGE_LENGTH=5000
```

**Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### JWT Library Configuration

**Using jsonwebtoken:**
- Algorithm: HS256 (HMAC with SHA-256)
- Default expiration: 24 hours
- Payload: `{ userId: email }`

### HTTP Endpoints

#### POST /auth

Exchanges Google OAuth token for JWT.

**Request:**
```http
POST /auth
Content-Type: application/json

{
  "token": "google-oauth-id-token-here"
}
```

**Success Response (200 OK):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "userId": "user@gmail.com"
}
```

**Error Responses:**

**400 Bad Request** - Missing token:
```json
{
  "error": "Missing token in request body"
}
```

**401 Unauthorized** - Invalid Google token:
```json
{
  "error": "Token verification failed: invalid signature"
}
```

**401 Unauthorized** - Email not verified:
```json
{
  "error": "Token verification failed: Email not verified"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Internal server error"
}
```

#### GET /health

Health check endpoint.

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": 1234567890
}
```

### WebSocket Authentication

**Client Registration with JWT:**
```json
{
  "type": "register",
  "clientType": "target",
  "deviceId": "nomad",
  "deviceName": "nomad",
  "publicKey": "base64-encoded-key",
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "version": "utterd v0.1.0",
  "platform": "Ubuntu 22.04.5 LTS",
  "arch": "x86_64"
}
```

**Server Response on Success:**
```json
{
  "type": "registered",
  "clientId": "xyz123",
  "deviceId": "nomad",
  "clientType": "target",
  "userId": "user@gmail.com",
  "timestamp": 1234567890
}
```

**Server Error Responses:**

**Missing JWT:**
```json
{
  "type": "error",
  "message": "JWT required for authentication",
  "timestamp": 1234567890
}
```

**Invalid JWT:**
```json
{
  "type": "error",
  "message": "Invalid JWT: jwt malformed",
  "timestamp": 1234567890
}
```

**Expired JWT:**
```json
{
  "type": "error",
  "message": "JWT expired. Please obtain a new token.",
  "timestamp": 1234567890
}
```

### JWT Enforcement

**JWT is REQUIRED** - All connections must authenticate with a valid JWT. There is no legacy/unauthenticated mode.

**Why enforce JWT:**
- Security first: No reason to allow unauthenticated connections
- User isolation: Prevent users from seeing other users' devices
- Simpler codebase: No dual-mode complexity
- Clear contract: Clients know exactly what's required

### Server Architecture

The relay server runs both HTTP and WebSocket on the same port:

```typescript
// HTTP server for /auth endpoint
const httpServer = http.createServer(app);

// WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server: httpServer });

// Listen on single port
httpServer.listen(PORT);
```

**Endpoint Summary:**
- `POST /auth` - Obtain JWT from Google OAuth token
- `POST /auth/refresh` - Refresh JWT before expiration
- `GET /health` - Health check
- `ws://host:port/` - WebSocket connection (requires JWT in register message)

## Token Refresh

### Why Token Refresh?

Short-lived JWTs improve security but require refresh mechanism:
- **Access Token (JWT)**: Short-lived (1 hour), used for WebSocket connections
- **Refresh Token**: Long-lived (7 days), stored securely, used to obtain new JWT

### Refresh Flow

```
Client has expired/expiring JWT → POST /auth/refresh with current JWT
                                 ↓
                       Server validates JWT payload
                       (signature may be expired, that's OK)
                                 ↓
                       Check JWT exp is < 24 hours old
                                 ↓
                       Issue new JWT with fresh exp
                                 ↓
                       Return new JWT to client
```

### POST /auth/refresh Endpoint

**Request:**
```http
POST /auth/refresh
Content-Type: application/json

{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Success Response (200 OK):**
```json
{
  "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "userId": "user@gmail.com"
}
```

**Error Responses:**

**400 Bad Request** - Missing JWT:
```json
{
  "error": "Missing jwt in request body"
}
```

**401 Unauthorized** - JWT too old:
```json
{
  "error": "JWT expired more than 24 hours ago. Please re-authenticate."
}
```

**401 Unauthorized** - Invalid JWT:
```json
{
  "error": "Invalid JWT: cannot decode payload"
}
```

### Client Refresh Strategy

**Proactive Refresh:**
- Check JWT expiration on startup
- If exp < 5 minutes, refresh before connecting
- Avoids mid-connection expiration

**Implementation:**
```typescript
async function ensureFreshJWT(jwt: string): Promise<string> {
  const payload = decodeJWT(jwt); // decode without verification
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = payload.exp - now;

  if (timeUntilExpiry < 300) { // Less than 5 minutes
    return await refreshJWT(jwt);
  }

  return jwt;
}
```

## Utterd (Rust) Integration

### Overview

The Rust daemon (utterd) must be updated to support JWT authentication:

1. **On startup**: Load or obtain JWT
2. **Before WebSocket**: Ensure JWT is fresh (refresh if needed)
3. **On registration**: Include JWT in register message
4. **On error**: Handle JWT rejection, re-authenticate if needed

### Required Changes

**File: `utterd/src/auth.rs`** (new file)

```rust
use serde::{Deserialize, Serialize};
use reqwest;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize, Deserialize)]
pub struct JWTPayload {
    pub user_id: String,
    pub iat: u64,
    pub exp: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AuthResponse {
    pub jwt: String,
    pub expires_in: u64,
    pub user_id: String,
}

pub async fn exchange_for_jwt(
    auth_url: &str,
    oauth_token: &str
) -> Result<AuthResponse, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth", auth_url))
        .json(&serde_json::json!({ "token": oauth_token }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        return Err(format!("JWT exchange failed: {}", error["error"]).into());
    }

    let auth_resp: AuthResponse = response.json().await?;
    Ok(auth_resp)
}

pub async fn refresh_jwt(
    auth_url: &str,
    current_jwt: &str
) -> Result<AuthResponse, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client
        .post(format!("{}/auth/refresh", auth_url))
        .json(&serde_json::json!({ "jwt": current_jwt }))
        .send()
        .await?;

    if !response.status().is_success() {
        let error: serde_json::Value = response.json().await?;
        return Err(format!("JWT refresh failed: {}", error["error"]).into());
    }

    let auth_resp: AuthResponse = response.json().await?;
    Ok(auth_resp)
}

pub fn decode_jwt_payload(jwt: &str) -> Result<JWTPayload, Box<dyn std::error::Error>> {
    let parts: Vec<&str> = jwt.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT format".into());
    }

    let payload_b64 = parts[1];
    let payload_json = base64::decode(payload_b64)?;
    let payload: JWTPayload = serde_json::from_slice(&payload_json)?;

    Ok(payload)
}

pub fn is_jwt_expiring_soon(jwt: &str, threshold_seconds: u64) -> bool {
    match decode_jwt_payload(jwt) {
        Ok(payload) => {
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs();
            let time_until_expiry = payload.exp.saturating_sub(now);
            time_until_expiry < threshold_seconds
        }
        Err(_) => true, // If we can't decode, assume expired
    }
}
```

**File: `utterd/src/websocket.rs`** (update registration)

```rust
// Add jwt field to RegisterMessage
#[derive(Debug, Serialize)]
struct RegisterMessage {
    r#type: String,
    client_type: String,
    device_id: String,
    device_name: String,
    public_key: String,
    jwt: String,  // Add this
    version: String,
    platform: String,
    arch: String,
}

// Update register function
pub async fn register(
    ws: &mut WebSocket,
    config: &Config,
    jwt: &str
) -> Result<(), Box<dyn std::error::Error>> {
    let register_msg = RegisterMessage {
        r#type: "register".to_string(),
        client_type: "target".to_string(),
        device_id: config.device_id.clone(),
        device_name: config.device_name.clone(),
        public_key: config.public_key.clone(),
        jwt: jwt.to_string(),  // Include JWT
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: get_platform_info(),
        arch: std::env::consts::ARCH.to_string(),
    };

    let msg = serde_json::to_string(&register_msg)?;
    ws.send(Message::Text(msg)).await?;

    Ok(())
}
```

**File: `utterd/src/main.rs`** (update main flow)

```rust
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // ... existing setup ...

    // 1. Get OAuth token from Google
    let oauth_token = oauth::authenticate(&config).await?;

    // 2. Exchange for JWT
    let auth_url = config.relay_server.replace("ws://", "http://");
    let mut auth_response = auth::exchange_for_jwt(&auth_url, &oauth_token).await?;
    println!("✓ JWT obtained for {}", auth_response.user_id);

    loop {
        // 3. Check if JWT needs refresh before connecting
        if auth::is_jwt_expiring_soon(&auth_response.jwt, 300) {
            println!("↻ Refreshing JWT...");
            auth_response = auth::refresh_jwt(&auth_url, &auth_response.jwt).await?;
            println!("✓ JWT refreshed");
        }

        // 4. Connect with fresh JWT
        let mut ws = websocket::connect(&config.relay_server).await?;
        websocket::register(&mut ws, &config, &auth_response.jwt).await?;

        // ... existing message handling ...

        // On disconnect, loop will refresh JWT if needed and reconnect
    }
}
```

**File: `utterd/Cargo.toml`** (add dependencies)

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
base64 = "0.21"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.20"
```

### Testing Utterd Changes

```bash
# Build utterd with JWT support
cd utterd
cargo build --release

# Run with OAuth credentials
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
./target/release/utterd

# Expected output:
# ✓ OAuth authentication successful
# ✓ JWT obtained for user@gmail.com
# ✓ Connected to relay server
# ✓ Registered as target device
```

## Implementation Checklist

- [x] Phase 1: Dual mode (JWT optional)
- [ ] Phase 2: JWT Required
  - [ ] Generate and set JWT_SECRET in .env
  - [ ] Remove REQUIRE_JWT flag from code
  - [ ] Add POST /auth/refresh endpoint
  - [ ] Update relay server to always require JWT
  - [ ] Update linux-test-client for token refresh
  - [ ] Update utterd (Rust) for JWT support
  - [ ] Test all components with enforced JWT
- [ ] Phase 3: Advanced Features
  - [ ] Multi-provider OAuth (GitHub, Microsoft)
  - [ ] Custom JWT claims (device limits, features)
  - [ ] Token revocation blacklist

## Future Enhancements

### Multi-Provider Auth
- JWT approach allows multiple OAuth providers
- Google, GitHub, Microsoft, etc.
- All issue JWTs with same structure
- userId becomes provider-prefixed (e.g., "google:user@gmail.com")

### Custom Claims
- Add device limits per user: `maxDevices: 10`
- Add feature flags: `features: ["encryption", "voice"]`
- Add subscription tiers: `tier: "pro"`

### Token Revocation
- Maintain in-memory blacklist of revoked JWTs
- POST /auth/revoke endpoint
- Short-lived JWTs minimize revocation window
