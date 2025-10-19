import { ed25519 } from '@noble/curves/ed25519';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Manages Ed25519 keypairs for E2E encryption
 */
export class KeyManager {
  private privateKey: Uint8Array | null = null;
  private publicKey: Uint8Array | null = null;
  private keyPath: string;

  constructor() {
    // Store keys in ~/.config/utter-client/keypair.key
    const configDir = path.join(os.homedir(), '.config', 'utter-client');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    this.keyPath = path.join(configDir, 'keypair.key');
  }

  /**
   * Get or generate Ed25519 keypair
   */
  public getOrGenerateKeyPair(): void {
    if (fs.existsSync(this.keyPath)) {
      console.log('[Crypto] Loading existing keypair');
      this.loadKeyPair();
    } else {
      console.log('[Crypto] Generating new Ed25519 keypair');
      this.generateAndSaveKeyPair();
    }
  }

  /**
   * Generate new Ed25519 keypair and save to file
   */
  private generateAndSaveKeyPair(): void {
    // Generate Ed25519 keypair
    const privateKeyBytes = randomBytes(32);
    this.privateKey = new Uint8Array(privateKeyBytes);
    this.publicKey = ed25519.getPublicKey(this.privateKey);

    // Save private key to file
    fs.writeFileSync(this.keyPath, Buffer.from(this.privateKey));

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.keyPath, 0o600); // rw------- (owner only)
    }

    console.log('[Crypto] Keypair generated and saved to', this.keyPath);
  }

  /**
   * Load keypair from file
   */
  private loadKeyPair(): void {
    const keyBytes = fs.readFileSync(this.keyPath);

    if (keyBytes.length !== 32) {
      throw new Error(`Invalid key length: ${keyBytes.length} bytes (expected 32)`);
    }

    this.privateKey = new Uint8Array(keyBytes);
    this.publicKey = ed25519.getPublicKey(this.privateKey);
  }

  /**
   * Get the public key in base64 format
   */
  public getPublicKeyBase64(): string {
    if (!this.publicKey) {
      throw new Error('No keypair loaded. Call getOrGenerateKeyPair() first.');
    }
    return Buffer.from(this.publicKey).toString('base64');
  }

  /**
   * Get the private key bytes
   */
  public getPrivateKeyBytes(): Uint8Array {
    if (!this.privateKey) {
      throw new Error('No keypair loaded');
    }
    return this.privateKey;
  }

  /**
   * Get the public key bytes
   */
  public getPublicKeyBytes(): Uint8Array {
    if (!this.publicKey) {
      throw new Error('No keypair loaded');
    }
    return this.publicKey;
  }

  /**
   * Clear all stored keys (delete key file)
   */
  public clearKeys(): void {
    if (fs.existsSync(this.keyPath)) {
      fs.unlinkSync(this.keyPath);
      console.log('[Crypto] Keys cleared');
    }
    this.privateKey = null;
    this.publicKey = null;
  }
}
