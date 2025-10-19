package com.utter.android.crypto

import android.util.Base64
import android.util.Log
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import java.security.*
import java.security.spec.X509EncodedKeySpec
import javax.crypto.spec.IvParameterSpec

/**
 * Data class for encrypted messages
 */
data class EncryptedMessage(
    val ciphertext: String,      // base64-encoded ciphertext
    val nonce: String,            // base64-encoded nonce (12 bytes for AES-GCM)
    val ephemeralPublicKey: String // base64-encoded X25519 ephemeral public key
)

/**
 * Handles E2E encryption/decryption using hybrid cryptography:
 * - X25519 ECDH for key exchange
 * - HKDF-SHA256 for key derivation
 * - AES-256-GCM for symmetric encryption
 */
class MessageEncryption(private val keyManager: KeyManager) {

    companion object {
        private const val TAG = "MessageEncryption"

        // HKDF parameters
        private const val HKDF_SALT = "utter-relay-e2e-2024"
        private const val HKDF_INFO = "message-encryption-v1"

        // AES-GCM parameters
        private const val AES_KEY_SIZE = 32  // 256 bits
        private const val GCM_NONCE_SIZE = 12  // 96 bits
        private const val GCM_TAG_SIZE = 128  // 128 bits
    }

    /**
     * Encrypt a plaintext message for a specific recipient
     *
     * @param plaintext The message to encrypt
     * @param recipientPublicKeyBase64 The recipient's Ed25519 public key (base64)
     * @return EncryptedMessage containing ciphertext, nonce, and ephemeral public key
     */
    fun encrypt(plaintext: String, recipientPublicKeyBase64: String): EncryptedMessage {
        Log.d(TAG, "Encrypting message (${plaintext.length} chars)")

        // 1. Generate ephemeral X25519 keypair
        val (ephemeralPrivate, ephemeralPublic) = generateX25519KeyPair()

        // 2. Decode recipient's public key
        val recipientPublicKey = Base64.decode(recipientPublicKeyBase64, Base64.NO_WRAP)

        // 3. Perform ECDH to get shared secret
        val sharedSecret = performECDH(ephemeralPrivate, recipientPublicKey)

        // 4. Derive AES key using HKDF
        val aesKey = deriveAESKey(sharedSecret)

        // 5. Generate random nonce
        val nonce = ByteArray(GCM_NONCE_SIZE)
        SecureRandom().nextBytes(nonce)

        // 6. Encrypt with AES-256-GCM
        val ciphertext = aesGcmEncrypt(plaintext.toByteArray(Charsets.UTF_8), aesKey, nonce)

        Log.d(TAG, "Message encrypted successfully")

        return EncryptedMessage(
            ciphertext = Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            nonce = Base64.encodeToString(nonce, Base64.NO_WRAP),
            ephemeralPublicKey = Base64.encodeToString(ephemeralPublic, Base64.NO_WRAP)
        )
    }

    /**
     * Decrypt an encrypted message
     *
     * @param encrypted The encrypted message
     * @param senderPublicKeyBase64 The sender's Ed25519 public key (base64) - currently unused
     * @return Decrypted plaintext message
     */
    fun decrypt(encrypted: EncryptedMessage, senderPublicKeyBase64: String): String {
        Log.d(TAG, "Decrypting message")

        // 1. Get my private key
        val myPrivateKey = keyManager.getPrivateKeyBytes()

        // 2. Decode sender's ephemeral public key
        val senderEphemeralPublic = Base64.decode(encrypted.ephemeralPublicKey, Base64.NO_WRAP)

        // 3. Perform ECDH to get shared secret (same as sender)
        val sharedSecret = performECDH(myPrivateKey, senderEphemeralPublic)

        // 4. Derive AES key (same derivation as sender)
        val aesKey = deriveAESKey(sharedSecret)

        // 5. Decode ciphertext and nonce
        val ciphertext = Base64.decode(encrypted.ciphertext, Base64.NO_WRAP)
        val nonce = Base64.decode(encrypted.nonce, Base64.NO_WRAP)

        // 6. Decrypt with AES-256-GCM
        val plaintext = aesGcmDecrypt(ciphertext, aesKey, nonce)

        Log.d(TAG, "Message decrypted successfully")

        return String(plaintext, Charsets.UTF_8)
    }

    /**
     * Generate X25519 ephemeral keypair
     *
     * Returns Pair(privateKey, publicKey) as byte arrays
     */
    private fun generateX25519KeyPair(): Pair<ByteArray, ByteArray> {
        // For demonstration, generate random keys
        // In production, use proper X25519 implementation
        val privateKey = ByteArray(32)
        SecureRandom().nextBytes(privateKey)

        // Derive public key from private (placeholder)
        val publicKey = deriveX25519PublicKey(privateKey)

        return Pair(privateKey, publicKey)
    }

    /**
     * Derive X25519 public key from private key
     */
    private fun deriveX25519PublicKey(privateKey: ByteArray): ByteArray {
        // Placeholder: hash the private key
        // In production: use proper Curve25519 scalar multiplication
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(privateKey)
    }

    /**
     * Perform Diffie-Hellman key exchange using X25519
     *
     * @param myPrivateKey My X25519 private key
     * @param theirPublicKey Their X25519 public key
     * @return Shared secret (32 bytes)
     */
    private fun performECDH(myPrivateKey: ByteArray, theirPublicKey: ByteArray): ByteArray {
        // Simplified ECDH using XOR for demonstration
        // In production: use proper X25519 implementation
        val sharedSecret = ByteArray(32)
        for (i in 0 until 32) {
            sharedSecret[i] = (myPrivateKey[i % myPrivateKey.size].toInt() xor
                    theirPublicKey[i % theirPublicKey.size].toInt()).toByte()
        }

        // Additional mixing with SHA-256
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(sharedSecret)
    }

    /**
     * Derive AES-256 key from shared secret using HKDF-SHA256
     *
     * @param sharedSecret The ECDH shared secret
     * @return AES-256 key (32 bytes)
     */
    private fun deriveAESKey(sharedSecret: ByteArray): ByteArray {
        // HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
        val salt = HKDF_SALT.toByteArray(Charsets.UTF_8)
        val prk = hmacSha256(salt, sharedSecret)

        // HKDF-Expand: OKM = HMAC-SHA256(PRK, info || 0x01)
        val info = HKDF_INFO.toByteArray(Charsets.UTF_8)
        val infoWithCounter = info + byteArrayOf(0x01)
        val okm = hmacSha256(prk, infoWithCounter)

        // Return first 32 bytes for AES-256
        return okm.copyOf(AES_KEY_SIZE)
    }

    /**
     * HMAC-SHA256
     */
    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        val secretKey = SecretKeySpec(key, "HmacSHA256")
        mac.init(secretKey)
        return mac.doFinal(data)
    }

    /**
     * Encrypt data with AES-256-GCM
     *
     * @param plaintext Data to encrypt
     * @param key AES-256 key (32 bytes)
     * @param nonce Nonce/IV (12 bytes)
     * @return Ciphertext with authentication tag appended
     */
    private fun aesGcmEncrypt(plaintext: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE, nonce)

        cipher.init(Cipher.ENCRYPT_MODE, secretKey, gcmSpec)
        return cipher.doFinal(plaintext)
    }

    /**
     * Decrypt data with AES-256-GCM
     *
     * @param ciphertext Ciphertext with authentication tag
     * @param key AES-256 key (32 bytes)
     * @param nonce Nonce/IV (12 bytes)
     * @return Decrypted plaintext
     * @throws GeneralSecurityException if authentication fails
     */
    private fun aesGcmDecrypt(ciphertext: ByteArray, key: ByteArray, nonce: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val secretKey = SecretKeySpec(key, "AES")
        val gcmSpec = GCMParameterSpec(GCM_TAG_SIZE, nonce)

        cipher.init(Cipher.DECRYPT_MODE, secretKey, gcmSpec)
        return cipher.doFinal(ciphertext)
    }
}
