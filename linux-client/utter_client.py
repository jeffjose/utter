#!/usr/bin/env -S uv run
# /// script
# dependencies = [
#   "websockets>=12.0",
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
from websockets.client import WebSocketClientProtocol


class UtterClient:
    def __init__(self, server_url: str, use_ydotool: bool = False):
        self.server_url = server_url
        self.use_ydotool = use_ydotool
        self.ws: Optional[WebSocketClientProtocol] = None
        self.client_id: Optional[str] = None

    def log(self, message: str):
        """Simple logging with timestamp"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {message}")

    def check_dependencies(self):
        """Check if xdotool or ydotool is installed"""
        tool = "ydotool" if self.use_ydotool else "xdotool"
        try:
            subprocess.run([tool, "--version"], capture_output=True, check=True)
            self.log(f"✓ {tool} found")
            return True
        except FileNotFoundError:
            self.log(f"✗ {tool} not found. Please install it:")
            if self.use_ydotool:
                self.log("  sudo apt install ydotool")
            else:
                self.log("  sudo apt install xdotool")
            return False
        except subprocess.CalledProcessError:
            # Command exists but version check failed, that's okay
            return True

    def simulate_typing(self, text: str):
        """Simulate keyboard typing using xdotool or ydotool"""
        try:
            if self.use_ydotool:
                # ydotool type doesn't need display
                subprocess.run(["ydotool", "type", text], check=True)
            else:
                # xdotool types to the focused window
                subprocess.run(["xdotool", "type", "--", text], check=True)

            self.log(f"✓ Typed: {text[:50]}{'...' if len(text) > 50 else ''}")
        except subprocess.CalledProcessError as e:
            self.log(f"✗ Error typing text: {e}")
        except Exception as e:
            self.log(f"✗ Unexpected error: {e}")

    async def send_message(self, message: dict):
        """Send a message to the server"""
        if self.ws:
            try:
                await self.ws.send(json.dumps(message))
            except Exception as e:
                self.log(f"✗ Error sending message: {e}")

    async def handle_message(self, message: dict):
        """Handle incoming messages from server"""
        msg_type = message.get("type")

        if msg_type == "connected":
            self.client_id = message.get("clientId")
            self.log(f"✓ Connected with ID: {self.client_id}")
            # Register as linux client
            await self.send_message({
                "type": "register",
                "clientType": "linux"
            })

        elif msg_type == "registered":
            self.log(f"✓ Registered as {message.get('clientType')} client")

        elif msg_type == "text":
            content = message.get("content", "")
            from_client = message.get("from", "unknown")
            self.log(f"← Received text from {from_client}")
            # Simulate typing
            self.simulate_typing(content)

        elif msg_type == "pong":
            self.log("← Pong received")

        else:
            self.log(f"? Unknown message type: {msg_type}")

    async def connect(self):
        """Connect to the relay server and listen for messages"""
        self.log(f"Connecting to {self.server_url}...")

        try:
            async with websockets.connect(self.server_url) as ws:
                self.ws = ws
                self.log("✓ Connected to relay server")

                # Listen for messages
                async for message in ws:
                    try:
                        data = json.loads(message)
                        await self.handle_message(data)
                    except json.JSONDecodeError:
                        self.log(f"✗ Invalid JSON received: {message}")
                    except Exception as e:
                        self.log(f"✗ Error handling message: {e}")

        except websockets.exceptions.ConnectionClosed:
            self.log("✗ Connection closed")
        except Exception as e:
            self.log(f"✗ Connection error: {e}")

    async def run(self):
        """Main run loop with reconnection"""
        if not self.check_dependencies():
            return

        self.log("Utter Linux Client started")
        self.log("Waiting for text from Android...")

        while True:
            try:
                await self.connect()
            except KeyboardInterrupt:
                self.log("Shutting down...")
                break
            except Exception as e:
                self.log(f"✗ Error: {e}")

            # Reconnect after 5 seconds
            self.log("Reconnecting in 5 seconds...")
            await asyncio.sleep(5)


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Utter Linux Client")
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
