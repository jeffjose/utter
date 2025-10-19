#!/usr/bin/env tsx

import WebSocket from 'ws';
import * as readline from 'readline';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { KeyManager, MessageEncryption } from './crypto/index.js';
import { OAuthManager } from './oauth/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment from root .env file
config({ path: path.join(__dirname, '../../.env') });

// Read version from package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
);
const VERSION = packageJson.version;

function getPlatformInfo(): string {
  const platform = os.platform();
  const release = os.release();

  if (platform === 'linux') {
    // Try to read /etc/os-release for distro info
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const match = osRelease.match(/PRETTY_NAME="([^"]+)"/);
      if (match) return match[1];
    } catch (e) {
      // Fallback to generic Linux
    }
    return `Linux ${release}`;
  } else if (platform === 'darwin') {
    return `macOS ${release}`;
  } else if (platform === 'win32') {
    return `Windows ${release}`;
  }

  return `${platform} ${release}`;
}

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
  publicKey?: string;
}

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function stripWsPrefix(url: string): string {
  return url.replace(/^wss?:\/\//, '');
}

function normalizeServerUrl(url: string): string {
  if (url.startsWith('ws://') || url.startsWith('wss://')) {
    return url;
  }
  return `ws://${url}`;
}

class TestClient {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private serverUrl: string;
  private deviceId: string;
  private deviceName: string;
  private devices: Device[] = [];
  private targetDevice: string | null = null;
  private targetDeviceName: string | null = null; // Remember target by name for restoration
  private rl: readline.Interface;
  private reconnectAttempts: number = 0;
  private keyManager: KeyManager;
  private messageEncryption: MessageEncryption;
  private oauthManager: OAuthManager | null = null;
  private idToken: string = '';

  constructor(serverUrl: string, deviceId: string = 'test-client-1', deviceName: string = 'Test Client') {
    this.serverUrl = serverUrl;
    this.deviceId = deviceId;
    this.deviceName = deviceName;

    // Initialize crypto
    this.keyManager = new KeyManager();
    this.keyManager.getOrGenerateKeyPair();
    this.messageEncryption = new MessageEncryption(
      this.keyManager.getPrivateKeyBytes(),
      this.keyManager.getPublicKeyBytes()
    );

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
      terminal: true
    });
  }

  async initialize(): Promise<void> {
    // Initialize OAuth if credentials are provided
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (clientId && clientSecret) {
      this.oauthManager = new OAuthManager(clientId, clientSecret);
      const tokens = await this.oauthManager.getOrAuthenticate();
      this.idToken = tokens.idToken;
      console.log('');
    } else {
      console.log(`${colors.yellow}⚠ No OAuth credentials found. Running in test mode.${colors.reset}`);
      console.log(`${colors.gray}Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable OAuth.${colors.reset}\n`);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        process.stdout.write(`\r\x1b[K`);
        this.connected = true;
        this.reconnectAttempts = 0;
        this.updatePrompt(); // Update prompt to show connected state
        this.register();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        process.stdout.write(`\r\x1b[K${colors.red}✗ Disconnected${colors.reset}`);
        this.connected = false;
        this.updatePrompt(); // Update prompt to show disconnected state
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        // Silently handle connection errors - reconnect will handle it
      });
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = 5000; // 5 seconds constant

    process.stdout.write(`\r${colors.yellow}Reconnecting in ${delay / 1000}s...${colors.reset}`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Will retry via scheduleReconnect in close handler
      });
    }, delay);
  }

  private register(): void {
    const publicKey = this.keyManager.getPublicKeyBase64();

    const registerMsg: any = {
      type: 'register',
      clientType: 'controller',
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      publicKey,
      version: `linux-test-client v${VERSION}`,
      platform: getPlatformInfo(),
      arch: os.arch()
    };

    // Include OAuth token if available
    if (this.idToken) {
      registerMsg.token = this.idToken;
    }

    this.send(registerMsg);
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'connected':
          // Silently acknowledged
          break;

        case 'registered':
          this.fetchDevices(); // Auto-refresh device list on registration
          break;

        case 'devices':
          this.handleDeviceList(msg.devices);
          // Auto-restore target if it exists in the new device list
          this.restoreTarget();
          break;

        case 'message':
        case 'text':
          console.log(`\n${colors.cyan}↓ ${msg.from}:${colors.reset} ${msg.content}`);
          this.updatePrompt();
          this.rl.prompt();
          break;

        case 'message_sent':
          // Message sent acknowledgment - silently ignore
          break;

        case 'error':
          console.log(`\n${colors.red}✗ ${msg.message}${colors.reset}`);
          this.updatePrompt();
          this.rl.prompt();
          break;

        default:
          // Silently ignore unknown message types
          break;
      }
    } catch (e) {
      console.error('Failed to parse message:', data);
    }
  }

  private handleDeviceList(devices: Device[]): void {
    this.devices = devices.filter(d => d.deviceType === 'target');

    // Validate current target still exists
    if (this.targetDevice && !this.devices.find(d => d.deviceId === this.targetDevice)) {
      console.log(`${colors.yellow}⚠ Target device went offline${colors.reset}`);
      this.targetDevice = null;
      this.targetDeviceName = null;
    }

    if (this.devices.length > 0) {
      console.log(`\n${colors.bright}Devices:${colors.reset}`);
      this.devices.forEach((device, idx) => {
        const statusIcon = device.status === 'online' ? `${colors.green}●${colors.reset}` : `${colors.gray}○${colors.reset}`;
        const isTarget = device.deviceId === this.targetDevice ? ` ${colors.green}(selected)${colors.reset}` : '';
        const compatNote = device.publicKey ? '' : ` ${colors.red}✗ (no encryption)${colors.reset}`;
        console.log(`  ${colors.cyan}${idx + 1}.${colors.reset} ${device.deviceName} ${statusIcon}${compatNote}${isTarget}`);
      });
      console.log(`${colors.gray}/device <number> to select${colors.reset}\n`);
    } else {
      console.log(`${colors.yellow}No devices found${colors.reset}\n`);
    }

    this.updatePrompt();
    this.rl.prompt();
  }

  private restoreTarget(): void {
    // Try to restore target by device name after reconnect
    if (!this.targetDevice && this.targetDeviceName) {
      const device = this.devices.find(d => d.deviceName === this.targetDeviceName);
      if (device) {
        this.targetDevice = device.deviceId;
        console.log(`${colors.green}✓ Reconnected to ${this.targetDeviceName}${colors.reset}`);
        this.updatePrompt();
        this.rl.prompt();
      }
    }
  }

  private fetchDevices(): void {
    const msg = {
      type: 'get_devices'
    };
    this.send(msg);
  }

  private send(data: any): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.error('✗ Not connected to server');
    }
  }

  sendMessage(text: string): void {
    if (!this.targetDevice) {
      console.log(`${colors.red}✗ No device selected. Use /device <number>${colors.reset}`);
      return;
    }

    // Find target device to get public key
    const targetDeviceObj = this.devices.find(d => d.deviceId === this.targetDevice);

    if (!targetDeviceObj) {
      console.log(`${colors.red}✗ Target device not found${colors.reset}`);
      return;
    }

    if (!targetDeviceObj.publicKey) {
      console.log(`${colors.red}✗ Target device has no public key - cannot encrypt${colors.reset}`);
      console.log(`${colors.red}✗ E2E encryption is REQUIRED. Target must support encryption.${colors.reset}`);
      return;
    }

    try {
      // Encrypt the message
      const encrypted = this.messageEncryption.encrypt(text, targetDeviceObj.publicKey);

      const msg = {
        type: 'message',
        to: this.targetDevice,
        encrypted: true,
        content: encrypted.ciphertext,
        nonce: encrypted.nonce,
        ephemeralPublicKey: encrypted.ephemeralPublicKey,
        timestamp: Date.now()
      };

      this.send(msg);
      console.log(`${colors.green}✓ Sent${colors.reset}`);
    } catch (error) {
      console.log(`${colors.red}✗ Encryption failed: ${error instanceof Error ? error.message : String(error)}${colors.reset}`);
    }
  }

  private handleCommand(input: string): boolean {
    if (!input.startsWith('/')) {
      return false;
    }

    const [cmd, ...args] = input.slice(1).split(' ');

    switch (cmd) {
      case 'help':
        this.showHelp();
        break;

      case 'devices':
        this.fetchDevices();
        break;

      case 'device':
      case 'target':
        if (args.length === 0) {
          console.log(`${colors.gray}Usage: /device <number>${colors.reset}`);
        } else {
          const idx = parseInt(args[0]) - 1;
          if (idx >= 0 && idx < this.devices.length) {
            this.targetDevice = this.devices[idx].deviceId;
            this.targetDeviceName = this.devices[idx].deviceName; // Remember name for restoration
            console.log(`${colors.green}✓ Sending to ${this.devices[idx].deviceName}${colors.reset}`);
          } else {
            console.log(`${colors.red}✗ Invalid device number${colors.reset}`);
          }
        }
        break;

      case 'status':
        const statusColor = this.connected ? colors.green : colors.red;
        console.log(`${colors.bright}Status:${colors.reset}`);
        console.log(`  Connected: ${statusColor}${this.connected}${colors.reset}`);
        console.log(`  Target: ${this.targetDevice || colors.gray + 'none' + colors.reset}`);
        console.log(`  Devices: ${this.devices.length}`);
        console.log(`  Encryption: ${colors.green}enabled${colors.reset}`);
        break;

      case 'quit':
      case 'exit':
        console.log(`${colors.cyan}Goodbye!${colors.reset}`);
        this.disconnect();
        process.exit(0);

      default:
        console.log(`${colors.red}Unknown command: /${cmd}${colors.reset}`);
        console.log(`${colors.gray}Type /help for available commands${colors.reset}`);
    }

    return true;
  }

  private showHelp(): void {
    console.log(`
Commands:
  /help              Show this help message
  /devices           Fetch and display available devices
  /device <number>   Select target device (e.g., /device 1)
  /status            Show connection status
  /quit or /exit     Exit the client

Usage:
  1. Connect to server (automatic on start)
  2. Use /device <number> to select a target device
  3. Your prompt will change to show the selected device
  4. Type any message and press Enter to send

Examples:
  /device 1          Select device #1 (prompt changes to "Work Laptop>")
  Work Laptop> Hello world    Send "Hello world" to Work Laptop

Security:
  🔒 All messages are encrypted end-to-end (required)
  Devices without encryption support cannot receive messages
`);
  }

  private updatePrompt(): void {
    if (this.targetDevice) {
      const device = this.devices.find(d => d.deviceId === this.targetDevice);
      const name = device?.deviceName || this.targetDevice;

      // Color based on connection status
      const promptColor = this.connected ? colors.magenta : colors.red;
      this.rl.setPrompt(`${promptColor}${name}${colors.reset}> `);
    } else {
      this.rl.setPrompt(`${colors.dim}>${colors.reset} `);
    }
  }

  startREPL(): void {
    this.updatePrompt();

    this.rl.on('line', (input: string) => {
      const trimmed = input.trim();

      if (trimmed.length === 0) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (this.handleCommand(trimmed)) {
        (this.rl as any).line = '';
        this.updatePrompt();
        this.rl.prompt();
        return;
      }

      // Send as message
      this.sendMessage(trimmed);

      // Delay prompt slightly to let any incoming messages print first
      setTimeout(() => {
        (this.rl as any).line = '';
        this.updatePrompt();
        this.rl.prompt();
      }, 100);
    });

    this.rl.on('close', () => {
      console.log('\nGoodbye!');
      this.disconnect();
      process.exit(0);
    });

    this.rl.prompt();
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

function showUsage(): void {
  console.log(`
${colors.bright}${colors.cyan}Utter${colors.reset} ${colors.dim}Test Client v${VERSION}${colors.reset}

${colors.bright}Usage:${colors.reset}
  linux-test-client [options]

${colors.bright}Options:${colors.reset}
  --help, -h              Show this help message
  --server <url>          WebSocket server URL (default: ws://localhost:8080)
                          Can also be set via UTTER_RELAY_SERVER environment variable
  --device-id <id>        Device ID (default: auto-generated from hostname)
  --device-name <name>    Device name (default: same as device ID)

${colors.bright}Environment Variables:${colors.reset}
  UTTER_RELAY_SERVER      WebSocket server URL
  GOOGLE_CLIENT_ID        Google OAuth client ID (optional)
  GOOGLE_CLIENT_SECRET    Google OAuth client secret (optional)

${colors.bright}Examples:${colors.reset}
  # Connect to default server
  linux-test-client

  # Connect to custom server
  linux-test-client --server wss://relay.example.com

  # Connect with custom device name
  linux-test-client --device-name "My Test Client"

${colors.bright}Interactive Commands:${colors.reset}
  /help              Show available commands
  /devices           List connected devices
  /device <number>   Select target device
  /status            Show connection status
  /quit, /exit       Exit the client
`);
}

// Main
async function main() {
  const args = process.argv.slice(2);

  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  // Parse arguments
  let serverUrl = process.env.UTTER_RELAY_SERVER || 'ws://localhost:8080';
  let deviceId: string | undefined;
  let deviceName: string | undefined;

  // Parse CLI flags (priority: CLI > env > default)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server' && args[i + 1]) {
      serverUrl = args[i + 1];
      i++; // skip next arg
    } else if (args[i] === '--device-id' && args[i + 1]) {
      deviceId = args[i + 1];
      i++;
    } else if (args[i] === '--device-name' && args[i + 1]) {
      deviceName = args[i + 1];
      i++;
    }
  }

  // Normalize server URL (add ws:// if missing)
  serverUrl = normalizeServerUrl(serverUrl);

  // Client format: hostname-client-shortid
  const hostname = os.hostname();
  const shortId = Math.random().toString(36).substring(2, 8);
  deviceId = deviceId || `${hostname}-client-${shortId}`;
  deviceName = deviceName || deviceId;

  console.log(`${colors.bright}${colors.cyan}Utter${colors.reset} ${colors.dim}Test Client${colors.reset}`);
  console.log(`${colors.gray}${stripWsPrefix(serverUrl)} • ${deviceName}${colors.reset}\n`);

  const client = new TestClient(serverUrl, deviceId, deviceName);

  // Initialize OAuth before connecting
  await client.initialize();

  client.startREPL();

  try {
    await client.connect();
  } catch (error) {
    // Will auto-reconnect
  }
}

main().catch(console.error);
