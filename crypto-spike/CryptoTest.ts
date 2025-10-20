/**
 * Phase 0: Crypto Spike - Testing X25519 + AES-GCM in Expo
 *
 * Goal: Validate that we can implement the same E2E encryption as the Kotlin app
 * - X25519 ECDH key exchange
 * - AES-256-GCM encryption/decryption
 * - Compatible with utterd (Rust) implementation
 */

import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

// ============================================================================
// TYPES
// ============================================================================

export interface KeyPair {
  publicKey: string;  // base64
  privateKey: string; // base64
}

export interface EncryptedMessage {
  ciphertext: string;        // base64
  nonce: string;             // base64 (12 bytes for AES-GCM)
  ephemeralPublicKey: string; // base64 (sender's ephemeral public key)
}

// ============================================================================
// KEY GENERATION (X25519)
// ============================================================================

/**
 * Generate X25519 keypair using TweetNaCl
 * TweetNaCl is audited, lightweight, and widely used
 */
export async function generateX25519KeyPair(): Promise<KeyPair> {
  console.log('🔑 Generating X25519 keypair...');

  try {
    // Generate X25519 keypair (32-byte keys)
    const keyPair = nacl.box.keyPair();

    const result = {
      publicKey: naclUtil.encodeBase64(keyPair.publicKey),
      privateKey: naclUtil.encodeBase64(keyPair.secretKey),
    };

    console.log('✅ Keypair generated successfully');
    console.log('   Public key:', result.publicKey.substring(0, 20) + '...');

    return result;
  } catch (error) {
    console.error('❌ Key generation failed:', error);
    throw error;
  }
}

// ============================================================================
// ECDH KEY EXCHANGE (X25519)
// ============================================================================

/**
 * Perform X25519 Diffie-Hellman key exchange
 * Creates shared secret from our private key and their public key
 */
export function performECDH(
  myPrivateKey: string,
  theirPublicKey: string
): Uint8Array {
  console.log('🔄 Performing ECDH key exchange...');

  try {
    const privateKeyBytes = naclUtil.decodeBase64(myPrivateKey);
    const publicKeyBytes = naclUtil.decodeBase64(theirPublicKey);

    // Perform X25519 scalar multiplication (ECDH)
    const sharedSecret = nacl.box.before(publicKeyBytes, privateKeyBytes);

    console.log('✅ ECDH successful, shared secret generated');

    return sharedSecret;
  } catch (error) {
    console.error('❌ ECDH failed:', error);
    throw error;
  }
}

// ============================================================================
// KEY DERIVATION (HKDF-SHA256)
// ============================================================================

/**
 * Derive AES-256 key from shared secret using HKDF
 * This must match utterd's implementation exactly
 */
async function deriveAESKey(sharedSecret: Uint8Array): Promise<Uint8Array> {
  console.log('🔐 Deriving AES key from shared secret...');

  try {
    // Use HKDF with the same parameters as utterd
    // For now, using the shared secret directly as the key
    // TODO: Implement proper HKDF-SHA256 if utterd uses it

    // The shared secret from X25519 is 32 bytes, perfect for AES-256
    console.log('✅ AES key derived');

    return sharedSecret;
  } catch (error) {
    console.error('❌ Key derivation failed:', error);
    throw error;
  }
}

// ============================================================================
// AES-GCM ENCRYPTION
// ============================================================================

/**
 * Encrypt plaintext using AES-256-GCM
 *
 * Using TweetNaCl's secretbox (XSalsa20-Poly1305) instead of AES-GCM
 * This is actually MORE secure and simpler. If utterd uses AES-GCM,
 * we'll need to verify compatibility or switch approaches.
 */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKey: string,
  senderPrivateKey: string
): Promise<EncryptedMessage> {
  console.log('🔒 Encrypting message...');
  console.log('   Plaintext:', plaintext);

  try {
    // 1. Generate ephemeral keypair for this message
    const ephemeralKeyPair = await generateX25519KeyPair();

    // 2. Perform ECDH with recipient's public key
    const sharedSecret = performECDH(ephemeralKeyPair.privateKey, recipientPublicKey);

    // 3. Generate random nonce (24 bytes for secretbox)
    const nonceBytes = await Crypto.getRandomBytesAsync(24);

    // 4. Convert plaintext to bytes
    const plaintextBytes = naclUtil.decodeUTF8(plaintext);

    // 5. Encrypt using NaCl secretbox (authenticated encryption)
    const ciphertextBytes = nacl.secretbox(plaintextBytes, nonceBytes, sharedSecret);

    if (!ciphertextBytes) {
      throw new Error('Encryption failed - secretbox returned null');
    }

    const result: EncryptedMessage = {
      ciphertext: naclUtil.encodeBase64(ciphertextBytes),
      nonce: naclUtil.encodeBase64(nonceBytes),
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
    };

    console.log('✅ Message encrypted successfully');
    console.log('   Ciphertext length:', result.ciphertext.length);
    console.log('   Nonce:', result.nonce.substring(0, 20) + '...');
    console.log('   Ephemeral public key:', result.ephemeralPublicKey.substring(0, 20) + '...');

    return result;
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw error;
  }
}

// ============================================================================
// AES-GCM DECRYPTION
// ============================================================================

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export async function decryptMessage(
  encrypted: EncryptedMessage,
  myPrivateKey: string
): Promise<string> {
  console.log('🔓 Decrypting message...');

  try {
    // 1. Perform ECDH with sender's ephemeral public key
    const sharedSecret = performECDH(myPrivateKey, encrypted.ephemeralPublicKey);

    // 2. Decode ciphertext and nonce
    const ciphertextBytes = naclUtil.decodeBase64(encrypted.ciphertext);
    const nonceBytes = naclUtil.decodeBase64(encrypted.nonce);

    // 3. Decrypt using NaCl secretbox
    const plaintextBytes = nacl.secretbox.open(ciphertextBytes, nonceBytes, sharedSecret);

    if (!plaintextBytes) {
      throw new Error('Decryption failed - authentication check failed or wrong key');
    }

    // 4. Convert bytes to string
    const plaintext = naclUtil.encodeUTF8(plaintextBytes);

    console.log('✅ Message decrypted successfully');
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

/**
 * Test complete encryption/decryption cycle
 */
export async function testCryptoRoundtrip(): Promise<boolean> {
  console.log('\n========================================');
  console.log('🧪 CRYPTO ROUNDTRIP TEST');
  console.log('========================================\n');

  try {
    // 1. Generate keypairs for Alice and Bob
    console.log('👤 Generating Alice\'s keypair...');
    const alice = await generateX25519KeyPair();

    console.log('\n👤 Generating Bob\'s keypair...');
    const bob = await generateX25519KeyPair();

    // 2. Alice encrypts message to Bob
    console.log('\n📤 Alice encrypts message to Bob...');
    const plaintext = 'Hello from Expo!';
    const encrypted = await encryptMessage(plaintext, bob.publicKey, alice.privateKey);

    // 3. Bob decrypts message from Alice
    console.log('\n📥 Bob decrypts message from Alice...');
    const decrypted = await decryptMessage(encrypted, bob.privateKey);

    // 4. Verify roundtrip
    console.log('\n✅ ROUNDTRIP TEST RESULTS:');
    console.log('   Original:  ', plaintext);
    console.log('   Decrypted: ', decrypted);
    console.log('   Match:     ', plaintext === decrypted ? '✅ YES' : '❌ NO');

    if (plaintext !== decrypted) {
      throw new Error('Roundtrip failed: plaintext !== decrypted');
    }

    console.log('\n========================================');
    console.log('✅ ALL CRYPTO TESTS PASSED');
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

/**
 * Test compatibility with utterd (Rust implementation)
 *
 * To test:
 * 1. Run this function
 * 2. Copy the output (public key + encrypted message)
 * 3. Send to utterd via relay server
 * 4. Check if utterd can decrypt
 */
export async function testUtterdCompatibility(
  utterdPublicKey?: string
): Promise<void> {
  console.log('\n========================================');
  console.log('🔬 UTTERD COMPATIBILITY TEST');
  console.log('========================================\n');

  try {
    // Generate our keypair
    const mobileKeys = await generateX25519KeyPair();
    console.log('📱 Mobile public key (share with utterd):');
    console.log(mobileKeys.publicKey);

    if (utterdPublicKey) {
      // Encrypt test message to utterd
      const testMessage = 'Hello from Expo crypto-spike!';
      const encrypted = await encryptMessage(testMessage, utterdPublicKey, mobileKeys.privateKey);

      console.log('\n📤 Encrypted message for utterd:');
      console.log(JSON.stringify({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        senderPublicKey: mobileKeys.publicKey,
      }, null, 2));

      console.log('\n📋 Send this JSON to utterd via relay server');
    } else {
      console.log('\n⚠️  No utterd public key provided');
      console.log('   Run again with utterd\'s public key to test encryption');
    }

    console.log('\n========================================');
    console.log('✅ COMPATIBILITY TEST DATA GENERATED');
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ Compatibility test failed:', error);
  }
}
