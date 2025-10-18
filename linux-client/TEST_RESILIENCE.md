# Testing Connection Resilience

This document explains how to test that the Linux client properly handles connection issues.

## Test Scenarios

### 1. Server Not Running (Initial Connection)

**Test:**
```bash
# Don't start the relay server
cd linux-client
uv run utter_client.py
```

**Expected Behavior:**
- Status shows "Connection Refused"
- Error: "Server not running - start relay server first"
- Auto-retries with countdown: "Reconnecting in 5s...", "Reconnecting in 4s...", etc.
- Attempt counter increments

### 2. Server Goes Down After Connection

**Test:**
```bash
# Terminal 1: Start relay server
cd relay-server
pnpm dev

# Terminal 2: Start Linux client
cd linux-client
uv run utter_client.py

# Wait for "Registered - Ready" status
# Then kill the relay server (Ctrl+C in Terminal 1)
```

**Expected Behavior:**
- Client detects disconnect within 20-30 seconds (ping timeout)
- Status changes to "Disconnected"
- Error: "Connection lost unexpectedly"
- Automatically attempts reconnection with countdown
- When server restarts, client reconnects and gets new Client ID

### 3. Network Interruption

**Test:**
```bash
# With client connected:
# Temporarily block the port
sudo iptables -A OUTPUT -p tcp --dport 8080 -j DROP

# Wait 30 seconds, then restore
sudo iptables -D OUTPUT -p tcp --dport 8080 -j DROP
```

**Expected Behavior:**
- Connection timeout detected via ping/pong mechanism
- Client attempts reconnection
- After restoring network, client reconnects successfully

### 4. Server Restart

**Test:**
```bash
# With client connected:
# Restart relay server (Ctrl+C, then pnpm dev)
```

**Expected Behavior:**
- Client detects disconnect immediately
- Shows reconnection countdown
- Reconnects within 5 seconds of server restart
- Gets new Client ID from server

### 5. Invalid Server URL

**Test:**
```bash
uv run utter_client.py --server ws://invalid-hostname:8080
```

**Expected Behavior:**
- Status: "Connection Error"
- Error: "Cannot resolve hostname"
- Continues retrying with countdown

## Resilience Features

### Automatic Reconnection
- Always retries on disconnect
- 5-second countdown between attempts
- Visual feedback with attempt counter

### Ping/Pong Keepalive
- Client sends ping every 20 seconds
- Expects pong within 10 seconds
- Detects dead connections automatically

### Connection Timeouts
- Close timeout: 5 seconds
- Prevents hanging on unresponsive connections

### State Management
- Clears `ws` and `client_id` on disconnect
- Gets fresh ID on reconnect
- Maintains message counter across reconnects

### Error Categories
- **Connection Refused**: Server not running
- **Disconnected**: Connection lost or closed
- **Timeout**: Server not responding
- **Connection Error**: Network or DNS issues

## Monitoring

The live display shows:
- Current connection status (color-coded)
- Connection attempt number
- Last error message
- Time until next retry

All these update in real-time without scrolling logs!
