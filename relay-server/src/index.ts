import { WebSocketServer, WebSocket } from 'ws';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;

interface Client {
  ws: WebSocket;
  id: string;
  type: 'android' | 'linux' | 'unknown';
  pairedWith?: string;
}

const clients = new Map<string, Client>();

const wss = new WebSocketServer({ port: PORT });

console.log(`Utter Relay Server started on port ${PORT}`);
console.log('Phase 1: Direct echo mode - all messages broadcast to all clients');

wss.on('connection', (ws: WebSocket) => {
  const clientId = generateId();

  console.log(`[${clientId}] Client connected`);

  const client: Client = {
    ws,
    id: clientId,
    type: 'unknown'
  };

  clients.set(clientId, client);

  ws.on('message', (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[${clientId}] Received:`, message);

      // Handle different message types
      switch (message.type) {
        case 'register':
          handleRegister(client, message);
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
  console.log(`[${client.id}] Registered as ${client.type}`);

  client.ws.send(JSON.stringify({
    type: 'registered',
    clientId: client.id,
    clientType: client.type,
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
