# Utter - Android-to-Linux Dictation System

## Overview

Utter enables using an Android phone as a microphone for dictation on Linux. Speak into your Android device, and the transcribed text appears in your Linux text editor as if typed on the keyboard.

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Android   │ WebSocket│    Relay     │WebSocket│    Linux     │
│     App     │◄────────►│    Server    │◄────────►│   Client     │
│             │          │              │          │              │
│ Voice Input │          │  User-based  │          │  Keyboard    │
│ Google STT  │          │   Routing    │          │  Simulation  │
└─────────────┘          └──────────────┘          └──────────────┘
```

### Components

1. **Android App** (Kotlin)
   - Simple UI with EditText accepting voice input
   - Uses Android's built-in speech-to-text (Google Keyboard)
   - WebSocket client to send text to relay server

2. **Relay Server** (Node.js/TypeScript)
   - WebSocket server to relay messages
   - Routes text from Android → Linux client
   - Manages client connections with device pairing
   - Deployed to cloud (Railway, Render, or Fly.io)

3. **Linux Client** (Python)
   - WebSocket client to receive text
   - Simulates keyboard input using `xdotool` or `ydotool`
   - Runs as background service

## Implementation Phases

### Phase 1: Same-Network Direct Connection (MVP v0.1)
**Goal:** Validate core functionality without complexity

**Features:**
- Linux client listens on local WebSocket (port 8080)
- Android app connects directly to Linux IP (same WiFi)
- Test voice input → text transmission → keyboard simulation
- No authentication or encryption needed (same trusted network)

**Success Criteria:**
- Speak into Android phone
- See text appear in Linux text editor
- Latency < 500ms

---

### Phase 2: Add Relay Server (MVP v0.5)
**Goal:** Enable internet connectivity

**Features:**
- Create minimal WebSocket relay server (~50-100 lines)
- Simple device pairing (shared 6-digit PIN code)
- Deploy to free cloud hosting
- Both clients connect through relay
- No encryption yet (plaintext relay)

**Pairing Flow:**
1. Generate PIN on Linux client
2. Enter PIN in Android app
3. Server associates both connections with same session ID
4. Messages relayed between paired devices

**Success Criteria:**
- Android and Linux can be on different networks
- Pairing works reliably
- Messages route correctly

---

### Phase 3: UX Polish (MVP v1.0)
**Goal:** Make it usable daily

**Features:**
- Auto-reconnection on network drops
- Send-on-timeout (auto-send after 2 seconds of silence)
- Better error handling and status indicators
- Android: Persistent notification showing connection status
- Linux: System tray icon with status
- Message queue for offline scenarios

**Success Criteria:**
- Can use reliably throughout the day
- Gracefully handles network interruptions
- Clear feedback on connection status

---

### Phase 4: Security Hardening (Production-ready)
**Goal:** Make it secure for public relay server

#### 4.1 Authentication
- **Device Registration:** Each device gets unique ID + public/private key pair
- **Pairing Flow:**
  - Generate one-time pairing code on Linux client
  - Enter code in Android app to establish trust
  - Exchange public keys through relay
  - Store paired device IDs locally
- **Session Auth:** Use cryptographic signatures to verify identity
  - No passwords stored on server
  - Relay server only validates signatures against public keys

#### 4.2 Encryption
- **End-to-End Encryption:**
  - Text encrypted on Android before sending
  - Only Linux client can decrypt (relay server is blind)
  - Use libsodium/NaCl (sealed boxes or box encryption)
  - Similar to happy-server's zero-knowledge model

- **Transport Security:**
  - WSS (WebSocket Secure) instead of WS
  - HTTPS for any REST endpoints
  - Valid SSL certificates (Let's Encrypt)

#### 4.3 Privacy Features
- **No Server Storage:** Text relayed in real-time, never persisted
- **Ephemeral Sessions:** Messages deleted after delivery
- **Forward Secrecy:** Consider rotating session keys
- **Rate Limiting:** Prevent abuse on relay server

**Security Philosophy:**
> The relay server should only know: "Device A wants to send to Device B"
> It should NEVER know: "What text is being sent"

---

## Tech Stack

### Android App
- **Language:** Kotlin
- **Libraries:**
  - OkHttp or Scarlet for WebSocket
  - Material Design components
  - Android Speech-to-Text API

### Relay Server
- **Language:** Node.js + TypeScript
- **Libraries:**
  - `socket.io` or `ws` for WebSocket
  - `express` for REST endpoints (pairing)
  - `dotenv` for configuration
- **Deployment:** Railway, Render, or Fly.io (free tier)

### Linux Client
- **Language:** Python 3.9+
- **Libraries:**
  - `websockets` for WebSocket client
  - `subprocess` to call `xdotool` or `ydotool`
  - `asyncio` for async event loop
- **Deployment:** systemd service

---

## Project Structure

```
utter/
├── docs/
│   └── PLAN.md                 # This file
├── android-app/                # Kotlin Android app
│   ├── app/
│   ├── build.gradle
│   └── README.md
├── relay-server/               # Node.js/TypeScript server
│   ├── src/
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
├── linux-client/               # Python client
│   ├── utter_client/
│   ├── requirements.txt
│   ├── setup.py
│   └── README.md
└── README.md                   # Main project README
```

---

## Data Flow

### Phase 1 (Direct Connection)
```
Android App → [Send] → Linux Client → xdotool → Text appears
     ↓                      ↓
 Voice input          Simulate typing
```

### Phase 2+ (With Relay)
```
Android App → [Send] → Relay Server → Linux Client → xdotool → Text appears
     ↓                      ↓                ↓
 Voice input          Route by ID      Simulate typing
```

### Message Format (JSON over WebSocket)

```json
{
  "type": "text",
  "content": "Hello world",
  "timestamp": 1697654321000
}
```

---

## Alternative: Self-hosted Relay

Instead of Phase 4 security, you could:
- Deploy relay server on your own VPS
- Use firewall rules to lock it down
- Run over VPN (Tailscale/WireGuard)
- Much simpler, but less convenient for public use

---

## Inspiration

This project is inspired by [happy-server](https://github.com/slopus/happy-server), which demonstrates:
- WebSocket-based relay architecture
- End-to-end encryption with zero-knowledge server
- Real-time synchronization between clients

We adopt a similar relay pattern but simplify for our specific use case.

---

## Future Enhancements (Post-MVP)

- [ ] Support for multiple Linux clients (e.g., work desktop + laptop)
- [ ] Clipboard sync in addition to keyboard simulation
- [ ] Voice commands (e.g., "new line", "backspace")
- [ ] iOS app
- [ ] Text formatting hints (markdown, code blocks)
- [ ] Offline queue with retry logic
- [ ] Usage analytics (local only, privacy-preserving)

---

## Development Workflow

1. **Phase 1:** Build and test on same network
2. **Phase 2:** Deploy relay server, test over internet
3. **Phase 3:** Add polish and reliability features
4. **Phase 4:** Add security when ready for public use

Start simple, iterate fast, add complexity only when needed.
