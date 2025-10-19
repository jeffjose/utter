# Utter Linux Test Client

A TypeScript-based REPL client that simulates the Android app for testing the Utter relay server. This client allows you to send text messages to Linux devices without needing to use the Android app or a microphone.

## Features

- ✅ REPL interface for interactive testing
- ✅ WebSocket connection to relay server
- ✅ Device discovery and selection
- ✅ Send messages to specific Linux devices
- ✅ Command-based interface
- ✅ Mock devices for offline testing

## Prerequisites

- Node.js 18+
- pnpm

## Installation

```bash
pnpm install
```

## Usage

### Basic Usage

Connect to local relay server:

```bash
pnpm start
```

### Custom Server URL

```bash
pnpm start ws://192.168.1.100:8080
```

### With Custom Device ID and Name

```bash
pnpm start ws://localhost:8080 my-test-device "My Test Device"
```

## Commands

Once connected, you can use the following commands:

- `/help` - Show help message
- `/devices` - Fetch and display available Linux devices
- `/target <number>` - Select target device (e.g., `/target 1`)
- `/status` - Show connection status
- `/quit` or `/exit` - Exit the client

## Example Session

```
$ pnpm start

Utter Linux Test Client
=======================
Server: ws://localhost:8080
Device ID: test-client-abc123
Device Name: Test Client

Connecting to ws://localhost:8080...
✓ Connected to relay server
Registering as Android device...
✓ Server acknowledged connection
✓ Registered successfully

Available Linux devices:
  1. Work Laptop ● (linux-work-laptop)
  2. Home Desktop ○ (linux-home-desktop)

Use /target <number> to select a device
Example: /target 1

> /target 1
✓ Target set to: Work Laptop (linux-work-laptop)
> Hello world
→ Sent to linux-work-laptop: Hello world
> This is a test
→ Sent to linux-work-laptop: This is a test
> /quit
Goodbye!
```

## Testing Without Relay Server

The client includes mock devices that are used when the server doesn't return any devices. This allows you to test the client interface even without a running relay server or Linux devices.

## Message Format

Messages are sent in JSON format:

```json
{
  "type": "message",
  "to": "linux-device-id",
  "content": "Your message text",
  "timestamp": 1234567890
}
```

## Development

Run in watch mode (auto-reload on file changes):

```bash
pnpm dev
```

Build TypeScript to JavaScript:

```bash
pnpm build
```

## Architecture

This test client simulates the Android app by:

1. Connecting to the relay server via WebSocket
2. Registering as an "android" device type
3. Fetching the list of available Linux devices
4. Sending messages to selected Linux devices

The relay server routes messages based on device IDs, ensuring messages reach the correct Linux client.

## Use Cases

- Testing relay server message routing
- Testing Linux client without Android device
- Debugging message flow
- Load testing with multiple concurrent clients
- CI/CD integration testing

## Related Components

- **Android App**: `/android-app` - Mobile app with voice input
- **Linux Client**: `/linux-client` - Python client that receives and types messages
- **Relay Server**: `/relay-server` - Node.js WebSocket relay server

## License

ISC
