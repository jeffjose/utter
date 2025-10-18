# Utter Relay Server

WebSocket relay server for the Utter dictation system.

## Setup

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

Server will start on port 8080 (or PORT from .env).

## Production

```bash
pnpm build
pnpm start
```

## Configuration

Create a `.env` file:

```
PORT=8080
```

## Protocol

### Client → Server Messages

**Register:**
```json
{
  "type": "register",
  "clientType": "android" | "linux"
}
```

**Text:**
```json
{
  "type": "text",
  "content": "Hello world",
  "timestamp": 1697654321000
}
```

**Ping:**
```json
{
  "type": "ping"
}
```

### Server → Client Messages

**Connected:**
```json
{
  "type": "connected",
  "clientId": "abc123",
  "timestamp": 1697654321000,
  "message": "Connected to Utter Relay Server"
}
```

**Registered:**
```json
{
  "type": "registered",
  "clientId": "abc123",
  "clientType": "android",
  "timestamp": 1697654321000
}
```

**Text:**
```json
{
  "type": "text",
  "content": "Hello world",
  "timestamp": 1697654321000,
  "from": "xyz789"
}
```

**Pong:**
```json
{
  "type": "pong",
  "timestamp": 1697654321000
}
```

## Deployment

### Railway

1. Create a new project on Railway
2. Connect this repository
3. Set environment variable: `PORT=8080`
4. Deploy

### Render

1. Create a new Web Service
2. Connect this repository
3. Build command: `pnpm install && pnpm build`
4. Start command: `pnpm start`
5. Set environment variable: `PORT=8080`

### Fly.io

1. Install flyctl: `https://fly.io/docs/hands-on/install-flyctl/`
2. Run: `fly launch`
3. Deploy: `fly deploy`
