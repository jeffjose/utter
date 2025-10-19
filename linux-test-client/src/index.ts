#!/usr/bin/env tsx

import WebSocket from 'ws';
import * as readline from 'readline';

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  status: string;
}

class TestClient {
  private ws: WebSocket | null = null;
  private connected: boolean = false;
  private serverUrl: string;
  private deviceId: string;
  private deviceName: string;
  private devices: Device[] = [];
  private targetDevice: string | null = null;
  private rl: readline.Interface;

  constructor(serverUrl: string, deviceId: string = 'test-client-1', deviceName: string = 'Test Client') {
    this.serverUrl = serverUrl;
    this.deviceId = deviceId;
    this.deviceName = deviceName;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`Connecting to ${this.serverUrl}...`);

      this.ws = new WebSocket(this.serverUrl);

      this.ws.on('open', () => {
        console.log('✓ Connected to relay server');
        this.connected = true;
        this.register();
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('close', () => {
        console.log('✗ Disconnected from server');
        this.connected = false;
      });

      this.ws.on('error', (error: Error) => {
        console.error('✗ WebSocket error:', error.message);
        reject(error);
      });
    });
  }

  private register(): void {
    const registerMsg = {
      type: 'register',
      clientType: 'android', // Pretend to be Android for testing
      deviceId: this.deviceId,
      deviceName: this.deviceName
    };

    console.log('Registering as Android device...');
    this.send(registerMsg);
  }

  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'connected':
          console.log('✓ Server acknowledged connection');
          break;

        case 'registered':
          console.log('✓ Registered successfully');
          this.fetchDevices();
          break;

        case 'devices':
          this.handleDeviceList(msg.devices);
          break;

        case 'message':
          console.log(`\n← Message from ${msg.from}: ${msg.content}`);
          this.rl.prompt();
          break;

        default:
          console.log('Received:', msg);
      }
    } catch (e) {
      console.error('Failed to parse message:', data);
    }
  }

  private handleDeviceList(devices: Device[]): void {
    this.devices = devices.filter(d => d.deviceType === 'linux');

    console.log('\n Available Linux devices:');
    this.devices.forEach((device, idx) => {
      const statusIcon = device.status === 'online' ? '●' : '○';
      console.log(`  ${idx + 1}. ${device.deviceName} ${statusIcon} (${device.deviceId})`);
    });

    if (this.devices.length > 0) {
      console.log('\nUse /target <number> to select a device');
      console.log('Example: /target 1\n');
    } else {
      console.log('\n⚠ No Linux devices found');
      console.log('Mock devices will be used for testing\n');

      // Add mock devices for testing
      this.devices = [
        { deviceId: 'linux-1', deviceName: 'Work Laptop', deviceType: 'linux', status: 'online' },
        { deviceId: 'linux-2', deviceName: 'Home Desktop', deviceType: 'linux', status: 'online' }
      ];

      console.log('Mock devices:');
      this.devices.forEach((device, idx) => {
        console.log(`  ${idx + 1}. ${device.deviceName} (${device.deviceId})`);
      });
      console.log();
    }

    this.rl.prompt();
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
      console.log('✗ No target device selected. Use /target <number> first');
      return;
    }

    const msg = {
      type: 'message',
      to: this.targetDevice,
      content: text,
      timestamp: Date.now()
    };

    this.send(msg);
    console.log(`→ Sent to ${this.targetDevice}: ${text}`);
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

      case 'target':
        if (args.length === 0) {
          console.log('Usage: /target <number>');
        } else {
          const idx = parseInt(args[0]) - 1;
          if (idx >= 0 && idx < this.devices.length) {
            this.targetDevice = this.devices[idx].deviceId;
            console.log(`✓ Target set to: ${this.devices[idx].deviceName} (${this.targetDevice})`);
          } else {
            console.log(`✗ Invalid device number. Use /devices to see available devices`);
          }
        }
        break;

      case 'status':
        console.log(`Connected: ${this.connected}`);
        console.log(`Target: ${this.targetDevice || 'none'}`);
        console.log(`Devices: ${this.devices.length}`);
        break;

      case 'quit':
      case 'exit':
        console.log('Goodbye!');
        this.disconnect();
        process.exit(0);

      default:
        console.log(`Unknown command: /${cmd}`);
        console.log('Type /help for available commands');
    }

    return true;
  }

  private showHelp(): void {
    console.log(`
Commands:
  /help              Show this help message
  /devices           Fetch and display available devices
  /target <number>   Select target device (e.g., /target 1)
  /status            Show connection status
  /quit or /exit     Exit the client

Usage:
  1. Connect to server (automatic on start)
  2. Use /target <number> to select a Linux device
  3. Type any message and press Enter to send to the target device

Examples:
  /target 1          Select device #1
  Hello world        Send "Hello world" to selected device
`);
  }

  startREPL(): void {
    console.log('\nUtter Test Client - REPL Mode');
    console.log('Type /help for commands\n');

    this.rl.on('line', (input: string) => {
      const trimmed = input.trim();

      if (trimmed.length === 0) {
        this.rl.prompt();
        return;
      }

      // Handle commands
      if (this.handleCommand(trimmed)) {
        this.rl.prompt();
        return;
      }

      // Send as message
      this.sendMessage(trimmed);
      this.rl.prompt();
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
  const deviceId = args[1] || `test-client-${Math.random().toString(36).substring(7)}`;
  const deviceName = args[2] || 'Test Client';

  console.log('Utter Linux Test Client');
  console.log('=======================');
  console.log(`Server: ${serverUrl}`);
  console.log(`Device ID: ${deviceId}`);
  console.log(`Device Name: ${deviceName}\n`);

  const client = new TestClient(serverUrl, deviceId, deviceName);

  try {
    await client.connect();
    client.startREPL();
  } catch (error) {
    console.error('Failed to connect:', error);
    process.exit(1);
  }
}

main().catch(console.error);
