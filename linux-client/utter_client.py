#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "websockets>=12.0",
#   "rich>=13.7.0",
# ]
# requires-python = ">=3.9"
# ///
"""
Utter Linux Client - Receives text from Android and simulates keyboard input
"""
import asyncio
import json
import subprocess
import sys
from datetime import datetime
from typing import Optional

import websockets
from websockets.asyncio.client import ClientConnection
from rich.console import Console
from rich.live import Live
from rich.table import Table
from rich.panel import Panel
from rich.layout import Layout
from rich.text import Text


class UtterClient:
    def __init__(self, server_url: str, use_ydotool: bool = False):
        self.server_url = server_url
        self.use_ydotool = use_ydotool
        self.ws: Optional[ClientConnection] = None
        self.client_id: Optional[str] = None
        self.console = Console()

        # Status tracking
        self.status = "Initializing..."
        self.connection_attempts = 0
        self.messages_received = 0
        self.last_text = ""
        self.last_error = ""
        self.tool_status = ""

    def check_dependencies(self) -> bool:
        """Check if xdotool or ydotool is installed"""
        tool = "ydotool" if self.use_ydotool else "xdotool"
        try:
            subprocess.run([tool, "--version"], capture_output=True, check=True)
            self.tool_status = f"✓ {tool} available"
            return True
        except FileNotFoundError:
            self.tool_status = f"✗ {tool} not found"
            self.last_error = f"Please install {tool}"
            return False
        except subprocess.CalledProcessError:
            self.tool_status = f"✓ {tool} available"
            return True

    def simulate_typing(self, text: str):
        """Simulate keyboard typing using xdotool or ydotool"""
        try:
            if self.use_ydotool:
                subprocess.run(["ydotool", "type", text], check=True)
            else:
                subprocess.run(["xdotool", "type", "--", text], check=True)

            self.last_text = text[:50] + ("..." if len(text) > 50 else "")
        except subprocess.CalledProcessError as e:
            self.last_error = f"Typing error: {e}"
        except Exception as e:
            self.last_error = f"Unexpected error: {e}"

    async def send_message(self, message: dict):
        """Send a message to the server"""
        if self.ws:
            try:
                await self.ws.send(json.dumps(message))
            except Exception as e:
                self.last_error = f"Send error: {e}"

    async def handle_message(self, message: dict):
        """Handle incoming messages from server"""
        msg_type = message.get("type")

        if msg_type == "connected":
            self.client_id = message.get("clientId")
            self.status = "Connected"
            await self.send_message({
                "type": "register",
                "clientType": "linux"
            })

        elif msg_type == "registered":
            self.status = "Registered - Ready"

        elif msg_type == "text":
            content = message.get("content", "")
            self.messages_received += 1
            self.simulate_typing(content)

        elif msg_type == "pong":
            pass  # Silently handle pong

    def generate_display(self) -> Panel:
        """Generate the status display"""
        # Create status table
        table = Table.grid(padding=(0, 2))
        table.add_column(style="cyan bold", justify="right")
        table.add_column(style="white")

        # Status indicator
        if self.status in ["Connected", "Registered - Ready"]:
            status_text = Text(self.status, style="bold green")
        elif "Connecting" in self.status or "Reconnecting" in self.status:
            status_text = Text(self.status, style="bold yellow")
        else:
            status_text = Text(self.status, style="bold red")

        table.add_row("Status:", status_text)
        table.add_row("Server:", self.server_url)

        if self.client_id:
            table.add_row("Client ID:", self.client_id)

        table.add_row("Tool:", self.tool_status)
        table.add_row("Messages:", str(self.messages_received))

        if self.last_text:
            table.add_row("Last Text:", self.last_text)

        if self.last_error:
            table.add_row("Error:", Text(self.last_error, style="bold red"))

        # Create panel
        title = "🎤 Utter Linux Client"
        if self.status == "Registered - Ready":
            subtitle = "Waiting for voice input from Android..."
        else:
            subtitle = f"Attempt #{self.connection_attempts}" if self.connection_attempts > 0 else ""

        return Panel(
            table,
            title=title,
            subtitle=subtitle,
            border_style="blue",
            padding=(1, 2)
        )

    async def connect(self, live):
        """Connect to the relay server and listen for messages"""
        self.connection_attempts += 1
        self.status = "Connecting..."
        self.last_error = ""
        live.update(self.generate_display())

        # Clear previous connection state
        self.ws = None
        self.client_id = None

        try:
            # Connect with timeout and ping/pong for keepalive
            async with websockets.connect(
                self.server_url,
                ping_interval=5,   # Send ping every 5 seconds
                ping_timeout=5,    # Wait 5 seconds for pong
                close_timeout=3    # Wait 3 seconds for close handshake
            ) as ws:
                self.ws = ws
                self.status = "Connected"
                live.update(self.generate_display())

                # Message loop - will exit on disconnect
                async for message in ws:
                    try:
                        data = json.loads(message)
                        await self.handle_message(data)
                        # Update display after handling message
                        live.update(self.generate_display())
                    except json.JSONDecodeError:
                        self.last_error = "Invalid JSON received"
                        live.update(self.generate_display())
                    except Exception as e:
                        self.last_error = f"Handler error: {e}"
                        live.update(self.generate_display())

        except websockets.exceptions.ConnectionClosedOK:
            self.status = "Disconnected"
            self.last_error = "Connection closed normally"
        except websockets.exceptions.ConnectionClosedError as e:
            self.status = "Disconnected"
            if e.rcvd:
                self.last_error = f"Server closed: {e.rcvd.reason or 'no reason'}"
            else:
                self.last_error = "Connection lost unexpectedly"
        except (ConnectionRefusedError, OSError) as e:
            self.status = "Connection Refused"
            if "111" in str(e) or "Connection refused" in str(e):
                self.last_error = "Server not running - start relay server first"
            else:
                self.last_error = "Cannot connect to server"
        except asyncio.TimeoutError:
            self.status = "Timeout"
            self.last_error = "Connection timeout - server not responding"
        except Exception as e:
            self.status = "Connection Error"
            # Show simpler error message
            error_str = str(e)
            if "Multiple exceptions" in error_str:
                self.last_error = "Server not reachable - check server URL"
            elif "getaddrinfo failed" in error_str:
                self.last_error = "Cannot resolve hostname"
            else:
                self.last_error = error_str[:80]  # Truncate long errors
        finally:
            # Always clear connection state on exit
            self.ws = None
            if not self.client_id:
                # Only clear if we never got registered
                pass

    async def run_with_display(self):
        """Main run loop with live display"""
        with Live(self.generate_display(), refresh_per_second=10, console=self.console) as live:
            while True:
                try:
                    # Try to connect (pass live so it can update display)
                    await self.connect(live)

                    # Update display after disconnect
                    live.update(self.generate_display())

                    # Countdown before reconnecting
                    reconnect_delay = 5
                    for remaining in range(reconnect_delay, 0, -1):
                        self.status = f"Reconnecting in {remaining}s..."
                        live.update(self.generate_display())
                        await asyncio.sleep(1)

                except KeyboardInterrupt:
                    self.status = "Shutting down..."
                    live.update(self.generate_display())
                    break
                except Exception as e:
                    self.last_error = f"Fatal error: {e}"
                    live.update(self.generate_display())
                    # Wait before retry on fatal error
                    for remaining in range(5, 0, -1):
                        self.status = f"Retrying in {remaining}s..."
                        live.update(self.generate_display())
                        await asyncio.sleep(1)

    async def run(self):
        """Main entry point"""
        if not self.check_dependencies():
            self.console.print(Panel(
                f"[red]✗ {self.tool_status}[/red]\n\n"
                f"{self.last_error}\n\n"
                f"Install command:\n"
                f"  [cyan]sudo apt install {'ydotool' if self.use_ydotool else 'xdotool'}[/cyan]",
                title="Missing Dependency",
                border_style="red"
            ))
            return

        await self.run_with_display()


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(
        description="Utter Linux Client - Voice dictation from Android",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s                              # Connect to localhost
  %(prog)s --server ws://192.168.1.5:8080  # Connect to remote server
  %(prog)s --ydotool                    # Use ydotool (Wayland)
        """
    )
    parser.add_argument(
        "--server",
        default="ws://localhost:8080",
        help="WebSocket server URL (default: ws://localhost:8080)"
    )
    parser.add_argument(
        "--ydotool",
        action="store_true",
        help="Use ydotool instead of xdotool (for Wayland)"
    )

    args = parser.parse_args()

    client = UtterClient(args.server, args.ydotool)

    try:
        asyncio.run(client.run())
    except KeyboardInterrupt:
        print("\nShutdown complete")


if __name__ == "__main__":
    main()
