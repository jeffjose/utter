#!/bin/bash
# Install script for Utter Android app
# Installs the debug APK to a connected Android device

set -e

APK_PATH="app/build/outputs/apk/debug/app-debug.apk"

# Check if APK exists
if [ ! -f "$APK_PATH" ]; then
    echo "Error: APK not found at $APK_PATH"
    echo "Please run ./build.sh first to build the APK"
    exit 1
fi

# Check if adb is available
if ! command -v adb &> /dev/null; then
    echo "Error: adb not found in PATH"
    echo "Please install Android SDK platform tools"
    exit 1
fi

# Check if device is connected
if ! adb devices | grep -q "device$"; then
    echo "Error: No Android device connected"
    echo "Please connect a device and enable USB debugging"
    exit 1
fi

echo "Installing Utter Android app..."
echo "APK: $APK_PATH"
echo ""

adb install -r "$APK_PATH"

echo ""
echo "✓ Installation complete!"
