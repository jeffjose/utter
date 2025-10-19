use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{Engine as _, engine::general_purpose};
use hkdf::Hkdf;
use rand::RngCore;
use sha2::Sha256;
use x25519_dalek::{PublicKey as X25519PublicKey, StaticSecret};
use serde::{Deserialize, Serialize};

/// Data structure for encrypted messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptedMessage {
    pub ciphertext: String,           // base64-encoded ciphertext
    pub nonce: String,                 // base64-encoded nonce (12 bytes for AES-GCM)
    pub ephemeral_public_key: String, // base64-encoded X25519 ephemeral public key
}

/// Handles E2E encryption/decryption using hybrid cryptography:
/// - X25519 ECDH for key exchange
/// - HKDF-SHA256 for key derivation
/// - AES-256-GCM for symmetric encryption
pub struct MessageEncryption {
    private_key: [u8; 32],
    public_key: [u8; 32],
}

// HKDF parameters (must match Android and relay server)
const HKDF_SALT: &[u8] = b"utter-relay-e2e-2024";
const HKDF_INFO: &[u8] = b"message-encryption-v1";

impl MessageEncryption {
    /// Create a new MessageEncryption with the device's keypair
    pub fn new(private_key: &[u8; 32], public_key: &[u8; 32]) -> Self {
        Self {
            private_key: *private_key,
            public_key: *public_key,
        }
    }

    /// Encrypt a plaintext message for a specific recipient
    ///
    /// # Arguments
    /// * `plaintext` - The message to encrypt
    /// * `recipient_public_key_base64` - The recipient's Ed25519 public key (base64)
    ///
    /// # Returns
    /// Result containing EncryptedMessage with ciphertext, nonce, and ephemeral public key
    pub fn encrypt(
        &self,
        plaintext: &str,
        recipient_public_key_base64: &str,
    ) -> Result<EncryptedMessage, Box<dyn std::error::Error>> {
        // 1. Generate ephemeral X25519 keypair
        let ephemeral_secret = StaticSecret::random_from_rng(OsRng);
        let ephemeral_public = X25519PublicKey::from(&ephemeral_secret);

        // 2. Decode recipient's public key
        let recipient_bytes = general_purpose::STANDARD.decode(recipient_public_key_base64)?;
        if recipient_bytes.len() != 32 {
            return Err("Invalid recipient public key length".into());
        }

        // Recipient's X25519 public key
        let recipient_x25519 = X25519PublicKey::from(
            <[u8; 32]>::try_from(recipient_bytes.as_slice())?
        );

        // 3. Perform ECDH to get shared secret
        let shared_secret = ephemeral_secret.diffie_hellman(&recipient_x25519);

        // 4. Derive AES key using HKDF
        let aes_key = self.derive_aes_key(shared_secret.as_bytes())?;

        // 5. Generate random nonce (12 bytes for AES-GCM)
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        #[allow(deprecated)]
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 6. Encrypt with AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&aes_key)?;
        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| format!("Encryption failed: {:?}", e))?;

        Ok(EncryptedMessage {
            ciphertext: general_purpose::STANDARD.encode(&ciphertext),
            nonce: general_purpose::STANDARD.encode(&nonce_bytes),
            ephemeral_public_key: general_purpose::STANDARD.encode(ephemeral_public.as_bytes()),
        })
    }

    /// Decrypt an encrypted message
    ///
    /// # Arguments
    /// * `encrypted` - The encrypted message
    /// * `_sender_public_key_base64` - The sender's Ed25519 public key (currently unused)
    ///
    /// # Returns
    /// Result containing the decrypted plaintext message
    pub fn decrypt(
        &self,
        encrypted: &EncryptedMessage,
        _sender_public_key_base64: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        // 1. Decode sender's ephemeral public key
        let sender_ephemeral_bytes = general_purpose::STANDARD.decode(&encrypted.ephemeral_public_key)?;
        if sender_ephemeral_bytes.len() != 32 {
            return Err("Invalid ephemeral public key length".into());
        }

        let sender_ephemeral = X25519PublicKey::from(
            <[u8; 32]>::try_from(sender_ephemeral_bytes.as_slice())?
        );

        // 2. Use my private key for ECDH
        let my_secret = StaticSecret::from(self.private_key);

        // 3. Perform ECDH to get shared secret (same as sender)
        let shared_secret = my_secret.diffie_hellman(&sender_ephemeral);

        // 4. Derive AES key (same derivation as sender)
        let aes_key = self.derive_aes_key(shared_secret.as_bytes())?;

        // 5. Decode ciphertext and nonce
        let ciphertext = general_purpose::STANDARD.decode(&encrypted.ciphertext)?;
        let nonce_bytes = general_purpose::STANDARD.decode(&encrypted.nonce)?;

        if nonce_bytes.len() != 12 {
            return Err("Invalid nonce length".into());
        }

        #[allow(deprecated)]
        let nonce = Nonce::from_slice(&nonce_bytes);

        // 6. Decrypt with AES-256-GCM
        let cipher = Aes256Gcm::new_from_slice(&aes_key)?;
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| format!("Decryption failed: {:?}", e))?;

        Ok(String::from_utf8(plaintext)?)
    }

    /// Derive AES-256 key from shared secret using HKDF-SHA256
    ///
    /// # Arguments
    /// * `shared_secret` - The ECDH shared secret
    ///
    /// # Returns
    /// Result containing the AES-256 key (32 bytes)
    fn derive_aes_key(&self, shared_secret: &[u8]) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
        // HKDF-Extract + HKDF-Expand
        let hkdf = Hkdf::<Sha256>::new(Some(HKDF_SALT), shared_secret);

        let mut okm = vec![0u8; 32]; // 32 bytes for AES-256
        hkdf.expand(HKDF_INFO, &mut okm)
            .map_err(|e| format!("HKDF failed: {:?}", e))?;

        Ok(okm)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        // Generate two keypairs (sender and receiver)
        let sender_private = [1u8; 32];
        let sender_public = [2u8; 32];
        let receiver_private = [3u8; 32];
        let receiver_public = [4u8; 32];

        let sender_encryption = MessageEncryption::new(&sender_private, &sender_public);
        let receiver_encryption = MessageEncryption::new(&receiver_private, &receiver_public);

        let plaintext = "Hello, World!";
        let receiver_public_b64 = base64::encode(&receiver_public);

        // Encrypt
        let encrypted = sender_encryption
            .encrypt(plaintext, &receiver_public_b64)
            .expect("Encryption failed");

        // Decrypt
        let sender_public_b64 = base64::encode(&sender_public);
        let decrypted = receiver_encryption
            .decrypt(&encrypted, &sender_public_b64)
            .expect("Decryption failed");

        assert_eq!(plaintext, decrypted);
    }
}
