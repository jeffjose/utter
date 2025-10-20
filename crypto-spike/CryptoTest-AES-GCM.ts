/**
 * Phase 0: Crypto Implementation - AES-GCM Version (Matches utterd)
 *
 * This version uses the same crypto as utterd:
 * - X25519 ECDH key exchange
 * - HKDF-SHA256 key derivation
 * - AES-256-GCM encryption
 */

import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { createCipheriv, createDecipheriv, createHmac } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface KeyPair {
  publicKey: string;  // base64
  privateKey: string; // base64
}

export interface EncryptedMessage {
  ciphertext: string;         // base64
  nonce: string;              // base64 (12 bytes for AES-GCM)
  ephemeral_public_key: string; // base64 (sender's ephemeral public key)
}

// HKDF parameters (must match utterd)
const HKDF_SALT = 'utter-relay-e2e-2024';
const HKDF_INFO = 'message-encryption-v1';

// ============================================================================
// KEY GENERATION (X25519)
// ============================================================================

export async function generateX25519KeyPair(): Promise<KeyPair> {
  console.log('🔑 Generating X25519 keypair...');

  const keyPair = nacl.box.keyPair();

  const result = {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };

  console.log('✅ Keypair generated');
  return result;
}

// ============================================================================
// ECDH KEY EXCHANGE (X25519)
// ============================================================================

export function performECDH(
  myPrivateKey: string,
  theirPublicKey: string
): Uint8Array {
  console.log('🔄 Performing ECDH...');

  const privateKeyBytes = naclUtil.decodeBase64(myPrivateKey);
  const publicKeyBytes = naclUtil.decodeBase64(theirPublicKey);

  // Perform X25519 scalar multiplication (ECDH)
  const sharedSecret = nacl.box.before(publicKeyBytes, privateKeyBytes);

  console.log('✅ ECDH complete');
  return sharedSecret;
}

// ============================================================================
// KEY DERIVATION (HKDF-SHA256) - Matches utterd exactly
// ============================================================================

function deriveAESKey(sharedSecret: Uint8Array): Buffer {
  console.log('🔐 Deriving AES key with HKDF-SHA256...');

  // HKDF-Extract: HMAC-SHA256(salt, shared_secret)
  const prk = createHmac('sha256', HKDF_SALT)
    .update(Buffer.from(sharedSecret))
    .digest();

  // HKDF-Expand: HMAC-SHA256(prk, info | 0x01)
  const infoBuffer = Buffer.concat([
    Buffer.from(HKDF_INFO, 'utf8'),
    Buffer.from([0x01]) // Counter for first block
  ]);

  const aesKey = createHmac('sha256', prk)
    .update(infoBuffer)
    .digest();

  console.log('✅ AES key derived (32 bytes)');
  return aesKey;
}

// ============================================================================
// AES-256-GCM ENCRYPTION - Matches utterd exactly
// ============================================================================

export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: string
): Promise<EncryptedMessage> {
  console.log('🔒 Encrypting message with AES-256-GCM...');
  console.log('   Plaintext:', plaintext);

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
    const authTag = cipher.getAuthTag(); // 16-byte authentication tag

    // Concatenate ciphertext + auth tag (this is what AES-GCM returns)
    const ciphertextWithTag = Buffer.concat([ciphertextPart1, ciphertextPart2, authTag]);

    const result: EncryptedMessage = {
      ciphertext: ciphertextWithTag.toString('base64'),
      nonce: Buffer.from(nonceBytes).toString('base64'),
      ephemeral_public_key: ephemeralKeyPair.publicKey,
    };

    console.log('✅ Encrypted successfully');
    console.log('   Ciphertext length:', result.ciphertext.length);

    return result;
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw error;
  }
}

// ============================================================================
// AES-256-GCM DECRYPTION - Matches utterd exactly
// ============================================================================

export async function decryptMessage(
  encrypted: EncryptedMessage,
  myPrivateKey: string
): Promise<string> {
  console.log('🔓 Decrypting message with AES-256-GCM...');

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

    console.log('✅ Decrypted successfully');
    console.log('   Plaintext:', plaintext);

    return plaintext;
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw error;
  }
}

// ============================================================================
// ROUNDTRIP TEST
// ============================================================================

export async function testCryptoRoundtrip(): Promise<boolean> {
  console.log('\n========================================');
  console.log('🧪 AES-GCM ROUNDTRIP TEST (Matches utterd)');
  console.log('========================================\n');

  try {
    // 1. Generate keypairs for Alice and Bob
    console.log('👤 Generating Alice\'s keypair...');
    const alice = await generateX25519KeyPair();

    console.log('\n👤 Generating Bob\'s keypair...');
    const bob = await generateX25519KeyPair();

    // 2. Alice encrypts message to Bob
    console.log('\n📤 Alice encrypts message to Bob...');
    const plaintext = 'Hello from Expo with AES-GCM!';
    const encrypted = await encryptMessage(plaintext, bob.publicKey);

    // 3. Bob decrypts message from Alice
    console.log('\n📥 Bob decrypts message from Alice...');
    const decrypted = await decryptMessage(encrypted, bob.privateKey);

    // 4. Verify roundtrip
    console.log('\n✅ ROUNDTRIP TEST RESULTS:');
    console.log('   Original:  ', plaintext);
    console.log('   Decrypted: ', decrypted);
    console.log('   Match:     ', plaintext === decrypted ? '✅ YES' : '❌ NO');

    if (plaintext !== decrypted) {
      throw new Error('Roundtrip failed');
    }

    console.log('\n========================================');
    console.log('✅ AES-GCM CRYPTO TEST PASSED');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ CRYPTO TEST FAILED');
    console.error('========================================');
    console.error(error);
    return false;
  }
}

// ============================================================================
// UTTERD COMPATIBILITY TEST
// ============================================================================

export async function testUtterdCompatibility(
  utterdPublicKey?: string
): Promise<void> {
  console.log('\n========================================');
  console.log('🔬 UTTERD COMPATIBILITY TEST');
  console.log('========================================\n');

  try {
    const mobileKeys = await generateX25519KeyPair();
    console.log('📱 Mobile public key:');
    console.log(mobileKeys.publicKey);

    if (utterdPublicKey) {
      const testMessage = 'Hello utterd from Expo with AES-GCM!';
      const encrypted = await encryptMessage(testMessage, utterdPublicKey);

      console.log('\n📤 Encrypted message for utterd:');
      console.log(JSON.stringify({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        ephemeral_public_key: encrypted.ephemeral_public_key,
        senderPublicKey: mobileKeys.publicKey,
      }, null, 2));

      console.log('\n📋 Send this to utterd via relay server');
    } else {
      console.log('\n⚠️  No utterd public key provided');
    }

    console.log('\n========================================');
    console.log('✅ TEST DATA GENERATED');
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}
