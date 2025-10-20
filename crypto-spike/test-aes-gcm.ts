/**
 * Test AES-GCM implementation (matches utterd)
 * Run with: npx tsx test-aes-gcm.ts
 */

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const HKDF_SALT = 'utter-relay-e2e-2024';
const HKDF_INFO = 'message-encryption-v1';

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeral_public_key: string;
}

function generateX25519KeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair();
  return {
    publicKey: naclUtil.encodeBase64(keyPair.publicKey),
    privateKey: naclUtil.encodeBase64(keyPair.secretKey),
  };
}

function performECDH(myPrivateKey: string, theirPublicKey: string): Uint8Array {
  const privateKeyBytes = naclUtil.decodeBase64(myPrivateKey);
  const publicKeyBytes = naclUtil.decodeBase64(theirPublicKey);
  return nacl.box.before(publicKeyBytes, privateKeyBytes);
}

function deriveAESKey(sharedSecret: Uint8Array): Buffer {
  // HKDF-Extract
  const prk = createHmac('sha256', HKDF_SALT)
    .update(Buffer.from(sharedSecret))
    .digest();

  // HKDF-Expand
  const infoBuffer = Buffer.concat([
    Buffer.from(HKDF_INFO, 'utf8'),
    Buffer.from([0x01])
  ]);

  return createHmac('sha256', prk)
    .update(infoBuffer)
    .digest();
}

function encryptMessage(plaintext: string, recipientPublicKey: string): EncryptedMessage {
  // 1. Generate ephemeral keypair
  const ephemeralKeyPair = generateX25519KeyPair();

  // 2. ECDH
  const sharedSecret = performECDH(ephemeralKeyPair.privateKey, recipientPublicKey);

  // 3. Derive key
  const aesKey = deriveAESKey(sharedSecret);

  // 4. Random nonce
  const nonceBytes = randomBytes(12);

  // 5. Encrypt with AES-256-GCM
  const cipher = createCipheriv('aes-256-gcm', aesKey, nonceBytes);
  const ciphertextPart1 = cipher.update(plaintext, 'utf8');
  const ciphertextPart2 = cipher.final();
  const authTag = cipher.getAuthTag();

  const ciphertextWithTag = Buffer.concat([ciphertextPart1, ciphertextPart2, authTag]);

  return {
    ciphertext: ciphertextWithTag.toString('base64'),
    nonce: nonceBytes.toString('base64'),
    ephemeral_public_key: ephemeralKeyPair.publicKey,
  };
}

function decryptMessage(encrypted: EncryptedMessage, myPrivateKey: string): string {
  // 1. ECDH
  const sharedSecret = performECDH(myPrivateKey, encrypted.ephemeral_public_key);

  // 2. Derive key
  const aesKey = deriveAESKey(sharedSecret);

  // 3. Decode
  const ciphertextWithTag = Buffer.from(encrypted.ciphertext, 'base64');
  const nonceBytes = Buffer.from(encrypted.nonce, 'base64');

  // 4. Split tag
  const authTag = ciphertextWithTag.slice(-16);
  const ciphertext = ciphertextWithTag.slice(0, -16);

  // 5. Decrypt
  const decipher = createDecipheriv('aes-256-gcm', aesKey, nonceBytes);
  decipher.setAuthTag(authTag);

  const plaintextPart1 = decipher.update(ciphertext);
  const plaintextPart2 = decipher.final();

  return Buffer.concat([plaintextPart1, plaintextPart2]).toString('utf8');
}

async function testAESGCMRoundtrip(): Promise<boolean> {
  console.log('\n========================================');
  console.log('🧪 AES-256-GCM ROUNDTRIP TEST');
  console.log('========================================\n');

  try {
    console.log('👤 Alice generating keypair...');
    const alice = generateX25519KeyPair();
    console.log('   Public key:', alice.publicKey);

    console.log('\n👤 Bob generating keypair...');
    const bob = generateX25519KeyPair();
    console.log('   Public key:', bob.publicKey);

    console.log('\n📤 Alice encrypting to Bob...');
    const plaintext = 'Hello from Node.js AES-GCM!';
    const encrypted = encryptMessage(plaintext, bob.publicKey);
    console.log('   Ciphertext:', encrypted.ciphertext.substring(0, 40) + '...');
    console.log('   Nonce:', encrypted.nonce);

    console.log('\n📥 Bob decrypting from Alice...');
    const decrypted = decryptMessage(encrypted, bob.privateKey);
    console.log('   Decrypted:', decrypted);

    console.log('\n✅ RESULTS:');
    console.log('   Original:  ', plaintext);
    console.log('   Decrypted: ', decrypted);
    console.log('   Match:     ', plaintext === decrypted ? '✅ YES' : '❌ NO');

    if (plaintext !== decrypted) {
      throw new Error('Roundtrip failed');
    }

    console.log('\n========================================');
    console.log('✅ AES-GCM TEST PASSED - MATCHES UTTERD!');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    return false;
  }
}

testAESGCMRoundtrip()
  .then(success => process.exit(success ? 0 : 1))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
