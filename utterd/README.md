# utterd

Receives text from Android and simulates keyboard input on Linux.

Features a clean, interactive terminal UI that updates in real-time showing connection status, messages received, and errors.

## Requirements

- Python 3.9+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- `xdotool` (X11) or `ydotool` (Wayland)

### Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Install xdotool (X11)

```bash
sudo apt install xdotool
```

### Install ydotool (Wayland)

```bash
sudo apt install ydotool
```

## Features

- **Interactive Display**: Live-updating status panel instead of scrolling logs
- **Auto-reconnect**: Automatically reconnects if connection drops with countdown timer
- **Ping/Pong Keepalive**: Detects dead connections within 5-10 seconds
- **Connection Resilience**: Handles server restarts, network interruptions, and timeouts
- **Error Handling**: Clear error messages with helpful suggestions
- **Message Counter**: Track how many messages have been received
- **Clean UI**: Uses Rich library for beautiful terminal output

### Resilience Features

The client is designed to handle real-world network issues:

- **Server goes down?** Auto-reconnects when server comes back
- **Network blip?** Detects via keepalive and reconnects
- **Timeout?** Won't hang - fails fast and retries
- **DNS issues?** Shows helpful error messages

See [TEST_RESILIENCE.md](TEST_RESILIENCE.md) for detailed testing scenarios.

## Usage

The script uses inline dependencies (PEP 723), so `uv` will automatically manage dependencies (websockets + rich).

### Connect to local relay server

```bash
uv run utterd
```

### Connect to remote relay server

```bash
uv run utterd --server ws://your-server.com:8080
```

### Use ydotool (Wayland)

```bash
uv run utterd --ydotool
```

## Testing

1. Start the relay server first
2. Start the Linux client:
   ```bash
   uv run utterd
   ```
3. Open a text editor (VS Code, gedit, etc.)
4. Focus the text editor window
5. Send text from Android app
6. Text should appear in the editor

## Systemd Service (Optional)

Create `/etc/systemd/system/utter-client.service`:

```ini
[Unit]
Description=Utter Linux Client
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/path/to/utter/utterd
ExecStart=/home/your-username/.local/bin/uv run utterd --server ws://your-server:8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable utter-client
sudo systemctl start utter-client
sudo systemctl status utter-client
```

View logs:

```bash
sudo journalctl -u utter-client -f
```

## Troubleshooting

### Text not appearing

1. Make sure the target window is focused
2. Check that xdotool/ydotool is installed
3. For Wayland, make sure ydotool daemon is running:
   ```bash
   sudo systemctl status ydotool
   ```

### Connection issues

1. Check that relay server is running
2. Verify the server URL is correct
3. Check firewall settings

### Permissions (ydotool)

ydotool may require root permissions. Run with sudo or add user to input group:

```bash
sudo usermod -a -G input $USER
```

Then log out and back in.
