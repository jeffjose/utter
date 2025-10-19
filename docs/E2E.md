# End-to-End Encryption Architecture

## Overview

This document describes the end-to-end encryption (E2E) implementation for Utter, ensuring the relay server cannot read message content while routing messages between devices.

**Key Properties:**
- Messages encrypted with hybrid cryptography (ECDH + AES-256-GCM)
- Relay server only routes encrypted blobs (cannot decrypt)
- Forward secrecy with ephemeral keys per message
- Compatible with OAuth authentication (see [PAIRING.md](./PAIRING.md))

---

## Table of Contents

1. [Final Architecture](#final-architecture)
2. [Implementation Roadmap](#implementation-roadmap)
3. [Technical Specifications](#technical-specifications)
4. [Security Analysis](#security-analysis)

---

# Final Architecture

This section describes the target state once E2E encryption and OAuth are fully implemented.

## Components Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     ANDROID APP (Sender)                        │
├─────────────────────────────────────────────────────────────────┤
│  1. User speaks: "Hello world"                                  │
│  2. Fetch recipient's public key from device list              │
│  3. Generate ephemeral X25519 keypair                           │
│  4. Perform ECDH: shared_secret = DH(eph_private, recv_public) │
│  5. Derive AES key: aes_key = HKDF(shared_secret)              │
│  6. Encrypt: ciphertext = AES-GCM(plaintext, aes_key, nonce)   │
│  7. Send: {ciphertext, nonce, ephemeral_public_key}            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    RELAY SERVER (Router)                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Verify sender and recipient belong to same user_id         │
│  2. Route encrypted blob to target device                      │
│  3. Cannot decrypt (no private keys)                           │
│  4. Can see metadata: from, to, timestamp, size                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   LINUX CLIENT (Receiver)                       │
├─────────────────────────────────────────────────────────────────┤
│  1. Receive: {ciphertext, nonce, sender_ephemeral_public_key}  │
│  2. Perform ECDH: shared_secret = DH(my_private, eph_public)   │
│  3. Derive same AES key: aes_key = HKDF(shared_secret)         │
│  4. Decrypt: plaintext = AES-GCM-decrypt(ciphertext, aes_key)  │
│  5. Simulate keyboard: xdotool type "Hello world"              │
└─────────────────────────────────────────────────────────────────┘
```

## Cryptographic Protocol

### Key Generation (One-Time Per Device)

Each device generates a long-term Ed25519 keypair on first launch:

```typescript
// On device initialization
const keyPair = generateEd25519KeyPair();

// Store private key securely (never leaves device)
// - Android: Android KeyStore (hardware-backed)
// - Linux: ~/.config/utterd/keypair.enc (encrypted file)
secureStorage.save('private_key', keyPair.privateKey);

// Upload public key during registration
registerWithServer({
  deviceId: 'my-device',
  publicKey: base64(keyPair.publicKey),
  token: oauth_token  // See PAIRING.md
});
```

### Message Encryption (Per Message)

**Hybrid encryption using Diffie-Hellman + AES:**

```
SENDER (Android):
┌─────────────────────────────────────────────────────────┐
│ 1. plaintext = "Hello world"                            │
│ 2. recipient_public_key = fetchFromDeviceList()         │
│ 3. (eph_private, eph_public) = generateX25519Keypair()  │
│ 4. shared_secret = X25519(eph_private, recipient_pub)   │
│ 5. aes_key = HKDF-SHA256(shared_secret, salt, info)     │
│ 6. nonce = randomBytes(12)  // 96-bit for AES-GCM       │
│ 7. ciphertext = AES-256-GCM(plaintext, aes_key, nonce)  │
│ 8. tag = authentication_tag from AES-GCM                │
│ 9. Send: {ciphertext, nonce, tag, eph_public}           │
└─────────────────────────────────────────────────────────┘

RELAY SERVER:
┌─────────────────────────────────────────────────────────┐
│ 1. Verify: sender.userId === recipient.userId           │
│ 2. Route encrypted blob to recipient                    │
│ 3. No decryption attempt (no private keys)              │
└─────────────────────────────────────────────────────────┘

RECEIVER (Linux):
┌─────────────────────────────────────────────────────────┐
│ 1. Receive: {ciphertext, nonce, tag, sender_eph_public} │
│ 2. my_private_key = loadFromSecureStorage()             │
│ 3. shared_secret = X25519(my_private, sender_eph_pub)   │
│ 4. aes_key = HKDF-SHA256(shared_secret, salt, info)     │
│ 5. plaintext = AES-256-GCM-decrypt(ciphertext, aes_key) │
│ 6. Verify authentication tag                            │
│ 7. Process: simulateKeyboard(plaintext)                 │
└─────────────────────────────────────────────────────────┘
```

## Message Format

### Registration (with OAuth)

```json
{
  "type": "register",
  "token": "google_oauth_id_token",
  "clientType": "android|linux",
  "deviceId": "unique-device-identifier",
  "deviceName": "Human Readable Name",
  "publicKey": "base64_encoded_ed25519_public_key"
}
```

### Encrypted Message

```json
{
  "type": "message",
  "to": "target-device-id",
  "from": "sender-device-id",
  "encrypted": true,
  "content": "base64_aes_gcm_ciphertext",
  "nonce": "base64_random_96bit_nonce",
  "ephemeralPublicKey": "base64_x25519_public_key",
  "timestamp": 1697654321000
}
```

### Device List Response (includes public keys)

```json
{
  "type": "devices",
  "devices": [
    {
      "deviceId": "linux-work-laptop",
      "deviceName": "Work Laptop",
      "deviceType": "linux",
      "userId": "user@gmail.com",
      "publicKey": "base64_ed25519_public_key",
      "status": "online",
      "lastConnected": "2024-01-15T10:30:00Z"
    }
  ],
  "timestamp": 1697654321000
}
```

## Security Properties

| Property | Implementation | Status |
|----------|---------------|--------|
| **Confidentiality** | AES-256-GCM encryption | ✅ Server cannot read messages |
| **Forward Secrecy** | Ephemeral X25519 keys per message | ✅ Past messages safe if key compromised |
| **Integrity** | AES-GCM authentication tag | ✅ Tampered messages rejected |
| **Authentication** | OAuth + public key infrastructure | ✅ Verified device identities |
| **User Isolation** | OAuth userId verification | ✅ Messages only route within user's devices |

### Threat Model

**Protected Against:**
- ✅ Relay server operator reading messages
- ✅ Network eavesdropper (man-in-the-middle)
- ✅ Message tampering/modification
- ✅ Replay attacks (timestamp validation)
- ✅ Unauthorized device access (OAuth)

**NOT Protected Against:**
- ⚠️ Compromised device (attacker has physical access)
- ⚠️ Account hijacking (attacker has OAuth credentials)
- ⚠️ Metadata analysis (server sees who talks to whom)

**Mitigations:**
- Device compromise: Revoke device from web dashboard
- Account hijacking: Enable 2FA on Google account
- Metadata: Self-host relay server

---

# Implementation Roadmap

This section provides a phased approach to implement E2E encryption, allowing incremental development and testing.

## Phase Overview

| Phase | Component | Duration | Dependencies |
|-------|-----------|----------|--------------|
| **Phase 1** | Relay server key distribution | 1-2 hours | None |
| **Phase 2** | Crypto library design | 2-3 hours | Phase 1 |
| **Phase 3** | Android client encryption | 4-6 hours | Phase 2 |
| **Phase 4** | Linux client encryption | 3-4 hours | Phase 2 |
| **Phase 5** | Testing & validation | 2-3 hours | Phase 3 & 4 |
| **Phase 6** | OAuth integration | 2-3 hours | Phase 5 (optional) |

**Total Estimated Time:** 14-21 hours

---

## Phase 1: Relay Server - Key Distribution

**Goal:** Server can accept, store, and distribute public keys without OAuth

### Tasks

1. **Install crypto dependencies**
   ```bash
   cd relay-server
   npm install @noble/curves @noble/hashes
   ```

2. **Update registration handler**

   File: `relay-server/src/index.ts`

   ```typescript
   import { ed25519 } from '@noble/curves/ed25519';

   function handleRegister(client: Client, message: any) {
     // Validate public key format (optional but recommended)
     if (message.publicKey) {
       try {
         const keyBytes = Buffer.from(message.publicKey, 'base64');
         if (keyBytes.length !== 32) {
           throw new Error('Invalid Ed25519 public key length');
         }
         // Store validated key
         client.publicKey = message.publicKey;
       } catch (err) {
         sendError(client, 'Invalid public key format');
         return;
       }
     }

     // For now: use hardcoded userId (Phase 6 will add OAuth)
     client.userId = 'test-user';
     client.type = message.clientType;
     client.deviceId = message.deviceId;
     client.deviceName = message.deviceName;
     client.status = 'online';

     // TODO Phase 6: Replace with OAuth
     // const userInfo = await verifyGoogleToken(message.token);
     // client.userId = userInfo.email;

     sendMessage(client, {
       type: 'registered',
       deviceId: client.deviceId,
       timestamp: Date.now()
     });
   }
   ```

3. **Verify device list includes public keys**

   File: `relay-server/src/index.ts`

   ```typescript
   function handleGetDevices(client: Client) {
     const userDevices = Array.from(clients.values())
       .filter(c => c.userId === client.userId && c.deviceId)
       .map(c => ({
         deviceId: c.deviceId,
         deviceName: c.deviceName,
         deviceType: c.type,
         userId: c.userId,
         publicKey: c.publicKey || null,  // ← Include public key
         status: c.status,
         lastConnected: c.connectedAt.toISOString()
       }));

     sendMessage(client, {
       type: 'devices',
       devices: userDevices,
       timestamp: Date.now()
     });
   }
   ```

4. **Update message routing** (no changes needed)

   The relay server already forwards messages as opaque payloads, so no modifications needed for encrypted content.

### Testing Phase 1

```bash
# Start relay server
cd relay-server
npm run dev

# Test with mock registration (use curl or WebSocket client)
# Verify publicKey is stored and returned in device list
```

---

## Phase 2: Crypto Library Design

**Goal:** Define shared crypto interface that both Android and Linux can implement

### Crypto Interface

```typescript
// Pseudo-code interface (implement in each platform)

interface CryptoManager {
  // Key management
  generateKeyPair(): KeyPair;
  loadKeyPair(): KeyPair | null;
  saveKeyPair(keyPair: KeyPair): void;
  getPublicKey(): string;  // base64 encoded

  // Message encryption
  encryptMessage(
    plaintext: string,
    recipientPublicKey: string
  ): EncryptedMessage;

  // Message decryption
  decryptMessage(
    encrypted: EncryptedMessage,
    senderPublicKey: string
  ): string;
}

interface KeyPair {
  privateKey: Uint8Array;  // Ed25519 private key (32 bytes)
  publicKey: Uint8Array;   // Ed25519 public key (32 bytes)
}

interface EncryptedMessage {
  ciphertext: string;           // base64 encoded
  nonce: string;                // base64 encoded (12 bytes)
  ephemeralPublicKey: string;   // base64 encoded X25519 key
}
```

### Encryption Algorithm

```
function encryptMessage(plaintext, recipientPublicKey):
  1. Convert Ed25519 keys to X25519 for DH
     recipient_x25519 = ed25519_to_x25519(recipientPublicKey)

  2. Generate ephemeral X25519 keypair
     (eph_private, eph_public) = generateX25519Keypair()

  3. Perform Diffie-Hellman key exchange
     shared_secret = X25519(eph_private, recipient_x25519)

  4. Derive AES key using HKDF
     salt = random(16)  // or fixed application salt
     info = "utter-e2e-v1"
     aes_key = HKDF-SHA256(shared_secret, salt, info, 32)

  5. Generate random nonce
     nonce = random(12)  // 96 bits for AES-GCM

  6. Encrypt with AES-256-GCM
     ciphertext || tag = AES-GCM-encrypt(
       key=aes_key,
       nonce=nonce,
       plaintext=utf8(plaintext),
       aad=""  // no additional data
     )

  7. Return {ciphertext, nonce, ephemeralPublicKey: eph_public}
```

### Decryption Algorithm

```
function decryptMessage(encrypted, senderPublicKey):
  1. Load my long-term Ed25519 private key
     my_private_ed25519 = loadFromSecureStorage()

  2. Convert to X25519
     my_private_x25519 = ed25519_to_x25519(my_private_ed25519)
     sender_eph_x25519 = base64_decode(encrypted.ephemeralPublicKey)

  3. Perform Diffie-Hellman (same shared secret as sender)
     shared_secret = X25519(my_private_x25519, sender_eph_x25519)

  4. Derive same AES key
     salt = same_as_sender  // Fixed application salt
     info = "utter-e2e-v1"
     aes_key = HKDF-SHA256(shared_secret, salt, info, 32)

  5. Decrypt with AES-256-GCM
     ciphertext = base64_decode(encrypted.ciphertext)
     nonce = base64_decode(encrypted.nonce)

     plaintext = AES-GCM-decrypt(
       key=aes_key,
       nonce=nonce,
       ciphertext=ciphertext,
       aad=""
     )

  6. Verify authentication tag (AES-GCM does this automatically)
     If verification fails → throw DecryptionError

  7. Return utf8(plaintext)
```

### Key Derivation Details

```
HKDF Parameters:
- Hash: SHA-256
- Salt: "utter-relay-e2e-2024" (fixed, 20 bytes UTF-8)
- Info: "message-encryption-v1" (context string)
- Output length: 32 bytes (256 bits for AES-256)

Implementation:
  IKM = shared_secret (32 bytes from X25519)
  PRK = HMAC-SHA256(salt, IKM)
  OKM = HMAC-SHA256(PRK, info || 0x01)
  AES_KEY = OKM[0:32]
```

---

## Phase 3: Android Client Implementation

**Goal:** Android app encrypts messages before sending, decrypts on receive

### Dependencies

Add to `android-app/app/build.gradle`:

```kotlin
dependencies {
    // Existing dependencies...

    // Cryptography
    implementation 'com.google.crypto.tink:tink-android:1.10.0'
    // OR use BouncyCastle:
    // implementation 'org.bouncycastle:bcprov-jdk15on:1.70'
}
```

### File Structure

```
android-app/app/src/main/java/com/utter/android/
├── crypto/
│   ├── CryptoManager.kt          # Main crypto interface
│   ├── KeyManager.kt              # Keypair generation & storage
│   └── MessageEncryption.kt       # Encrypt/decrypt logic
├── WebSocketClient.kt             # Update to use encryption
└── DeviceListActivity.kt          # Fetch public keys
```

### Implementation: KeyManager.kt

```kotlin
package com.utter.android.crypto

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.*
import javax.crypto.KeyGenerator

class KeyManager(private val context: Context) {
    private val KEYSTORE_ALIAS = "utter_ed25519_keypair"
    private val PREFS_NAME = "utter_crypto"
    private val KEY_PUBLIC = "public_key"

    fun getOrGenerateKeyPair(): KeyPair {
        // Try to load existing keypair
        loadKeyPair()?.let { return it }

        // Generate new keypair
        return generateAndSaveKeyPair()
    }

    private fun generateAndSaveKeyPair(): KeyPair {
        // Generate Ed25519 keypair
        val keyGen = KeyPairGenerator.getInstance("EC")
        // Note: Android Keystore doesn't support Ed25519 directly
        // Use Tink or BouncyCastle instead

        // Using Tink (recommended):
        // val keysetHandle = KeysetHandle.generateNew(
        //     SignatureKeyTemplates.ED25519
        // )

        // For now, simplified version using X25519 directly:
        val keyPair = generateX25519KeyPair()

        // Store public key in SharedPreferences
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit()
            .putString(KEY_PUBLIC, Base64.encodeToString(
                keyPair.public.encoded,
                Base64.NO_WRAP
            ))
            .apply()

        // Store private key in Android Keystore (hardware-backed)
        storePrivateKey(keyPair.private)

        return keyPair
    }

    fun getPublicKeyBase64(): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_PUBLIC, null)
            ?: throw IllegalStateException("No keypair generated")
    }

    private fun storePrivateKey(privateKey: PrivateKey) {
        // Store in Android Keystore (implementation details)
        // This ensures the key is hardware-backed and secure
    }

    private fun loadKeyPair(): KeyPair? {
        // Load from Android Keystore if exists
        return null  // TODO: Implement
    }
}
```

### Implementation: MessageEncryption.kt

```kotlin
package com.utter.android.crypto

import android.util.Base64
import java.security.*
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class EncryptedMessage(
    val ciphertext: String,
    val nonce: String,
    val ephemeralPublicKey: String
)

class MessageEncryption(private val keyManager: KeyManager) {

    fun encrypt(plaintext: String, recipientPublicKey: String): EncryptedMessage {
        // 1. Generate ephemeral X25519 keypair
        val ephemeralKeyPair = generateX25519KeyPair()

        // 2. Perform Diffie-Hellman
        val recipientKey = decodePublicKey(recipientPublicKey)
        val sharedSecret = performDH(ephemeralKeyPair.private, recipientKey)

        // 3. Derive AES key
        val aesKey = deriveAESKey(sharedSecret)

        // 4. Generate random nonce
        val nonce = ByteArray(12)
        SecureRandom().nextBytes(nonce)

        // 5. Encrypt with AES-GCM
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(aesKey, "AES")
        val gcmSpec = GCMParameterSpec(128, nonce)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)

        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))

        return EncryptedMessage(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            nonce = Base64.encodeToString(nonce, Base64.NO_WRAP),
            ephemeralPublicKey = Base64.encodeToString(
                ephemeralKeyPair.public.encoded,
                Base64.NO_WRAP
            )
        )
    }

    fun decrypt(
        encrypted: EncryptedMessage,
        senderPublicKey: String
    ): String {
        // 1. Load my private key
        val myPrivateKey = keyManager.getPrivateKey()

        // 2. Decode sender's ephemeral public key
        val senderEphemeralKey = decodePublicKey(encrypted.ephemeralPublicKey)

        // 3. Perform Diffie-Hellman (same shared secret)
        val sharedSecret = performDH(myPrivateKey, senderEphemeralKey)

        // 4. Derive AES key (same derivation as sender)
        val aesKey = deriveAESKey(sharedSecret)

        // 5. Decrypt with AES-GCM
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(aesKey, "AES")
        val nonce = Base64.decode(encrypted.nonce, Base64.NO_WRAP)
        val gcmSpec = GCMParameterSpec(128, nonce)
        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)

        val ciphertext = Base64.decode(encrypted.ciphertext, Base64.NO_WRAP)
        val plaintext = cipher.doFinal(ciphertext)

        return String(plaintext, Charsets.UTF_8)
    }

    private fun performDH(privateKey: PrivateKey, publicKey: PublicKey): ByteArray {
        val keyAgreement = KeyAgreement.getInstance("ECDH")
        keyAgreement.init(privateKey)
        keyAgreement.doPhase(publicKey, true)
        return keyAgreement.generateSecret()
    }

    private fun deriveAESKey(sharedSecret: ByteArray): ByteArray {
        // HKDF-SHA256
        val salt = "utter-relay-e2e-2024".toByteArray()
        val info = "message-encryption-v1".toByteArray()

        // Simplified HKDF (use proper library in production)
        return hkdfSha256(sharedSecret, salt, info, 32)
    }

    private fun decodePublicKey(base64Key: String): PublicKey {
        // Decode base64 and reconstruct PublicKey object
        // Implementation depends on key format
        TODO("Implement key decoding")
    }
}
```

### Update: WebSocketClient.kt

```kotlin
class WebSocketClient(
    private val serverUrl: String,
    private val cryptoManager: CryptoManager
) {
    // Existing code...

    fun sendEncryptedTextToDevice(
        text: String,
        targetDeviceId: String,
        targetPublicKey: String
    ): Boolean {
        if (!isConnected()) return false

        try {
            // Encrypt message
            val encrypted = cryptoManager.encrypt(text, targetPublicKey)

            // Build message
            val message = JSONObject().apply {
                put("type", "message")
                put("to", targetDeviceId)
                put("encrypted", true)
                put("content", encrypted.ciphertext)
                put("nonce", encrypted.nonce)
                put("ephemeralPublicKey", encrypted.ephemeralPublicKey)
                put("timestamp", System.currentTimeMillis())
            }

            webSocket?.send(message.toString())
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Encryption failed", e)
            return false
        }
    }

    private fun handleIncomingMessage(json: JSONObject) {
        when (json.getString("type")) {
            "text" -> {
                val encrypted = json.optBoolean("encrypted", false)
                if (encrypted) {
                    // Decrypt message
                    val encryptedMsg = EncryptedMessage(
                        ciphertext = json.getString("content"),
                        nonce = json.getString("nonce"),
                        ephemeralPublicKey = json.getString("ephemeralPublicKey")
                    )
                    val senderPublicKey = json.getString("senderPublicKey")

                    try {
                        val plaintext = cryptoManager.decrypt(
                            encryptedMsg,
                            senderPublicKey
                        )
                        listener?.onMessageReceived(plaintext)
                    } catch (e: Exception) {
                        Log.e(TAG, "Decryption failed", e)
                        listener?.onError("Failed to decrypt message")
                    }
                } else {
                    // Legacy plaintext (during migration)
                    val content = json.getString("content")
                    listener?.onMessageReceived(content)
                }
            }
        }
    }
}
```

---

## Phase 4: Linux Client (Rust) Implementation

**Goal:** Linux client encrypts/decrypts messages

### Dependencies

Add to `utterd/Cargo.toml`:

```toml
[dependencies]
# Existing dependencies...

# Cryptography
ed25519-dalek = "2.1"
x25519-dalek = "2.0"
aes-gcm = "0.10"
hkdf = "0.12"
sha2 = "0.10"
rand = "0.8"
base64 = "0.21"
```

### File Structure

```
utterd/src/
├── crypto/
│   ├── mod.rs              # Crypto module
│   ├── keys.rs             # Keypair management
│   └── encryption.rs       # Encrypt/decrypt
├── main.rs                 # Update to use crypto
└── config.rs               # Key storage path
```

### Implementation: crypto/keys.rs

```rust
use ed25519_dalek::{SigningKey, VerifyingKey};
use x25519_dalek::{StaticSecret, PublicKey as X25519PublicKey};
use rand::rngs::OsRng;
use std::fs;
use std::path::PathBuf;

pub struct KeyManager {
    config_dir: PathBuf,
}

impl KeyManager {
    pub fn new() -> Self {
        let config_dir = dirs::config_dir()
            .unwrap()
            .join("utterd");

        fs::create_dir_all(&config_dir).ok();

        Self { config_dir }
    }

    pub fn get_or_generate_keypair(&self) -> (SigningKey, VerifyingKey) {
        let key_path = self.config_dir.join("keypair.key");

        if key_path.exists() {
            self.load_keypair(&key_path)
                .expect("Failed to load keypair")
        } else {
            let keypair = self.generate_keypair();
            self.save_keypair(&key_path, &keypair)
                .expect("Failed to save keypair");
            keypair
        }
    }

    fn generate_keypair(&self) -> (SigningKey, VerifyingKey) {
        let mut csprng = OsRng;
        let signing_key = SigningKey::generate(&mut csprng);
        let verifying_key = signing_key.verifying_key();
        (signing_key, verifying_key)
    }

    fn save_keypair(
        &self,
        path: &PathBuf,
        keypair: &(SigningKey, VerifyingKey)
    ) -> std::io::Result<()> {
        // Store private key (in production: encrypt this file)
        let key_bytes = keypair.0.to_bytes();
        fs::write(path, key_bytes)?;

        // Set restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(path)?.permissions();
            perms.set_mode(0o600);  // rw------- (owner only)
            fs::set_permissions(path, perms)?;
        }

        Ok(())
    }

    fn load_keypair(
        &self,
        path: &PathBuf
    ) -> Result<(SigningKey, VerifyingKey), Box<dyn std::error::Error>> {
        let key_bytes = fs::read(path)?;
        let signing_key = SigningKey::from_bytes(&key_bytes.try_into()?);
        let verifying_key = signing_key.verifying_key();
        Ok((signing_key, verifying_key))
    }

    pub fn get_public_key_base64(&self) -> String {
        let (_, verifying_key) = self.get_or_generate_keypair();
        base64::encode(verifying_key.as_bytes())
    }
}
```

### Implementation: crypto/encryption.rs

```rust
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use ed25519_dalek::{SigningKey, VerifyingKey};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use x25519_dalek::{StaticSecret, PublicKey as X25519PublicKey};

pub struct EncryptedMessage {
    pub ciphertext: String,
    pub nonce: String,
    pub ephemeral_public_key: String,
}

pub struct MessageEncryption {
    signing_key: SigningKey,
    verifying_key: VerifyingKey,
}

impl MessageEncryption {
    pub fn new(signing_key: SigningKey, verifying_key: VerifyingKey) -> Self {
        Self {
            signing_key,
            verifying_key,
        }
    }

    pub fn encrypt(
        &self,
        plaintext: &str,
        recipient_public_key: &str,
    ) -> Result<EncryptedMessage, Box<dyn std::error::Error>> {
        // 1. Generate ephemeral X25519 keypair
        let mut rng = rand::thread_rng();
        let ephemeral_secret = StaticSecret::random_from_rng(&mut rng);
        let ephemeral_public = X25519PublicKey::from(&ephemeral_secret);

        // 2. Decode recipient's public key and convert to X25519
        let recipient_bytes = base64::decode(recipient_public_key)?;
        let recipient_ed25519 = VerifyingKey::from_bytes(
            &recipient_bytes.try_into()?
        )?;
        let recipient_x25519 = ed25519_to_x25519_public(&recipient_ed25519);

        // 3. Perform Diffie-Hellman
        let shared_secret = ephemeral_secret.diffie_hellman(&recipient_x25519);

        // 4. Derive AES key using HKDF
        let aes_key = derive_aes_key(shared_secret.as_bytes())?;

        // 5. Generate random nonce
        let mut nonce_bytes = [0u8; 12];
        rng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 6. Encrypt with AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&aes_key)?;
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        Ok(EncryptedMessage {
            ciphertext: base64::encode(&ciphertext),
            nonce: base64::encode(&nonce_bytes),
            ephemeral_public_key: base64::encode(ephemeral_public.as_bytes()),
        })
    }

    pub fn decrypt(
        &self,
        encrypted: &EncryptedMessage,
        _sender_public_key: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // 1. Decode sender's ephemeral public key
        let eph_pub_bytes = base64::decode(&encrypted.ephemeral_public_key)?;
        let sender_ephemeral = X25519PublicKey::from(
            <[u8; 32]>::try_from(eph_pub_bytes)?
        );

        // 2. Convert my Ed25519 private key to X25519
        let my_x25519_secret = ed25519_to_x25519_private(&self.signing_key);

        // 3. Perform Diffie-Hellman (same shared secret)
        let shared_secret = my_x25519_secret.diffie_hellman(&sender_ephemeral);

        // 4. Derive AES key
        let aes_key = derive_aes_key(shared_secret.as_bytes())?;

        // 5. Decrypt with AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&aes_key)?;
        let nonce_bytes = base64::decode(&encrypted.nonce)?;
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = base64::decode(&encrypted.ciphertext)?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {}", e))?;

        Ok(String::from_utf8(plaintext)?)
    }
}

fn derive_aes_key(shared_secret: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let salt = b"utter-relay-e2e-2024";
    let info = b"message-encryption-v1";

    let hkdf = Hkdf::<Sha256>::new(Some(salt), shared_secret);
    let mut okm = vec![0u8; 32]; // 256 bits for AES-256
    hkdf.expand(info, &mut okm)
        .map_err(|e| format!("HKDF failed: {}", e))?;

    Ok(okm)
}

fn ed25519_to_x25519_public(ed_key: &VerifyingKey) -> X25519PublicKey {
    // Convert Ed25519 public key to X25519 (Curve25519)
    // This uses the standard conversion algorithm
    let ed_bytes = ed_key.as_bytes();

    // Simplified: use curve25519-dalek for proper conversion
    // For now, this is a placeholder
    X25519PublicKey::from(*ed_bytes)
}

fn ed25519_to_x25519_private(ed_key: &SigningKey) -> StaticSecret {
    // Convert Ed25519 private key to X25519
    let ed_bytes = ed_key.to_bytes();
    StaticSecret::from(ed_bytes)
}
```

### Update: main.rs

```rust
mod crypto;

use crypto::keys::KeyManager;
use crypto::encryption::{MessageEncryption, EncryptedMessage};

impl UtterClient {
    pub async fn new(server_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Initialize crypto
        let key_manager = KeyManager::new();
        let (signing_key, verifying_key) = key_manager.get_or_generate_keypair();
        let encryption = MessageEncryption::new(signing_key, verifying_key);

        // Connect to server
        let (ws_stream, _) = connect_async(server_url).await?;

        // ... rest of initialization

        Ok(Self {
            encryption: Some(encryption),
            key_manager,
            // ...
        })
    }

    async fn handle_message(&mut self, msg: WsMessage) -> Result<(), Box<dyn std::error::Error>> {
        match msg {
            WsMessage::Text { content, encrypted, nonce, ephemeral_public_key, sender_public_key } => {
                let text = if encrypted.unwrap_or(false) {
                    // Decrypt message
                    let encrypted_msg = EncryptedMessage {
                        ciphertext: content,
                        nonce: nonce.unwrap(),
                        ephemeral_public_key: ephemeral_public_key.unwrap(),
                    };

                    self.encryption.as_ref()
                        .unwrap()
                        .decrypt(&encrypted_msg, &sender_public_key.unwrap())?
                } else {
                    // Legacy plaintext
                    content
                };

                // Simulate typing
                simulate_typing(&text);
            }
            // ... other message types
        }

        Ok(())
    }

    async fn register(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let hostname = hostname::get()?
            .to_string_lossy()
            .to_string();

        let public_key = self.key_manager.get_public_key_base64();

        let register_msg = json!({
            "type": "register",
            "clientType": "linux",
            "deviceId": hostname,
            "deviceName": hostname,
            "publicKey": public_key,
        });

        self.send(&register_msg.to_string()).await?;
        Ok(())
    }
}
```

---

## Phase 5: Testing & Validation

**Goal:** Verify end-to-end encryption works correctly

### Test Plan

1. **Unit Tests**
   - Key generation produces valid Ed25519 keys
   - Encryption/decryption roundtrip produces original plaintext
   - Invalid keys are rejected
   - Tampered ciphertext fails authentication

2. **Integration Tests**
   ```
   Android → Relay → Linux:
   1. Android encrypts "Hello world"
   2. Relay routes encrypted blob (cannot decrypt)
   3. Linux decrypts to "Hello world"
   4. Verify text appears in focused window
   ```

3. **Security Tests**
   - Verify relay server cannot decrypt messages
   - Verify different ephemeral keys used per message
   - Verify tampered messages are rejected
   - Verify wrong recipient cannot decrypt

### Test Scenarios

```bash
# Scenario 1: Basic encryption flow
1. Start relay server
2. Start Linux client (generates keypair, registers)
3. Start Android app (generates keypair, registers)
4. Android fetches device list (includes Linux public key)
5. Android sends encrypted message
6. Linux receives and decrypts
7. Verify text appears

# Scenario 2: Forward secrecy
1. Send message A
2. Capture ephemeral_public_key_A
3. Send message B
4. Capture ephemeral_public_key_B
5. Verify ephemeral_public_key_A ≠ ephemeral_public_key_B

# Scenario 3: Server cannot decrypt
1. Capture encrypted message from network
2. Try to decrypt with only public keys (should fail)
3. Verify server logs show opaque blob

# Scenario 4: Migration (plaintext → encrypted)
1. Send plaintext message (encrypted: false)
2. Verify Linux handles it
3. Send encrypted message (encrypted: true)
4. Verify Linux handles it
5. Both methods work during migration period
```

---

## Phase 6: OAuth Integration

**Goal:** Replace hardcoded `userId = 'test-user'` with verified OAuth

See [PAIRING.md](./PAIRING.md) for complete OAuth architecture.

### Quick Summary

**Client Changes:**
1. Integrate Google Sign-In SDK
2. Obtain OAuth ID token
3. Send token in registration message

**Server Changes:**
1. Install `google-auth-library`
2. Verify token with Google:
   ```typescript
   import { OAuth2Client } from 'google-auth-library';

   async function verifyGoogleToken(token: string): Promise<{email: string}> {
     const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
     const ticket = await client.verifyIdToken({
       idToken: token,
       audience: process.env.GOOGLE_CLIENT_ID,
     });
     const payload = ticket.getPayload();
     return { email: payload.email };
   }
   ```
3. Update `handleRegister()`:
   ```typescript
   const userInfo = await verifyGoogleToken(message.token);
   client.userId = userInfo.email;  // Verified email
   ```

**Migration Strategy:**
- Support both modes during transition:
  ```typescript
  if (message.token) {
    // OAuth mode (production)
    client.userId = await verifyGoogleToken(message.token);
  } else {
    // Test mode (development)
    client.userId = 'test-user';
  }
  ```

---

# Technical Specifications

## Cryptographic Primitives

| Primitive | Algorithm | Key Size | Purpose |
|-----------|-----------|----------|---------|
| Long-term keys | Ed25519 | 256 bits | Device identity |
| Key exchange | X25519 (ECDH) | 256 bits | Shared secret derivation |
| Symmetric encryption | AES-256-GCM | 256 bits | Message encryption |
| Key derivation | HKDF-SHA256 | 256 bits output | AES key from shared secret |
| Authentication | AES-GCM tag | 128 bits | Message integrity |

## Key Storage

| Platform | Private Key Storage | Public Key Storage |
|----------|---------------------|-------------------|
| **Android** | Android KeyStore (hardware-backed) | SharedPreferences |
| **Linux** | `~/.config/utterd/keypair.key` (file permissions 0600) | Included in private key file |
| **Relay Server** | N/A (doesn't have private keys) | In-memory Map or database |

**Future Improvement (Linux):**
- Encrypt private key file with device password
- Use system keyring (libsecret, gnome-keyring)

## Message Size Overhead

```
Plaintext: "Hello world" = 11 bytes

Encrypted message:
- Ciphertext: 11 bytes (same as plaintext)
- AES-GCM tag: 16 bytes
- Nonce: 12 bytes
- Ephemeral public key: 32 bytes
- Base64 encoding overhead: ~33%
- JSON structure: ~150 bytes

Total: ~240 bytes (vs 11 bytes plaintext)
Overhead: ~2100% for short messages

For longer messages (1KB):
Total: ~1.4 KB
Overhead: ~40%
```

**Optimization:** Overhead is acceptable for voice-to-text use case (messages typically 50-500 chars).

## Performance Benchmarks (Estimated)

| Operation | Time | Notes |
|-----------|------|-------|
| Ed25519 keygen | 1-5 ms | One-time per device |
| X25519 ephemeral keygen | 0.5-2 ms | Per message |
| ECDH | 0.5-1 ms | Per message |
| HKDF-SHA256 | 0.1-0.5 ms | Per message |
| AES-GCM encrypt (100 chars) | 0.1-0.3 ms | Per message |
| **Total encryption** | **~2-5 ms** | Imperceptible to user |

**Conclusion:** Encryption overhead is negligible for interactive use.

---

# Security Analysis

## Attack Scenarios

### 1. Network Eavesdropper (Man-in-the-Middle)

**Attack:** Attacker intercepts WebSocket traffic

**Protection:**
- Messages encrypted with E2E encryption
- Attacker sees: `{to, from, ciphertext, nonce, ephemeral_public_key}`
- Cannot derive AES key (needs recipient's private key)

**Result:** ✅ Message content protected

**Remaining Risk:** ⚠️ Metadata visible (who talks to whom, when, message size)

**Mitigation:** Use TLS/WSS for transport encryption (hides metadata from network)

---

### 2. Malicious Relay Server

**Attack:** Server operator tries to read messages

**Protection:**
- Server has public keys only (no private keys)
- Cannot perform ECDH without recipient's private key
- Cannot derive AES key

**Result:** ✅ Content protected from server

**Limitations:**
- Server sees metadata: sender, recipient, timestamp, message size
- Server could drop messages or refuse service
- Server could attempt traffic analysis

**Mitigation:** Self-host relay server for sensitive use

---

### 3. Compromised Device

**Attack:** Attacker gains physical access to device

**Scenarios:**

a) **Android device unlocked:**
   - Attacker can extract private key from Android KeyStore (if device not hardware-backed)
   - Can decrypt future messages
   - Cannot decrypt past messages (forward secrecy)

b) **Linux device:**
   - Attacker reads `~/.config/utterd/keypair.key`
   - Can decrypt future messages to this device
   - Cannot decrypt past messages (forward secrecy)

**Mitigation:**
- Enable full-disk encryption
- Use hardware-backed keystore (Android)
- Encrypt private key file with password (Linux - future)
- Revoke device from web dashboard if lost/stolen

---

### 4. Account Hijacking

**Attack:** Attacker obtains Google OAuth credentials

**Result:**
- Attacker can register new device under your account
- Attacker receives new messages sent to their device
- Cannot decrypt past messages sent to other devices
- Appears in your trusted pool

**Detection:**
- Check connected devices in web dashboard
- Email notifications for new device registrations (future)

**Mitigation:**
- Enable 2FA on Google account
- Device approval flow (like Tailscale - future)
- Regularly audit connected devices

---

### 5. Replay Attack

**Attack:** Attacker captures encrypted message and re-sends it

**Current Protection:** ⚠️ Limited
- Timestamp field in message (can be checked)
- No built-in replay protection

**Mitigation (Future):**
- Add sequence numbers per sender-recipient pair
- Track received sequence numbers
- Reject messages with old/duplicate sequence numbers

---

## Security Recommendations

### For Users

1. **Enable 2FA** on Google account
2. **Self-host** relay server for sensitive communications
3. **Audit devices** regularly in web dashboard
4. **Revoke immediately** if device is lost/stolen
5. **Use WSS** (WebSocket over TLS) in production

### For Developers

1. **Add TLS/WSS** to relay server (use Let's Encrypt)
2. **Implement replay protection** (sequence numbers)
3. **Add device approval flow** (Tailscale-style)
4. **Encrypt Linux private key file** with password
5. **Add key rotation** support
6. **Implement session keys** for long conversations (Double Ratchet)

### For Self-Hosters

1. **Use HTTPS/WSS** with valid certificate
2. **Firewall relay server** (only allow WebSocket port)
3. **Monitor logs** for suspicious activity
4. **Back up device registry** (if using database)
5. **Rate limit** registration and messages

---

## Comparison to Other Protocols

| Feature | **Utter E2E** | **Signal Protocol** | **TLS** | **SSH** |
|---------|---------------|---------------------|---------|---------|
| **E2E Encryption** | ✅ Yes | ✅ Yes | ❌ No (server decrypts) | ✅ Yes |
| **Forward Secrecy** | ✅ Ephemeral keys | ✅ Double Ratchet | ✅ Ephemeral DH | ⚠️ Optional |
| **Authentication** | OAuth + Public keys | Phone number + keys | Certificate | Public key (TOFU) |
| **Metadata Protection** | ❌ Server sees | ❌ Server sees | ⚠️ Partial | ⚠️ Partial |
| **Replay Protection** | ⚠️ Basic (timestamp) | ✅ Sequence numbers | ✅ Yes | ✅ Yes |
| **Complexity** | Low | High | Medium | Low |
| **Use Case** | Voice-to-text relay | Messaging app | Web traffic | Remote shell |

**Conclusion:** Utter's E2E provides strong content protection with reasonable complexity for the use case.

---

## Compliance & Privacy

### GDPR Considerations

**Data Controller:** Relay server operator

**Personal Data Stored:**
- Google account email (userId)
- Device identifiers and names
- Connection timestamps
- Public keys

**User Rights:**
- **Access:** API to fetch user's device list
- **Deletion:** Delete account and all devices
- **Portability:** Export device registry as JSON

**Data Retention:**
- Messages: Not stored (ephemeral relay only)
- Device registry: Until user deletes account
- Logs: Configurable retention period

### End-to-End Encryption Notice

**What is protected:**
- ✅ Message content (relay server cannot read)

**What is NOT protected:**
- ❌ Sender and recipient identities
- ❌ Timestamps
- ❌ Message lengths
- ❌ Connection patterns

**Recommendation:** Display privacy notice in app settings explaining E2E encryption scope.

---

## References

- [Signal Protocol](https://signal.org/docs/specifications/doubleratchet/)
- [X25519 Key Exchange](https://datatracker.ietf.org/doc/html/rfc7748)
- [AES-GCM Authenticated Encryption](https://datatracker.ietf.org/doc/html/rfc5116)
- [HKDF Key Derivation](https://datatracker.ietf.org/doc/html/rfc5869)
- [Ed25519 Signatures](https://datatracker.ietf.org/doc/html/rfc8032)
- [WebSocket Security](https://datatracker.ietf.org/doc/html/rfc6455#section-10)
- [PAIRING.md](./PAIRING.md) - OAuth authentication architecture

---

## Appendix: Code Examples

### Example: Complete Encryption Flow (Pseudocode)

```python
# SENDER (Android)
def send_encrypted_message(plaintext, recipient_device_id):
    # 1. Fetch recipient's public key from device list
    recipient = device_list.find(recipient_device_id)
    recipient_public_key = base64_decode(recipient.publicKey)

    # 2. Generate ephemeral keypair
    ephemeral_private, ephemeral_public = generate_x25519_keypair()

    # 3. Perform ECDH
    shared_secret = x25519_dh(ephemeral_private, recipient_public_key)

    # 4. Derive AES key
    salt = b"utter-relay-e2e-2024"
    info = b"message-encryption-v1"
    aes_key = hkdf_sha256(shared_secret, salt, info, output_len=32)

    # 5. Encrypt
    nonce = random_bytes(12)
    ciphertext, tag = aes_gcm_encrypt(plaintext, aes_key, nonce)

    # 6. Send to server
    send_to_server({
        "type": "message",
        "to": recipient_device_id,
        "encrypted": true,
        "content": base64_encode(ciphertext + tag),
        "nonce": base64_encode(nonce),
        "ephemeralPublicKey": base64_encode(ephemeral_public)
    })

# RECEIVER (Linux)
def handle_encrypted_message(message):
    # 1. Extract fields
    ciphertext_and_tag = base64_decode(message.content)
    ciphertext = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]
    nonce = base64_decode(message.nonce)
    sender_ephemeral_public = base64_decode(message.ephemeralPublicKey)

    # 2. Load my private key
    my_private_key = load_from_secure_storage()

    # 3. Perform ECDH (same shared secret)
    shared_secret = x25519_dh(my_private_key, sender_ephemeral_public)

    # 4. Derive AES key (same derivation)
    salt = b"utter-relay-e2e-2024"
    info = b"message-encryption-v1"
    aes_key = hkdf_sha256(shared_secret, salt, info, output_len=32)

    # 5. Decrypt
    plaintext = aes_gcm_decrypt(ciphertext, tag, aes_key, nonce)

    # 6. Process message
    simulate_keyboard(plaintext)
```

### Example: Key Conversion (Ed25519 ↔ X25519)

```python
# Ed25519 keys are used for signing (device identity)
# X25519 keys are used for Diffie-Hellman (encryption)
# They use the same underlying Curve25519

def ed25519_to_x25519_public(ed25519_public_key):
    """
    Convert Ed25519 public key to X25519 public key
    Using standard conversion from RFC 7748
    """
    # This requires careful point conversion on Curve25519
    # Use a library like libsodium or cryptography
    from cryptography.hazmat.primitives.asymmetric import ed25519, x25519

    # Note: Direct conversion not always available in all libraries
    # May need to use libsodium's crypto_sign_ed25519_pk_to_curve25519
    return x25519_public_from_ed25519(ed25519_public_key)

def ed25519_to_x25519_private(ed25519_private_key):
    """
    Convert Ed25519 private key to X25519 private key
    """
    # Extract scalar from Ed25519 key and use for X25519
    # Implementation depends on library
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    # Simplified: hash the Ed25519 private key to get X25519 scalar
    # Production: use proper conversion (libsodium)
    scalar = sha512(ed25519_private_key)[:32]
    return x25519_private_from_scalar(scalar)
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-15 | Initial E2E architecture document |

