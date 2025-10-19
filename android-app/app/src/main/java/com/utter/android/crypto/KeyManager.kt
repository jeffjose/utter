package com.utter.android.crypto

import android.content.Context
import android.content.SharedPreferences
import android.util.Base64
import android.util.Log
import java.security.SecureRandom

/**
 * Manages Ed25519 keypairs for E2E encryption
 *
 * Keys are stored:
 * - Private key: SharedPreferences (encrypted with Android KeyStore in production)
 * - Public key: SharedPreferences (base64-encoded)
 */
class KeyManager(private val context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    companion object {
        private const val TAG = "KeyManager"
        private const val PREFS_NAME = "utter_crypto"
        private const val KEY_PRIVATE = "ed25519_private"
        private const val KEY_PUBLIC = "ed25519_public"
    }

    /**
     * Get or generate Ed25519 keypair
     * Returns the public key in base64 format
     */
    fun getOrGenerateKeyPair(): String {
        val existingPublicKey = prefs.getString(KEY_PUBLIC, null)
        if (existingPublicKey != null) {
            Log.d(TAG, "Using existing keypair")
            return existingPublicKey
        }

        Log.d(TAG, "Generating new Ed25519 keypair")
        return generateAndSaveKeyPair()
    }

    /**
     * Generate new Ed25519 keypair and save to SharedPreferences
     */
    private fun generateAndSaveKeyPair(): String {
        // Generate random 32-byte seed for Ed25519
        val seed = ByteArray(32)
        SecureRandom().nextBytes(seed)

        // Derive Ed25519 keypair from seed
        val (privateKey, publicKey) = deriveEd25519KeyPair(seed)

        // Store keys (base64-encoded)
        prefs.edit()
            .putString(KEY_PRIVATE, Base64.encodeToString(privateKey, Base64.NO_WRAP))
            .putString(KEY_PUBLIC, Base64.encodeToString(publicKey, Base64.NO_WRAP))
            .apply()

        Log.d(TAG, "Keypair generated and saved")
        return Base64.encodeToString(publicKey, Base64.NO_WRAP)
    }

    /**
     * Get the public key in base64 format
     */
    fun getPublicKeyBase64(): String {
        return prefs.getString(KEY_PUBLIC, null)
            ?: throw IllegalStateException("No keypair generated. Call getOrGenerateKeyPair() first.")
    }

    /**
     * Get the private key bytes
     */
    fun getPrivateKeyBytes(): ByteArray {
        val privateKeyBase64 = prefs.getString(KEY_PRIVATE, null)
            ?: throw IllegalStateException("No keypair generated")
        return Base64.decode(privateKeyBase64, Base64.NO_WRAP)
    }

    /**
     * Get the public key bytes
     */
    fun getPublicKeyBytes(): ByteArray {
        val publicKeyBase64 = prefs.getString(KEY_PUBLIC, null)
            ?: throw IllegalStateException("No keypair generated")
        return Base64.decode(publicKeyBase64, Base64.NO_WRAP)
    }

    /**
     * Derive Ed25519 keypair from 32-byte seed
     *
     * Note: This is a simplified implementation using SHA-512.
     * In production, use a proper Ed25519 library like Tink or BouncyCastle.
     */
    private fun deriveEd25519KeyPair(seed: ByteArray): Pair<ByteArray, ByteArray> {
        require(seed.size == 32) { "Seed must be 32 bytes" }

        // For now, use the seed as both private and public key material
        // In production, use proper Ed25519 derivation
        val privateKey = seed.copyOf()

        // Derive public key from private key
        // This is a placeholder - use proper Ed25519 math in production
        val publicKey = derivePublicKey(privateKey)

        return Pair(privateKey, publicKey)
    }

    /**
     * Derive Ed25519 public key from private key
     *
     * Placeholder implementation - use proper curve25519 math in production
     */
    private fun derivePublicKey(privateKey: ByteArray): ByteArray {
        // Simplified: just hash the private key for demonstration
        // In production: use proper Ed25519 point multiplication
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        return digest.digest(privateKey)
    }

    /**
     * Clear all stored keys
     */
    fun clearKeys() {
        prefs.edit()
            .remove(KEY_PRIVATE)
            .remove(KEY_PUBLIC)
            .apply()
        Log.d(TAG, "Keys cleared")
    }
}
