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

## Future Enhancements

### Multi-Provider Auth
- JWT approach allows multiple OAuth providers
- Google, GitHub, Microsoft, etc.
- All issue JWTs with same structure

### Custom Claims
- Add device limits per user
- Add feature flags
- Add subscription tiers

### Refresh Tokens
- Long-lived refresh token (encrypted, stored securely)
- Short-lived access JWT
- Standard OAuth 2.0 pattern
