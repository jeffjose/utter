import { x25519 } from '@noble/curves/ed25519.js';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

/**
 * Manages X25519 keypairs for E2E encryption
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
   * Get or generate X25519 keypair
   */
  public getOrGenerateKeyPair(): void {
    if (fs.existsSync(this.keyPath)) {
      this.loadKeyPair();
    } else {
      console.log(`${colors.cyan}🔑 Generating new keypair${colors.reset}`);
      this.generateAndSaveKeyPair();
    }
  }

  /**
   * Generate new X25519 keypair and save to file
   */
  private generateAndSaveKeyPair(): void {
    // Generate X25519 keypair
    const privateKeyBytes = randomBytes(32);
    this.privateKey = new Uint8Array(privateKeyBytes);
    this.publicKey = x25519.getPublicKey(this.privateKey);

    // Save private key to file
    fs.writeFileSync(this.keyPath, Buffer.from(this.privateKey));

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
      fs.chmodSync(this.keyPath, 0o600); // rw------- (owner only)
    }
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
    this.publicKey = x25519.getPublicKey(this.privateKey);
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
      console.log(`${colors.green}✓ Keys cleared${colors.reset}`);
    }
    this.privateKey = null;
    this.publicKey = null;
  }
}
