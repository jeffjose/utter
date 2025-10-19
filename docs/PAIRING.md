# Device Pairing Architecture

## Overview

Utter uses a two-layer security model for device pairing:

1. **User Authentication** (Google OAuth) - Identifies the account owner
2. **Device Pairing** (QR Code) - Links specific devices to that account

This approach provides both security (only your devices can connect) and convenience (no PIN typing required).

---

## Two-Layer Security Model

### Layer 1: User Identity (Google OAuth)
**Question:** "Who are you?"

Both Linux client and Android app authenticate with Google to prove account ownership.

### Layer 2: Device Pairing (QR Code)
**Question:** "Which devices belong to you?"

Devices under the same Google account are paired using a one-time QR code for quick, secure linking.

---

## Pairing Flow

### Step 1: Authenticate User (Google OAuth)

#### Linux Client:
```
┌─────────────────────────────────┐
│  Welcome to Utter!              │
│                                 │
│  [Sign in with Google]          │ ← Opens browser
└─────────────────────────────────┘
    ↓
Browser opens → User logs into Google
    ↓
Linux gets: access_token + user_id (you@gmail.com)
    ↓
Sends to relay server
```

**Server receives:**
```json
{
  "type": "authenticate",
  "token": "google_oauth_token",
  "device_type": "linux",
  "device_id": "linux-laptop-001"
}
```

#### Android App:
```
┌─────────────────────────────────┐
│  Welcome to Utter!              │
│                                 │
│  [Sign in with Google]          │ ← Native OAuth
└─────────────────────────────────┘
    ↓
Android OAuth (Google Play Services)
    ↓
Android gets: access_token + user_id (you@gmail.com)
    ↓
Sends to relay server
```

**Server receives:**
```json
{
  "type": "authenticate",
  "token": "google_oauth_token",
  "device_type": "android",
  "device_id": "android-phone-001"
}
```

**Relay Server:**
- Verifies token with Google
- Extracts `user_id` (email)
- Registers device as belonging to that user
- Stores: `{device_id, user_id, device_type, connection_status}`

---

### Step 2: Pair Devices (QR Code)

#### Linux Client Generates QR:
```
┌─────────────────────────────────┐
│  Signed in as: you@gmail.com    │
│                                 │
│  Pair Android Device:           │
│  ┌─────────────────┐            │
│  │  ███  ████  ███ │            │
│  │  ████  ██  ████ │            │
│  │  ███  ████  ███ │            │
│  └─────────────────┘            │
│                                 │
│  Code expires in: 4:58          │
└─────────────────────────────────┘
```

**QR Code contains:**
```json
{
  "pairing_token": "abc123xyz",
  "user_id": "you@gmail.com",
  "device_id": "linux-laptop-001",
  "expires_at": 1697654400,
  "server_url": "wss://relay.utter.app"
}
```

**Linux sends to server:**
```json
{
  "type": "init_pairing",
  "pairing_token": "abc123xyz",
  "ttl": 300
}
```

#### Android Scans QR:
```
┌─────────────────────────────────┐
│  Signed in as: you@gmail.com    │
│                                 │
│  [Scan QR Code to Pair]         │ ← Opens camera
└─────────────────────────────────┘
    ↓
Scans QR code → Extracts pairing_token
    ↓
Sends to relay server
```

**Android sends to server:**
```json
{
  "type": "complete_pairing",
  "pairing_token": "abc123xyz"
}
```

**Relay Server:**
1. Verifies Android's `user_id` matches QR's `user_id`
2. Checks token not expired
3. Checks token not already used
4. Creates session linking the two devices
5. Marks token as used (one-time only)

**Server broadcasts to both devices:**
```json
{
  "type": "paired",
  "session_id": "sess_xyz789",
  "paired_device": {
    "device_id": "...",
    "device_type": "...",
    "name": "Pixel 7"
  }
}
```

---

## Security Properties

### Against Random Attacker

**Scenario:** Attacker sees your QR code on screen

```
Attacker scans QR with their phone
    ↓
Attacker's Google account: attacker@evil.com
Your QR user_id: you@gmail.com
    ↓
Server checks: attacker@evil.com ≠ you@gmail.com
    ↓
❌ Pairing rejected: "User mismatch"
```

### Against Account Hijacker

**Scenario:** Attacker has your Google password

```
Attacker logs into their device with your Google account
    ↓
Attacker's device now authenticated as: you@gmail.com
    ↓
But attacker doesn't have QR code (it's on your screen)
    ↓
Can't complete pairing without scanning QR
    ↓
⚠️ You'd see unauthorized device in account dashboard
```

### Against Token Replay

**Scenario:** Attacker intercepts QR code data

```
Attacker saves QR data for later
    ↓
You complete pairing (token gets marked as used)
    ↓
Attacker tries to use saved QR data
    ↓
Server checks: Token already used
    ↓
❌ Pairing rejected: "Token already consumed"
```

### Against Token Theft

**Scenario:** Attacker steals pairing token before you scan

```
QR displayed at: 10:00:00
Token expires at: 10:05:00
    ↓
At 10:06:00, attacker tries to use token
    ↓
Server checks: Current time > expires_at
    ↓
❌ Pairing rejected: "Token expired"
```

---

## Data Flow

### Complete Message Flow:

```
┌──────────────────────────────────────────────────────────┐
│ 1. AUTHENTICATE                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Linux: Sign in with Google                             │
│         ↓                                                │
│  Server: "Linux device for you@gmail.com registered"    │
│                                                          │
│  Android: Sign in with Google                           │
│           ↓                                              │
│  Server: "Android device for you@gmail.com registered"  │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 2. PAIR DEVICES                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Linux: Generate pairing token → Display QR             │
│         ↓                                                │
│  Server: Store pending pairing (token, user_id)         │
│                                                          │
│  Android: Scan QR → Extract token                       │
│           ↓                                              │
│  Server: Verify user_id matches                         │
│          Create session                                  │
│          ↓                                               │
│  ✅ Both devices: "Paired successfully"                 │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 3. USE                                                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Android: Speak → Text sent to session                  │
│                                                          │
│  Server: Find paired Linux device in same session       │
│          Route message                                   │
│                                                          │
│  Linux: Receive → Simulate keyboard input               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Server Data Model

### Collections:

#### Users
```typescript
interface User {
  user_id: string;        // Google account email
  created_at: Date;
  last_seen: Date;
}
```

#### Devices
```typescript
interface Device {
  device_id: string;      // Unique device identifier
  user_id: string;        // Owner's Google account
  device_type: 'linux' | 'android';
  device_name: string;    // User-friendly name
  connection_status: 'online' | 'offline';
  last_connected: Date;
  created_at: Date;
}
```

#### Sessions
```typescript
interface Session {
  session_id: string;
  user_id: string;
  linux_device_id: string;
  android_device_id: string;
  created_at: Date;
  last_active: Date;
}
```

#### Pairing Tokens (Temporary)
```typescript
interface PairingToken {
  token: string;
  user_id: string;
  initiating_device_id: string;
  expires_at: Date;
  used: boolean;
}
```

---

## Implementation Components

### Relay Server (Node.js + TypeScript)

**Dependencies:**
```json
{
  "google-auth-library": "^9.0.0",
  "ws": "^8.14.0",
  "dotenv": "^16.3.0"
}
```

**Key Modules:**
- `auth.ts` - Google OAuth token verification
- `pairing.ts` - QR token generation and validation
- `sessions.ts` - Device session management
- `routes.ts` - Message routing logic

### Linux Client (Python)

**Dependencies:**
```txt
google-auth-oauthlib==1.1.0
qrcode==7.4.2
websockets==12.0
```

**Key Modules:**
- `auth.py` - Google OAuth flow (browser-based)
- `pairing.py` - QR code generation and display
- `client.py` - WebSocket connection and message handling

### Android App (Kotlin)

**Dependencies:**
```kotlin
// build.gradle
implementation 'com.google.android.gms:play-services-auth:20.7.0'
implementation 'com.google.zxing:core:3.5.2'
implementation 'com.journeyapps:zxing-android-embedded:4.3.0'
implementation 'com.squareup.okhttp3:okhttp:4.12.0'
```

**Key Components:**
- `GoogleAuthActivity.kt` - Google Sign-In
- `QRScanActivity.kt` - QR code scanning
- `WebSocketClient.kt` - Server communication

---

## Benefits Over PIN Approach

| Feature | PIN-Based | Google OAuth + QR |
|---------|-----------|-------------------|
| **Typing required** | ❌ 6 digits to type | ✅ Zero typing |
| **Pairing speed** | ~30 seconds | ~5 seconds |
| **Multi-device support** | Manual re-pair each | Auto-recognizes account |
| **Device management** | No central view | Web dashboard |
| **Revocation** | Manual unlink | Revoke from account settings |
| **Security** | PIN could be guessed | Google auth required |
| **Proximity check** | ❌ PIN can be shared remotely | ✅ Must scan QR on screen |
| **One-time use** | PIN can be reused | ✅ Token single-use |
| **Offline pairing** | ✅ Works offline | ❌ Requires internet |
| **Privacy** | ✅ Server blind to identity | ⚠️ Server knows Google account |

---

## Future Enhancements

### Phase 3: UX Improvements
- Auto-reconnect with saved session
- Push notifications for pairing requests
- Device nicknames (e.g., "Work Laptop", "Personal Phone")
- Multiple simultaneous sessions

### Phase 4: Enhanced Security
- End-to-end encryption (E2EE) using session keys
- Public key exchange during pairing
- Server becomes zero-knowledge relay
- Perfect forward secrecy

### Phase 5: Advanced Features
- NFC pairing as alternative to QR
- Bluetooth Low Energy (BLE) for local pairing
- Device trust levels (e.g., "Always allow" vs "Ask each time")
- Geofencing (only allow pairing in trusted locations)

---

## Alternatives Considered

### 1. PIN-Based Pairing
**Pros:** Works offline, more private
**Cons:** Requires typing, slower, no multi-device management
**Decision:** Rejected in favor of better UX

### 2. NFC Pairing
**Pros:** Very fast, tap-to-pair
**Cons:** Requires NFC hardware, Linux support limited
**Decision:** Possible future addition

### 3. Bluetooth Pairing
**Pros:** Works offline, no typing
**Cons:** Range limited, complex implementation
**Decision:** QR code simpler to implement

### 4. Email-Based Pairing
**Pros:** Familiar flow
**Cons:** Slow (email delivery), requires email client
**Decision:** QR code faster and more secure

---

## Privacy Considerations

### What the Server Knows:
- ✅ Your Google account email
- ✅ Which devices belong to you
- ✅ When devices are online/offline
- ✅ Message metadata (timestamp, length)
- ✅ Message content (plaintext until Phase 4 E2EE)

### What the Server Doesn't Know (Future with E2EE):
- ❌ Actual text content (encrypted)
- ❌ Your Google password (OAuth token only)
- ❌ Private keys (stored locally on devices)

### Recommendations:
- Self-host relay server for maximum privacy
- Or use E2EE in Phase 4 for hosted solution
- Regularly audit paired devices in dashboard
- Revoke access for lost/stolen devices immediately

---

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android)
- [Google Auth Library for Python](https://google-auth.readthedocs.io/)
- [QR Code Security Best Practices](https://owasp.org/www-community/vulnerabilities/QR_Code)
- [WebSocket Security](https://datatracker.ietf.org/doc/html/rfc6455#section-10)
