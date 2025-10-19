#!/usr/bin/env tsx

import WebSocket from 'ws';
import * as readline from 'readline';
import * as os from 'os';

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
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
  private maxReconnectDelay: number = 30000; // 30 seconds max

  constructor(serverUrl: string, deviceId: string = 'test-client-1', deviceName: string = 'Test Client') {
    this.serverUrl = serverUrl;
    this.deviceId = deviceId;
    this.deviceName = deviceName;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
      terminal: true
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log(`${colors.green}✓ Connected${colors.reset}`);
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
        console.log(`${colors.red}✗ Disconnected${colors.reset}`);
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
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

    console.log(`${colors.gray}Reconnecting in ${delay / 1000}s...${colors.reset}`);

    setTimeout(() => {
      this.connect().catch(() => {
        // Will retry via scheduleReconnect in close handler
      });
    }, delay);
  }

  private register(): void {
    const registerMsg = {
      type: 'register',
      clientType: 'controller',
      deviceId: this.deviceId,
      deviceName: this.deviceName
    };

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
          console.log(`${colors.green}✓ Registered${colors.reset}`);
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
    this.devices = devices.filter(d => d.deviceType === 'linux');

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
        console.log(`  ${colors.cyan}${idx + 1}.${colors.reset} ${device.deviceName} ${statusIcon}${isTarget}`);
      });
      console.log(`${colors.gray}Type /device <number> to select${colors.reset}\n`);
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

    const msg = {
      type: 'message',
      to: this.targetDevice,
      content: text,
      timestamp: Date.now()
    };

    this.send(msg);
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
  2. Use /device <number> to select a Linux device
  3. Your prompt will change to show the selected device
  4. Type any message and press Enter to send

Examples:
  /device 1          Select device #1 (prompt changes to "Work Laptop>")
  Work Laptop> Hello world    Send "Hello world" to Work Laptop
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
    console.log(`${colors.gray}Type /help for commands${colors.reset}\n`);

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

// Main
async function main() {
  const args = process.argv.slice(2);
  const serverUrl = args[0] || 'ws://localhost:8080';

  // Client format: hostname-client-shortid
  const hostname = os.hostname();
  const shortId = Math.random().toString(36).substring(2, 8);
  const deviceId = args[1] || `${hostname}-client-${shortId}`;
  const deviceName = args[2] || deviceId;

  console.log(`${colors.bright}${colors.cyan}Utter${colors.reset} ${colors.dim}Test Client${colors.reset}`);
  console.log(`${colors.gray}${serverUrl} • ${deviceName}${colors.reset}\n`);

  const client = new TestClient(serverUrl, deviceId, deviceName);

  client.startREPL();

  try {
    await client.connect();
  } catch (error) {
    // Will auto-reconnect
  }
}

main().catch(console.error);
