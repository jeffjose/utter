# utterd

Linux daemon for receiving voice dictation from Android. Connects to a relay server and types received text into the focused window.

## Requirements

- Rust (for building)
- `xdotool` (X11) or `ydotool` (Wayland)

Install tools:
```bash
sudo apt install xdotool  # For X11
sudo apt install ydotool  # For Wayland
```

## Building

```bash
cargo build --release
```

## Usage

Basic usage (connects to localhost:8080):
```bash
utterd
```

Connect to remote server:
```bash
utterd --server ws://192.168.1.100:8080
```

Use ydotool for Wayland:
```bash
utterd --tool ydotool
```

## Configuration

Settings are read in this order (last wins):

1. Default: `ws://localhost:8080`, `xdotool`
2. Environment: `UTTER_RELAY_SERVER=192.168.1.100:8080`
3. CLI flags: `--server`, `--tool`

Example with environment variable:
```bash
export UTTER_RELAY_SERVER=192.168.1.100:8080
utterd
```

## Running as a service

Create `/etc/systemd/system/utterd.service`:

```ini
[Unit]
Description=Utter Daemon
After=network.target

[Service]
Type=simple
User=your-username
Environment="UTTER_RELAY_SERVER=192.168.1.100:8080"
ExecStart=/path/to/utterd
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable utterd
sudo systemctl start utterd
```
