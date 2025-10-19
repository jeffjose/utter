package com.utter.android.crypto

import android.content.Context
import android.util.Log

/**
 * Main crypto interface for E2E encryption
 *
 * Provides simple encrypt/decrypt methods and key management
 */
class CryptoManager(context: Context) {

    private val keyManager: KeyManager = KeyManager(context)
    private val messageEncryption: MessageEncryption = MessageEncryption(keyManager)

    companion object {
        private const val TAG = "CryptoManager"
    }

    /**
     * Initialize crypto (generate keypair if needed)
     * Returns the device's public key in base64 format
     */
    fun initialize(): String {
        Log.d(TAG, "Initializing crypto")
        return keyManager.getOrGenerateKeyPair()
    }

    /**
     * Get the device's public key
     */
    fun getPublicKey(): String {
        return keyManager.getPublicKeyBase64()
    }

    /**
     * Encrypt a message for a specific recipient
     *
     * @param plaintext The message to encrypt
     * @param recipientPublicKey The recipient's public key (base64)
     * @return EncryptedMessage ready to send
     */
    fun encryptMessage(plaintext: String, recipientPublicKey: String): EncryptedMessage {
        return messageEncryption.encrypt(plaintext, recipientPublicKey)
    }

    /**
     * Decrypt a received message
     *
     * @param encrypted The encrypted message
     * @param senderPublicKey The sender's public key (base64)
     * @return Decrypted plaintext
     */
    fun decryptMessage(encrypted: EncryptedMessage, senderPublicKey: String): String {
        return messageEncryption.decrypt(encrypted, senderPublicKey)
    }

    /**
     * Clear all crypto keys (for logout/reset)
     */
    fun clearKeys() {
        keyManager.clearKeys()
    }
}
