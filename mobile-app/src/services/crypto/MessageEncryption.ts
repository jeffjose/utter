/**
 * E2E Encryption Module - Matches utterd implementation
 *
 * Uses:
 * - X25519 ECDH key exchange (via TweetNaCl)
 * - HKDF-SHA256 key derivation
 * - AES-256-GCM encryption (via react-native-quick-crypto)
 */

import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { Buffer } from '@craftzdog/react-native-buffer';
// @ts-ignore - react-native-quick-crypto provides crypto polyfill
import { createCipheriv, createDecipheriv, createHmac } from 'react-native-quick-crypto';
import { HKDF_SALT, HKDF_INFO } from '../../utils/constants';
import type { EncryptedMessage } from '../../types/messages';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate X25519 keypair using TweetNaCl
 * Uses expo-crypto for random bytes (PRNG)
 */
export async function generateX25519KeyPair(): Promise<KeyPair> {
  // Generate 32 random bytes using expo-crypto (not nacl.randomBytes which needs Node crypto)
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const keyPair = nacl.box.keyPair.fromSecretKey(new Uint8Array(randomBytes));

  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

/**
 * Perform X25519 ECDH key exchange
 * Returns raw X25519 shared secret (not processed through HSalsa20)
 */
export function performECDH(myPrivateKey: string, theirPublicKey: string): Uint8Array {
  const privateKeyBytes = naclUtil.decodeBase64(myPrivateKey);
  const publicKeyBytes = naclUtil.decodeBase64(theirPublicKey);

  // Use scalarMult for raw X25519 ECDH (not box.before which applies HSalsa20)
  return nacl.scalarMult(privateKeyBytes, publicKeyBytes);
}

/**
 * Derive AES-256 key from shared secret using HKDF-SHA256
 * Matches utterd's implementation exactly
 */
function deriveAESKey(sharedSecret: Uint8Array): Buffer {
  // HKDF-Extract: HMAC-SHA256(salt, shared_secret)
  const prk = createHmac('sha256', HKDF_SALT)
    .update(Buffer.from(sharedSecret))
    .digest();

  // HKDF-Expand: HMAC-SHA256(prk, info | 0x01)
  const infoBuffer = Buffer.concat([
    Buffer.from(HKDF_INFO, 'utf8'),
    Buffer.from([0x01]), // Counter for first block
  ]);

  const aesKey = createHmac('sha256', prk).update(infoBuffer).digest();

  return aesKey;
}

/**
 * Encrypt plaintext message to recipient
 * Returns encrypted message compatible with utterd
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: string
): Promise<EncryptedMessage> {
  try {
    // 1. Generate ephemeral keypair
    const ephemeralKeyPair = await generateX25519KeyPair();

    // 2. Perform ECDH with recipient's public key
    const sharedSecret = performECDH(ephemeralKeyPair.privateKey, recipientPublicKey);

    // 3. Derive AES-256 key using HKDF
    const aesKey = deriveAESKey(sharedSecret);

    // 4. Generate random nonce (12 bytes for AES-GCM)
    const nonceBytes = await Crypto.getRandomBytesAsync(12);

    // 5. Encrypt with AES-256-GCM
    const cipher = createCipheriv('aes-256-gcm', aesKey, Buffer.from(nonceBytes));

    const ciphertextPart1 = cipher.update(plaintext, 'utf8');
    const ciphertextPart2 = cipher.final();
    const authTag = cipher.getAuthTag();

    // Concatenate ciphertext + auth tag
    const ciphertextWithTag = Buffer.concat([ciphertextPart1, ciphertextPart2, authTag]);

    return {
      ciphertext: ciphertextWithTag.toString('base64'),
      nonce: Buffer.from(nonceBytes).toString('base64'),
      ephemeral_public_key: ephemeralKeyPair.publicKey,
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypt encrypted message from sender
 * Compatible with utterd's encryption
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  myPrivateKey: string
): Promise<string> {
  try {
    // 1. Perform ECDH with sender's ephemeral public key
    const sharedSecret = performECDH(myPrivateKey, encrypted.ephemeral_public_key);

    // 2. Derive AES-256 key (same derivation as sender)
    const aesKey = deriveAESKey(sharedSecret);

    // 3. Decode ciphertext and nonce
    const ciphertextWithTag = Buffer.from(encrypted.ciphertext, 'base64');
    const nonceBytes = Buffer.from(encrypted.nonce, 'base64');

    // 4. Split ciphertext and auth tag (last 16 bytes)
    const authTag = ciphertextWithTag.slice(-16);
    const ciphertext = ciphertextWithTag.slice(0, -16);

    // 5. Decrypt with AES-256-GCM
    const decipher = createDecipheriv('aes-256-gcm', aesKey, nonceBytes);
    decipher.setAuthTag(authTag);

    const plaintextPart1 = decipher.update(ciphertext);
    const plaintextPart2 = decipher.final();
    const plaintext = Buffer.concat([plaintextPart1, plaintextPart2]).toString('utf8');

    return plaintext;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
}
