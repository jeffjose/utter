# Utter - Android-to-Linux Dictation System

Speak into your Android phone and have the text appear on your Linux computer as if typed on the keyboard.

## Overview

Utter enables voice dictation from an Android device to a Linux computer. The system consists of three components:

1. **Android App** (Kotlin) - Captures voice input via Google speech-to-text
2. **Relay Server** (Node.js/TypeScript) - Routes messages between devices
3. **Linux Client** (Python) - Simulates keyboard input on Linux

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Android   │◄───────►│    Relay     │◄───────►│    Linux     │
│     App     │WebSocket│    Server    │WebSocket│   Client     │
│             │         │              │         │              │
│ Voice Input │         │  Text Relay  │         │  Keyboard    │
│ Google STT  │         │              │         │  Simulation  │
└─────────────┘         └──────────────┘         └──────────────┘
```

## Quick Start

### 1. Start the Relay Server

```bash
cd relay-server
pnpm install
pnpm dev
```

Server will start on `ws://localhost:8080`.

### 2. Start the Linux Client

```bash
cd utterd
uv run utterd
```

### 3. Set Up Android App

See [android-app/README.md](android-app/README.md) for detailed setup instructions.

1. Open Android Studio
2. Create new project from the provided files
3. Build and install on your device
4. Enter relay server URL
5. Connect and start dictating

## Project Structure

```
utter/
├── docs/
│   └── PLAN.md                 # Detailed implementation plan
├── android-app/                # Kotlin Android app
│   ├── MainActivity.kt
│   ├── WebSocketClient.kt
│   ├── activity_main.xml
│   └── README.md
├── relay-server/               # Node.js/TypeScript server
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── README.md
├── utterd/                     # Python client (uses inline deps)
│   ├── utterd
│   └── README.md
└── README.md                   # This file
```

## Requirements

### Relay Server

- Node.js 18+
- [pnpm](https://pnpm.io/) - Fast, disk space efficient package manager

Install pnpm:

```bash
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

### Linux Client

- Python 3.9+
- [uv](https://docs.astral.sh/uv/) - Fast Python package manager
- `xdotool` (X11) or `ydotool` (Wayland)

Install on Ubuntu/Debian:

```bash
# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install keyboard tools
sudo apt install xdotool    # For X11
# OR
sudo apt install ydotool    # For Wayland
```

### Android App

- Android Studio
- Android device with API 24+ (Android 7.0+)
- Google Keyboard or Gboard

## Usage

### Phase 1: Same Network (MVP)

1. **Start relay server** on your Linux computer
2. **Start Linux client** on the same computer
3. **Find your computer's IP address**:
   ```bash
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```
4. **Connect Android app** using `ws://YOUR_IP:8080`
5. **Open a text editor** on Linux and focus it
6. **Speak into Android** using voice input
7. **Watch text appear** in your Linux editor

### Phase 2+: Internet Relay (Future)

Deploy relay server to cloud (Railway, Render, Fly.io) and connect from anywhere.

See [docs/PLAN.md](docs/PLAN.md) for full roadmap.

## Testing

### Test Relay Server

```bash
cd relay-server
pnpm dev
```

You should see:

```
Utter Relay Server started on port 8080
Phase 1: Direct echo mode - all messages broadcast to all clients
```

### Test Linux Client

```bash
cd utterd
uv run utterd
```

You should see an interactive status panel:

```
╭─────────────── 🎤 utterd ────────────────╮
│                                                      │
│   Status:     Registered - Ready                    │
│   Server:     ws://localhost:8080                   │
│   Client ID:  abc123xyz                             │
│   Tool:       ✓ xdotool available                   │
│   Messages:   0                                      │
│                                                      │
╰───── Waiting for voice input from Android... ───────╯
```

The display updates in real-time as messages arrive!

### Test Full Flow

1. Start relay server
2. Start Linux client
3. Connect Android app
4. Open a text editor (gedit, VS Code, etc.)
5. Focus the editor window
6. Speak "Hello world" into Android
7. See "Hello world" appear in editor

## Troubleshooting

### Relay Server Issues

**Port already in use:**

```bash
# Find process using port 8080
lsof -ti:8080 | xargs kill -9
```

**Can't access from Android:**

- Check firewall: `sudo ufw allow 8080`
- Verify same WiFi network
- Check IP address is correct

### Linux Client Issues

**xdotool not found:**

```bash
sudo apt install xdotool
```

**Text not appearing:**

- Make sure target window is focused
- Try with different applications
- For Wayland, use `--ydotool` flag

**Connection refused:**

- Verify relay server is running
- Check server URL in command

### Android App Issues

**Connection failed:**

- Verify server URL format: `ws://IP:PORT`
- Check Android and Linux are on same network
- Test server is accessible: `curl http://YOUR_IP:8080`

**Voice input not working:**

- Enable Google Voice Typing in keyboard settings
- Grant microphone permission
- Use Gboard (Google Keyboard)

## Development

### Relay Server

```bash
cd relay-server
pnpm install
pnpm dev           # Development with auto-reload
pnpm build         # Compile TypeScript
pnpm start         # Run production build
```

### Linux Client

```bash
cd utterd
uv run utterd --help    # See all options
uv run utterd --server ws://example.com:8080  # Custom server
uv run utterd --ydotool # Use ydotool instead of xdotool

# Or make it executable and run directly
chmod +x utterd
./utterd --help
```

### Android App

See [android-app/README.md](android-app/README.md) for Android Studio setup.

## Roadmap

See [docs/PLAN.md](docs/PLAN.md) for detailed implementation phases:

- [x] **Phase 1**: Same-network MVP (current)
- [ ] **Phase 2**: Cloud relay server
- [ ] **Phase 3**: UX polish & reliability
- [ ] **Phase 4**: Security & encryption

## Inspiration

Architecture inspired by [happy-server](https://github.com/slopus/happy-server), which demonstrates WebSocket relay with end-to-end encryption.

## Contributing

This is currently a personal MVP. Contributions welcome after Phase 1 is stable.

## License

MIT

---

**Status:** Phase 1 MVP - Basic functionality working on same network
