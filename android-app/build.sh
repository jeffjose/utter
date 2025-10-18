#!/bin/bash
# Build script for Utter Android app
# Uses mise to ensure Java 17 is active

set -e

echo "Building Utter Android app..."
echo "Using Java version:"
mise exec -- java -version 2>&1 | head -1

echo ""
echo "Building debug APK..."
mise exec -- ./gradlew assembleDebug --no-daemon

echo ""
echo "✓ Build complete!"
echo ""
echo "APK location:"
ls -lh app/build/outputs/apk/debug/app-debug.apk

echo ""
echo "To install on device:"
echo "  adb install app/build/outputs/apk/debug/app-debug.apk"
