/**
 * Standalone Node.js test for crypto functions
 * Run with: npx tsx test-node.ts
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { randomBytes } from 'crypto';

// Override expo-crypto with Node.js crypto
const Crypto = {
  getRandomBytesAsync: async (size: number): Promise<Uint8Array> => {
    return new Uint8Array(randomBytes(size));
  }
};

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
}

// Generate X25519 keypair
async function generateX25519KeyPair(): Promise<KeyPair> {
  console.log('🔑 Generating X25519 keypair...');
  const keyPair = nacl.box.keyPair();

  const result = {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };

  console.log('✅ Keypair generated');
  return result;
}

// Perform ECDH
function performECDH(myPrivateKey: string, theirPublicKey: string): Uint8Array {
  const privateKeyBytes = naclUtil.decodeBase64(myPrivateKey);
  const publicKeyBytes = naclUtil.decodeBase64(theirPublicKey);
  return nacl.box.before(publicKeyBytes, privateKeyBytes);
}

// Encrypt message
async function encryptMessage(
  plaintext: string,
  recipientPublicKey: string,
  senderPrivateKey: string
): Promise<EncryptedMessage> {
  console.log('🔒 Encrypting:', plaintext);

  const ephemeralKeyPair = await generateX25519KeyPair();
  const sharedSecret = performECDH(ephemeralKeyPair.privateKey, recipientPublicKey);
  const nonceBytes = await Crypto.getRandomBytesAsync(24);
  const plaintextBytes = naclUtil.decodeUTF8(plaintext);
  const ciphertextBytes = nacl.secretbox(plaintextBytes, nonceBytes, sharedSecret);

  if (!ciphertextBytes) {
    throw new Error('Encryption failed');
  }

  const result = {
    ciphertext: naclUtil.encodeBase64(ciphertextBytes),
    nonce: naclUtil.encodeBase64(nonceBytes),
    ephemeralPublicKey: ephemeralKeyPair.publicKey,
  };

  console.log('✅ Encrypted');
  return result;
}

// Decrypt message
async function decryptMessage(
  encrypted: EncryptedMessage,
  myPrivateKey: string
): Promise<string> {
  console.log('🔓 Decrypting...');

  const sharedSecret = performECDH(myPrivateKey, encrypted.ephemeralPublicKey);
  const ciphertextBytes = naclUtil.decodeBase64(encrypted.ciphertext);
  const nonceBytes = naclUtil.decodeBase64(encrypted.nonce);
  const plaintextBytes = nacl.secretbox.open(ciphertextBytes, nonceBytes, sharedSecret);

  if (!plaintextBytes) {
    throw new Error('Decryption failed');
  }

  const plaintext = naclUtil.encodeUTF8(plaintextBytes);
  console.log('✅ Decrypted:', plaintext);
  return plaintext;
}

// Run roundtrip test
async function testCryptoRoundtrip(): Promise<boolean> {
  console.log('\n========================================');
  console.log('🧪 CRYPTO ROUNDTRIP TEST (Node.js)');
  console.log('========================================\n');

  try {
    // Generate keypairs for Alice and Bob
    console.log('👤 Alice generating keypair...');
    const alice = await generateX25519KeyPair();

    console.log('\n👤 Bob generating keypair...');
    const bob = await generateX25519KeyPair();

    // Alice encrypts to Bob
    console.log('\n📤 Alice encrypting to Bob...');
    const plaintext = 'Hello from Node.js crypto test!';
    const encrypted = await encryptMessage(plaintext, bob.publicKey, alice.privateKey);

    // Bob decrypts from Alice
    console.log('\n📥 Bob decrypting from Alice...');
    const decrypted = await decryptMessage(encrypted, bob.privateKey);

    // Verify
    console.log('\n✅ RESULTS:');
    console.log('   Original:  ', plaintext);
    console.log('   Decrypted: ', decrypted);
    console.log('   Match:     ', plaintext === decrypted ? '✅ YES' : '❌ NO');

    if (plaintext !== decrypted) {
      throw new Error('Roundtrip failed');
    }

    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED - CRYPTO WORKS!');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n========================================');
    console.error('❌ TEST FAILED');
    console.error('========================================');
    console.error(error);
    return false;
  }
}

// Run the test
testCryptoRoundtrip()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
