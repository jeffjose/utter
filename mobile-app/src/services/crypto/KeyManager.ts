/**
 * Key Management Module
 * Handles keypair generation and secure storage
 */

import * as SecureStore from 'expo-secure-store';
import { generateX25519KeyPair, type KeyPair } from './MessageEncryption';

const PRIVATE_KEY_STORAGE_KEY = 'utter_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'utter_public_key';

export class KeyManager {
  /**
   * Get or generate keypair
   * If keys exist in secure storage, return them
   * Otherwise generate new keypair and store it
   */
  async getOrGenerateKeyPair(): Promise<KeyPair> {
    let privateKey = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
    let publicKey = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY);

    if (!privateKey || !publicKey) {
      const keyPair = await this.generateAndStoreKeyPair();
      return keyPair;
    }

    return { privateKey, publicKey };
  }

  /**
   * Generate new keypair and store in secure storage
   */
  async generateAndStoreKeyPair(): Promise<KeyPair> {
    const keyPair = await generateX25519KeyPair();

    await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, keyPair.privateKey);
    await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, keyPair.publicKey);

    return keyPair;
  }

  /**
   * Get public key only (for registration)
   */
  async getPublicKey(): Promise<string> {
    const keyPair = await this.getOrGenerateKeyPair();
    return keyPair.publicKey;
  }

  /**
   * Get private key (for decryption)
   */
  async getPrivateKey(): Promise<string> {
    const keyPair = await this.getOrGenerateKeyPair();
    return keyPair.privateKey;
  }

  /**
   * Clear stored keys (for logout/reset)
   */
  async clearKeys(): Promise<void> {
    await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);
    await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  }
}

// Export singleton instance
export const keyManager = new KeyManager();
