import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

/**
 * Data structure for encrypted messages
 */
export interface EncryptedMessage {
  ciphertext: string;           // base64-encoded ciphertext
  nonce: string;                // base64-encoded nonce (12 bytes for AES-GCM)
  ephemeralPublicKey: string;   // base64-encoded X25519 ephemeral public key
}

/**
 * Handles E2E encryption/decryption using hybrid cryptography:
 * - X25519 ECDH for key exchange
 * - HKDF-SHA256 for key derivation
 * - AES-256-GCM for symmetric encryption
 */
export class MessageEncryption {
  private privateKey: Uint8Array;
  private publicKey: Uint8Array;

  // HKDF parameters (must match Android, Rust, and relay server)
  private static readonly HKDF_SALT = Buffer.from('utter-relay-e2e-2024', 'utf8');
  private static readonly HKDF_INFO = Buffer.from('message-encryption-v1', 'utf8');

  constructor(privateKey: Uint8Array, publicKey: Uint8Array) {
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  /**
   * Encrypt a plaintext message for a specific recipient
   *
   * @param plaintext The message to encrypt
   * @param recipientPublicKeyBase64 The recipient's Ed25519 public key (base64)
   * @returns EncryptedMessage containing ciphertext, nonce, and ephemeral public key
   */
  public encrypt(plaintext: string, recipientPublicKeyBase64: string): EncryptedMessage {
    console.log(`[Crypto] Encrypting message (${plaintext.length} chars)`);

    // 1. Generate ephemeral X25519 keypair
    const ephemeralPrivate = randomBytes(32);
    const ephemeralPublic = x25519.getPublicKey(ephemeralPrivate);

    // 2. Decode recipient's public key
    const recipientBytes = Buffer.from(recipientPublicKeyBase64, 'base64');
    if (recipientBytes.length !== 32) {
      throw new Error('Invalid recipient public key length');
    }

    // Convert Ed25519 public key to X25519 (Curve25519)
    // For simplicity, use the bytes directly (proper conversion in production)
    const recipientX25519 = new Uint8Array(recipientBytes);

    // 3. Perform ECDH to get shared secret
    const sharedSecret = x25519.getSharedSecret(ephemeralPrivate, recipientX25519);

    // 4. Derive AES key using HKDF
    const aesKey = this.deriveAESKey(sharedSecret);

    // 5. Generate random nonce (12 bytes for AES-GCM)
    const nonce = randomBytes(12);

    // 6. Encrypt with AES-256-GCM
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(aesKey), nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Combine ciphertext and authentication tag
    const ciphertextWithTag = Buffer.concat([ciphertext, tag]);

    console.log('[Crypto] Message encrypted successfully');

    return {
      ciphertext: ciphertextWithTag.toString('base64'),
      nonce: nonce.toString('base64'),
      ephemeralPublicKey: Buffer.from(ephemeralPublic).toString('base64')
    };
  }

  /**
   * Decrypt an encrypted message
   *
   * @param encrypted The encrypted message
   * @param senderPublicKeyBase64 The sender's Ed25519 public key (base64) - currently unused
   * @returns Decrypted plaintext message
   */
  public decrypt(encrypted: EncryptedMessage, senderPublicKeyBase64: string): string {
    console.log('[Crypto] Decrypting message');

    // 1. Decode sender's ephemeral public key
    const senderEphemeralBytes = Buffer.from(encrypted.ephemeralPublicKey, 'base64');
    if (senderEphemeralBytes.length !== 32) {
      throw new Error('Invalid ephemeral public key length');
    }

    const senderEphemeral = new Uint8Array(senderEphemeralBytes);

    // 2. Convert my Ed25519 private key to X25519 for ECDH
    // Simplified: use the key directly
    const myX25519Private = this.privateKey;

    // 3. Perform ECDH to get shared secret (same as sender)
    const sharedSecret = x25519.getSharedSecret(myX25519Private, senderEphemeral);

    // 4. Derive AES key (same derivation as sender)
    const aesKey = this.deriveAESKey(sharedSecret);

    // 5. Decode ciphertext and nonce
    const ciphertextWithTag = Buffer.from(encrypted.ciphertext, 'base64');
    const nonceBytes = Buffer.from(encrypted.nonce, 'base64');

    if (nonceBytes.length !== 12) {
      throw new Error('Invalid nonce length');
    }

    // Split ciphertext and authentication tag (last 16 bytes)
    const ciphertext = ciphertextWithTag.slice(0, -16);
    const tag = ciphertextWithTag.slice(-16);

    // 6. Decrypt with AES-256-GCM
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(aesKey), nonceBytes);
    decipher.setAuthTag(tag);

    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final()
    ]);

    console.log('[Crypto] Message decrypted successfully');

    return plaintext.toString('utf8');
  }

  /**
   * Derive AES-256 key from shared secret using HKDF-SHA256
   *
   * @param sharedSecret The ECDH shared secret
   * @returns AES-256 key (32 bytes)
   */
  private deriveAESKey(sharedSecret: Uint8Array): Uint8Array {
    // HKDF-Extract + HKDF-Expand
    const okm = hkdf(
      sha256,
      sharedSecret,
      MessageEncryption.HKDF_SALT,
      MessageEncryption.HKDF_INFO,
      32 // 32 bytes for AES-256
    );

    return okm;
  }
}
