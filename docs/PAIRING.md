# Device Pairing Architecture

## Overview

Utter uses a simplified single-layer security model based on Google OAuth, similar to Tailscale:

1. **User Authentication** (Google OAuth) - Identifies the account owner
2. **Trusted Pool** - All devices under same account can communicate
3. **Target Selection** - User explicitly selects destination device
4. **End-to-End Encryption** - Hybrid encryption (DH + AES) for message security

This approach provides both security and convenience with minimal setup time.

---

## Security Model

### Single-Layer Authentication (Google OAuth)
**Question:** "Who are you?"

All devices (Linux clients, Android apps) authenticate with Google OAuth to prove account ownership.

**Result:** All authenticated devices belong to a "trusted pool" under that Google account.

### Target Selection
**Question:** "Where should this message go?"

The Android app user explicitly selects which Linux device to send messages to from a dropdown list.

### End-to-End Encryption
**Question:** "How do we keep messages private?"

Messages are encrypted using hybrid encryption (Diffie-Hellman key exchange + AES-256), ensuring the relay server cannot read message content.

---

## Simplified Pairing Flow

### Step 1: Device Registration

#### Linux Client/Server:
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
Generates Ed25519 key pair (for E2EE)
    ↓
Sends to relay server
```

**Server receives:**
```json
{
  "type": "register",
  "token": "google_oauth_token",
  "device_type": "linux",
  "device_id": "linux-work-laptop",
  "device_name": "Work Laptop",
  "public_key": "ed25519_public_key_base64"
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
Generates Ed25519 key pair (for E2EE)
    ↓
Sends to relay server
```

**Server receives:**
```json
{
  "type": "register",
  "token": "google_oauth_token",
  "device_type": "android",
  "device_id": "android-pixel-7",
  "device_name": "Pixel 7",
  "public_key": "ed25519_public_key_base64"
}
```

**Relay Server:**
- Verifies token with Google
- Extracts `user_id` (email)
- Registers device with public key
- Stores: `{device_id, user_id, device_type, device_name, public_key, connection_status}`

---

### Step 2: Target Selection & Messaging

#### Android App UI:
```
┌─────────────────────────────────┐
│  Signed in as: you@gmail.com    │
│                                 │
│  Target: [Work Laptop ▼]        │  ← Dropdown of online devices
│          • Work Laptop (online) │
│          • Home Desktop (online)│
│                                 │
│  ┌───────────────────────────┐  │
│  │ Type or speak...          │  │
│  └───────────────────────────┘  │
│                                 │
│  [🎤 Tap to Speak]              │
└─────────────────────────────────┘
```

**Flow:**
1. Android fetches list of user's devices from relay server
2. Filters for `device_type: "linux"` and `status: "online"`
3. User selects target from dropdown
4. User speaks or types message
5. Message encrypted and sent to selected target

**Android sends to server:**
```json
{
  "type": "message",
  "from": "android-pixel-7",
  "to": "linux-work-laptop",
  "content": "encrypted_payload_base64",
  "encrypted": true,
  "key_exchange": {
    "ephemeral_public_key": "dh_public_key_base64"
  }
}
```

**Relay Server:**
1. Verifies both devices belong to same `user_id`
2. Forwards encrypted message (cannot decrypt it)
3. Routes to target device

**Linux receives and decrypts:**
1. Receives encrypted message
2. Performs DH key exchange using ephemeral keys
3. Derives AES-256 key from shared secret
4. Decrypts message content
5. Types the text via keyboard simulation

---

## End-to-End Encryption (Hybrid)

### Key Generation (One-Time, Per Device)

Each device generates a long-term Ed25519 key pair on first launch:

```typescript
// On device first launch
const keyPair = generateEd25519KeyPair();
localStorage.save('private_key', keyPair.privateKey); // Never leaves device
uploadToServer({
  device_id: 'my-device',
  public_key: keyPair.publicKey  // Shared via server
});
```

### Message Encryption Flow (Per Message)

**Hybrid approach using Diffie-Hellman + AES:**

```
Sender (Android):
1. Generate ephemeral DH key pair (curve25519)
2. Fetch recipient's public key from server
3. Perform DH key exchange: shared_secret = DH(my_ephemeral_private, recipient_public)
4. Derive AES-256 key: aes_key = HKDF(shared_secret)
5. Encrypt message: ciphertext = AES-GCM(message, aes_key)
6. Send: {ciphertext, ephemeral_public_key}

Relay Server:
- Cannot decrypt (doesn't have private keys)
- Only routes encrypted blobs

Receiver (Linux):
1. Receive {ciphertext, sender_ephemeral_public_key}
2. Perform DH key exchange: shared_secret = DH(my_private, sender_ephemeral_public)
3. Derive same AES key: aes_key = HKDF(shared_secret)
4. Decrypt: message = AES-GCM-decrypt(ciphertext, aes_key)
```

**Properties:**
- ✅ Forward secrecy (ephemeral keys rotated per message/session)
- ✅ Server cannot read messages (no private keys)
- ✅ Authenticated encryption (AES-GCM provides integrity)
- ✅ Fast encryption (AES is hardware-accelerated)

### Trust Model: Trust on First Use (TOFU)

Similar to SSH:

```
First connection:
1. Device uploads public key during OAuth registration
2. Server distributes public keys to devices in same trusted pool
3. Devices trust keys on first connection
4. Optional: Show key fingerprints in settings for manual verification

Key rotation:
- If device's public key changes, warn user
- Require re-authentication for new key
```

---

## Security Properties

### Against Random Attacker

**Scenario:** Attacker tries to intercept messages

```
Attacker intercepts encrypted message
    ↓
Attacker has: ciphertext + ephemeral_public_key
Attacker needs: recipient's private key (not available)
    ↓
Cannot derive shared secret
    ↓
❌ Cannot decrypt message
```

### Against Malicious Server Operator

**Scenario:** Relay server operator tries to read messages

```
Server has: ciphertext + ephemeral_public_key + sender/recipient public keys
Server needs: recipient's private key (stored only on device)
    ↓
Cannot derive shared secret
    ↓
❌ Cannot decrypt message content
    ✅ Can see metadata: sender, recipient, timestamp, message length
```

### Against Account Hijacker

**Scenario:** Attacker has your Google password

```
Attacker logs in with your Google account
    ↓
Attacker's device registers with relay server
    ↓
Attacker appears in your trusted pool
    ↓
⚠️ Mitigation: Check connected devices in web dashboard
⚠️ Revoke unauthorized devices immediately
```

**Future improvement:** Add device approval flow (like Tailscale)

---

## Data Flow

### Complete Message Flow:

```
┌──────────────────────────────────────────────────────────┐
│ 1. REGISTRATION                                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Linux: Sign in with Google + Generate key pair         │
│         ↓                                                │
│  Server: Store {device_id, user_id, public_key}         │
│                                                          │
│  Android: Sign in with Google + Generate key pair       │
│           ↓                                              │
│  Server: Store {device_id, user_id, public_key}         │
│                                                          │
│  ✅ Both devices now in trusted pool                    │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 2. TARGET SELECTION                                      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Android: Request device list from server               │
│           ↓                                              │
│  Server: Return all Linux devices for you@gmail.com     │
│          [{id: "linux-work", name: "Work Laptop"}, ...]  │
│           ↓                                              │
│  Android: Show dropdown with devices                    │
│           ↓                                              │
│  User: Select "Work Laptop"                             │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ 3. ENCRYPTED MESSAGING                                   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Android: User speaks "Hello world"                     │
│           ↓                                              │
│  Android: Fetch Work Laptop's public key               │
│           Generate ephemeral DH key pair                 │
│           Encrypt message with hybrid encryption         │
│           ↓                                              │
│  Server: Route encrypted blob to Work Laptop            │
│          (Cannot read content)                           │
│           ↓                                              │
│  Linux: Decrypt message                                 │
│         Type "Hello world" via keyboard                  │
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
  public_key: string;     // Ed25519 public key for E2EE
  connection_status: 'online' | 'offline';
  websocket?: WebSocket;  // For message routing
  last_connected: Date;
  created_at: Date;
}
```

**No Sessions or Pairing Tokens needed!**

---

## Implementation Components

### Relay Server (Node.js + TypeScript)

**Dependencies:**
```json
{
  "google-auth-library": "^9.0.0",
  "ws": "^8.14.0",
  "dotenv": "^16.3.0",
  "@noble/curves": "^1.3.0",
  "@noble/hashes": "^1.3.3"
}
```

**Key Modules:**
- `auth.ts` - Google OAuth token verification
- `devices.ts` - Device registry management
- `routing.ts` - Message routing logic
- `crypto.ts` - Public key distribution (server doesn't decrypt)

### Linux Client/Server (Python)

**Dependencies:**
```txt
google-auth-oauthlib==1.1.0
websockets==12.0
cryptography==41.0.0
PyNaCl==1.5.0
```

**Key Modules:**
- `auth.py` - Google OAuth flow (browser-based)
- `crypto.py` - Hybrid encryption (DH + AES)
- `client.py` - WebSocket connection and message handling
- `keyboard.py` - Keyboard simulation (existing)

### Linux Test Client (TypeScript)

**Dependencies:**
```json
{
  "ws": "^8.14.0",
  "@noble/curves": "^1.3.0",
  "@noble/hashes": "^1.3.3",
  "readline": "^1.3.0"
}
```

**Purpose:**
- REPL interface for testing
- Types messages and sends via relay server
- No microphone needed
- Simulates Android app behavior

### Android App (Kotlin)

**Dependencies:**
```kotlin
// build.gradle
implementation 'com.google.android.gms:play-services-auth:20.7.0'
implementation 'com.squareup.okhttp3:okhttp:4.12.0'
implementation 'com.google.crypto.tink:tink-android:1.10.0'
```

**Key Components:**
- `GoogleAuthActivity.kt` - Google Sign-In
- `DeviceListViewModel.kt` - Fetch and manage device list
- `CryptoManager.kt` - Hybrid encryption implementation
- `WebSocketClient.kt` - Server communication

---

## Benefits Over QR Code Approach

| Feature | **QR Code (Old)** | **OAuth Only (New)** |
|---------|-------------------|----------------------|
| **Setup steps** | 2 layers (OAuth + QR) | 1 layer (OAuth only) |
| **Setup time** | ~30 seconds | ~10 seconds |
| **Pairing process** | Generate + scan QR | Automatic |
| **Multi-device** | Manual pair each combo | Automatic pool |
| **Switching targets** | Re-pair required | Instant dropdown switch |
| **Device management** | Complex session tracking | Simple device list |
| **E2EE** | Can add | Built-in hybrid encryption |
| **Code complexity** | High (tokens, sessions, QR) | Low (device registry only) |
| **User experience** | Cumbersome | Seamless (like Tailscale) |

---

## Comparison to Tailscale

| Aspect | **Tailscale** | **Utter** |
|--------|---------------|-----------|
| **Authentication** | OAuth (Google/GitHub/etc) | Google OAuth |
| **Device trust** | Implicit (all devices trusted) | Implicit (trusted pool) |
| **Target selection** | Automatic mesh network | Manual dropdown selection |
| **Encryption** | WireGuard (E2EE) | Hybrid DH + AES (E2EE) |
| **Use case** | VPN mesh network | Voice-to-text relay |
| **Server role** | Coordination only | Message routing |

---

## Future Enhancements

### Phase 3: UX Improvements
- Auto-reconnect with saved session
- Push notifications for incoming messages
- Device nicknames (e.g., "Work Laptop", "Personal Desktop")
- Last-used target memory
- Device online/offline status indicators

### Phase 4: Enhanced Security
- Device approval flow (Tailscale-style)
- Key fingerprint verification UI
- Automatic key rotation policy
- Audit log of connected devices

### Phase 5: Advanced Features
- Multi-recipient messages (broadcast to multiple Linux devices)
- Group messaging within trusted pool
- File transfer support (encrypted)
- Web dashboard for device management

---

## Privacy Considerations

### What the Server Knows:
- ✅ Your Google account email
- ✅ Which devices belong to you
- ✅ When devices are online/offline
- ✅ Message metadata (sender, recipient, timestamp, length)
- ❌ Message content (encrypted end-to-end)

### What the Server Doesn't Know:
- ❌ Actual text content (encrypted with E2EE)
- ❌ Your Google password (OAuth token only)
- ❌ Private keys (stored locally on devices)

### Recommendations:
- Self-host relay server for maximum privacy
- Regularly audit connected devices in dashboard
- Revoke access for lost/stolen devices immediately
- Enable device approval flow in Phase 4

---

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Tailscale Architecture](https://tailscale.com/blog/how-tailscale-works/)
- [Diffie-Hellman Key Exchange](https://en.wikipedia.org/wiki/Diffie%E2%80%93Hellman_key_exchange)
- [NaCl Crypto Library](https://nacl.cr.yp.to/)
- [Signal Protocol](https://signal.org/docs/)
- [WebSocket Security](https://datatracker.ietf.org/doc/html/rfc6455#section-10)
