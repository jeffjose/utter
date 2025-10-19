import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';
import * as os from 'os';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

interface Client {
  ws: WebSocket;
  id: string;
  type: 'android' | 'linux' | 'unknown';
  deviceId?: string;
  deviceName?: string;
  userId?: string;
  publicKey?: string;
  status: 'online' | 'offline';
  connectedAt: Date;
}

const clients = new Map<string, Client>();

interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: 'android' | 'linux';
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

console.log('='.repeat(60));
console.log('Utter Relay Server started');
console.log('='.repeat(60));
console.log(`Listening on all interfaces: *:${PORT}`);
console.log('');
console.log('Available endpoints:');
console.log(`  - ws://localhost:${PORT} (local only)`);

const networkAddresses = getNetworkAddresses();
if (networkAddresses.length > 0) {
  networkAddresses.forEach(addr => {
    console.log(`  - ws://${addr}:${PORT} (network)`);
  });
} else {
  console.log('  - No network interfaces found');
}

console.log('');
console.log('Android Emulator: Use ws://10.0.2.2:' + PORT);
console.log('Physical Device: Use one of the network addresses above');
console.log('='.repeat(60));
console.log('Features:');
console.log('  - Device registry and management');
console.log('  - Targeted message routing');
console.log('  - User-based device isolation (OAuth ready)');
console.log('');

wss.on('connection', (ws: WebSocket) => {
  const clientId = generateId();

  console.log(`[${clientId}] Client connected`);

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
          console.log(`[${clientId}] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[${clientId}] Error processing message:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`[${clientId}] Client disconnected`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`[${clientId}] WebSocket error:`, error);
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: Date.now(),
    message: 'Connected to Utter Relay Server'
  }));
});

function handleRegister(client: Client, message: any) {
  client.type = message.clientType || 'unknown';
  client.deviceId = message.deviceId || client.id;
  client.deviceName = message.deviceName || `${client.type}-${client.id}`;
  client.userId = message.userId || 'test-user'; // TODO: Get from OAuth token
  client.publicKey = message.publicKey;

  console.log(`[${client.id}] Registered as ${client.type} (device: ${client.deviceId}, name: ${client.deviceName})`);

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

  // Get all devices for this user
  clients.forEach((c) => {
    if (c.userId === client.userId && c.deviceId) {
      devices.push({
        deviceId: c.deviceId,
        deviceName: c.deviceName || c.deviceId,
        deviceType: c.type as 'android' | 'linux',
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
  console.log(`[${sender.id}] → [${targetClient.id}]`);
  targetClient.ws.send(JSON.stringify({
    type: 'text',
    content: content,
    from: sender.deviceId || sender.id,
    timestamp: message.timestamp || Date.now()
  }));

  // Send acknowledgment to sender
  sender.ws.send(JSON.stringify({
    type: 'message_sent',
    to: targetDeviceId,
    timestamp: Date.now()
  }));
}

function handleText(sender: Client, message: any) {
  console.log(`[${sender.id}] Broadcasting text: "${message.content}"`);

  // Phase 1: Simple broadcast to all OTHER clients
  clients.forEach((client) => {
    if (client.id !== sender.id && client.ws.readyState === WebSocket.OPEN) {
      console.log(`[${sender.id}] → [${client.id}] Forwarding text`);
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
  console.log('\nShutting down relay server...');
  console.log(`Closing ${clients.size} active connections...`);

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
    console.log('Relay server closed');
    process.exit(0);
  });

  // Force exit after 2 seconds if graceful shutdown hangs
  setTimeout(() => {
    console.log('Force closing...');
    process.exit(0);
  }, 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
