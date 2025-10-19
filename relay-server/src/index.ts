import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';
import * as os from 'os';
import * as path from 'path';
import { verifyGoogleToken } from './auth';

// Load environment from root .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

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
  gray: '\x1b[90m',
};

interface Client {
  ws: WebSocket;
  id: string;
  type: 'android' | 'target' | 'controller' | 'unknown';
  deviceId?: string;
  deviceName?: string;
  userId?: string;
  publicKey?: string;
  status: 'online' | 'offline';
  connectedAt: Date;
  version?: string;
  platform?: string;
  arch?: string;
}

const clients = new Map<string, Client>();

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: 'android' | 'target';
  userId: string;
  publicKey?: string;
  status: 'online' | 'offline';
  lastConnected: Date;
}

// Listen on all network interfaces (don't specify host parameter)
const wss = new WebSocketServer({ port: PORT });

// Helper function to get network addresses
function getNetworkAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;

    for (const addr of iface) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (addr.family === 'IPv4' && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

console.log('');
console.log(`${colors.bright}${colors.cyan}Utter${colors.reset} ${colors.dim}Relay Server${colors.reset}`);
console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`);
console.log(`${colors.green}●${colors.reset} Listening on ${colors.bright}*:${PORT}${colors.reset}`);
console.log('');
console.log(`${colors.dim}Available endpoints:${colors.reset}`);
console.log(`  ${colors.cyan}ws://localhost:${PORT}${colors.reset} ${colors.dim}(local)${colors.reset}`);

const networkAddresses = getNetworkAddresses();
if (networkAddresses.length > 0) {
  networkAddresses.forEach(addr => {
    console.log(`  ${colors.cyan}ws://${addr}:${PORT}${colors.reset} ${colors.dim}(network)${colors.reset}`);
  });
}

console.log('');
console.log(`${colors.dim}Mobile:${colors.reset}`);
console.log(`  Emulator: ${colors.yellow}ws://10.0.2.2:${PORT}${colors.reset}`);
console.log(`  Physical: ${colors.gray}Use network address above${colors.reset}`);
console.log(`${colors.gray}${'─'.repeat(60)}${colors.reset}`);
console.log('');

wss.on('connection', (ws: WebSocket) => {
  const clientId = generateId();

  const client: Client = {
    ws,
    id: clientId,
    type: 'unknown',
    status: 'online',
    connectedAt: new Date()
  };

  clients.set(clientId, client);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());

      // Handle different message types
      switch (message.type) {
        case 'register':
          handleRegister(client, message);
          break;

        case 'get_devices':
          handleGetDevices(client);
          break;

        case 'message':
          handleMessage(client, message);
          break;

        case 'text':
          handleText(client, message);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;

        default:
          console.log(`${colors.dim}[${clientId}]${colors.reset} ${colors.yellow}?${colors.reset} Unknown type: ${colors.dim}${message.type}${colors.reset}`);
      }
    } catch (error) {
      console.error(`${colors.dim}[${clientId}]${colors.reset} ${colors.red}✗${colors.reset} Error:`, error);
    }
  });

  ws.on('close', () => {
    const name = client.deviceName || client.deviceId || clientId;
    console.log(`${colors.dim}[${clientId}]${colors.reset} ${colors.red}●${colors.reset} ${colors.red}DOWN${colors.reset} ${colors.dim}${name}${colors.reset}`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`${colors.dim}[${clientId}]${colors.reset} ${colors.red}✗${colors.reset} Error:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now(),
    message: 'Connected to Utter Relay Server'
  }));
});

async function handleRegister(client: Client, message: any) {
  // Validate public key if provided
  if (message.publicKey) {
    try {
      const keyBytes = Buffer.from(message.publicKey, 'base64');
      if (keyBytes.length !== 32) {
        throw new Error('Invalid Ed25519 public key length');
      }
      // Store the validated key
      client.publicKey = message.publicKey;
    } catch (err) {
      console.error(`${colors.dim}[${client.id}]${colors.reset} ${colors.red}✗${colors.reset} Invalid public key:`, err);
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid public key format. Must be base64-encoded Ed25519 key (32 bytes)',
        timestamp: Date.now()
      }));
      return;
    }
  }

  client.type = message.clientType || 'unknown';
  client.deviceId = message.deviceId || client.id;
  client.deviceName = message.deviceName || `${client.type}-${client.id}`;
  client.version = message.version;
  client.platform = message.platform;
  client.arch = message.arch;

  // OAuth authentication (required)
  if (!message.token) {
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'OAuth token required. Please sign in with Google.',
      timestamp: Date.now()
    }));
    return;
  }

  try {
    const userInfo = await verifyGoogleToken(message.token);
    client.userId = userInfo.email;

    console.log(`${colors.dim}[${client.id}]${colors.reset} ${colors.green}✓${colors.reset} OAuth verified: ${userInfo.email}`);
  } catch (err: any) {
    console.error(`${colors.dim}[${client.id}]${colors.reset} ${colors.red}✗${colors.reset} OAuth failed:`, err.message);
    client.ws.send(JSON.stringify({
      type: 'error',
      message: 'OAuth verification failed. Please sign in again.',
      timestamp: Date.now()
    }));
    return;
  }

  const typeColor = client.type === 'target' ? colors.blue : client.type === 'android' ? colors.magenta : client.type === 'controller' ? colors.cyan : colors.gray;

  // Build metadata string
  const metadata = [];
  if (client.version) metadata.push(client.version);
  if (client.platform) metadata.push(client.platform);
  if (client.arch) metadata.push(client.arch);
  const metaStr = metadata.length > 0 ? ` ${colors.dim}• ${metadata.join(' • ')}${colors.reset}` : '';

  console.log(`${colors.dim}[${client.id}]${colors.reset} ${colors.green}●${colors.reset} ${colors.green}UP${colors.reset} ${colors.bright}${client.deviceName}${colors.reset} ${colors.dim}(${typeColor}${client.type}${colors.reset}${colors.dim})${colors.reset} ${colors.dim}user=${client.userId}${colors.reset}${metaStr}`);

  client.ws.send(JSON.stringify({
    type: 'registered',
    clientId: client.id,
    deviceId: client.deviceId,
    clientType: client.type,
    timestamp: Date.now()
  }));
}

function handleGetDevices(client: Client) {
  const devices: Device[] = [];

  // Get devices for this user
  // Controllers only see targets (devices they can send commands to)
  clients.forEach((c) => {
    if (c.userId === client.userId && c.deviceId) {
      // Controllers only see targets
      if (client.type === 'controller' && c.type !== 'target') {
        return;
      }

      devices.push({
        deviceId: c.deviceId,
        deviceName: c.deviceName || c.deviceId,
        deviceType: c.type as 'controller' | 'target',
        userId: c.userId || 'test-user',
        publicKey: c.publicKey,
        status: c.status,
        lastConnected: c.connectedAt
      });
    }
  });

  client.ws.send(JSON.stringify({
    type: 'devices',
    devices,
    timestamp: Date.now()
  }));
}

function handleMessage(sender: Client, message: any) {
  const targetDeviceId = message.to;
  const content = message.content;

  if (!targetDeviceId) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: 'No target device specified',
      timestamp: Date.now()
    }));
    return;
  }

  // ENFORCE ENCRYPTION: Reject plaintext messages
  if (!message.encrypted) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: 'REJECTED: Plaintext messages not allowed. E2E encryption is REQUIRED.',
      timestamp: Date.now()
    }));
    console.log(`${colors.dim}[${sender.id}]${colors.reset} ${colors.red}✗${colors.reset} Rejected plaintext message`);
    return;
  }

  // Find target client by device ID
  let targetClient: Client | undefined;
  clients.forEach((client) => {
    if (client.deviceId === targetDeviceId && client.userId === sender.userId) {
      targetClient = client;
    }
  });

  if (!targetClient) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: `Target device not found or offline: ${targetDeviceId}`,
      timestamp: Date.now()
    }));
    return;
  }

  if (targetClient.ws.readyState !== WebSocket.OPEN) {
    sender.ws.send(JSON.stringify({
      type: 'error',
      message: `Target device not connected: ${targetDeviceId}`,
      timestamp: Date.now()
    }));
    return;
  }

  // Forward message to target
  console.log(`${colors.dim}[${sender.id}]${colors.reset} ${colors.cyan}→${colors.reset} ${colors.dim}[${targetClient.id}]${colors.reset}`);
  const forwardedMessage: any = {
    type: 'text',
    content: content,
    from: sender.deviceId || sender.id,
    timestamp: message.timestamp || Date.now()
  };

  // Forward E2E encryption fields if present
  if (message.encrypted) {
    forwardedMessage.encrypted = true;
    forwardedMessage.nonce = message.nonce;
    forwardedMessage.ephemeralPublicKey = message.ephemeralPublicKey;
  }

  targetClient.ws.send(JSON.stringify(forwardedMessage));

  // Send acknowledgment to sender
  sender.ws.send(JSON.stringify({
    type: 'message_sent',
    to: targetDeviceId,
    timestamp: Date.now()
  }));
}

function handleText(sender: Client, message: any) {
  console.log(`${colors.dim}[${sender.id}]${colors.reset} ${colors.magenta}Broadcasting${colors.reset} ${colors.dim}"${message.content}"${colors.reset}`);

  // Phase 1: Simple broadcast to all OTHER clients
  clients.forEach((client) => {
    if (client.id !== sender.id && client.ws.readyState === WebSocket.OPEN) {
      console.log(`${colors.dim}[${sender.id}]${colors.reset} ${colors.cyan}→${colors.reset} ${colors.dim}[${client.id}]${colors.reset}`);
      client.ws.send(JSON.stringify({
        type: 'text',
        content: message.content,
        timestamp: message.timestamp || Date.now(),
        from: sender.id
      }));
    }
  });
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

// Graceful shutdown
function shutdown() {
  console.log(`\n${colors.yellow}Shutting down...${colors.reset}`);
  console.log(`${colors.dim}Closing ${clients.size} active connection(s)${colors.reset}`);

  // Close all client connections
  clients.forEach((client) => {
    try {
      client.ws.close(1001, 'Server shutting down');
    } catch (e) {
      // Ignore errors during close
    }
  });

  clients.clear();

  // Close the WebSocket server
  wss.close(() => {
    console.log(`${colors.green}✓${colors.reset} Server stopped\n`);
    process.exit(0);
  });

  // Force exit after 2 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.log(`${colors.red}Force closing...${colors.reset}`);
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
