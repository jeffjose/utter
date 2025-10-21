#!/bin/bash
# Build script for Utter Mobile App (Expo)
# Uses mise to ensure Java 17 and Node 20 are active

set -e

# Export JAVA_HOME from mise to ensure Gradle uses the correct Java version
export JAVA_HOME=$(mise where java)

# Add mise tools (ninja, cmake) to PATH for gradle
eval "$(mise activate bash)"
export PATH="$JAVA_HOME/bin:$PATH"

echo "Installing dependencies..."
pnpm install

echo ""
echo "Building Utter Mobile App (Expo)..."
echo "Using Java version:"
mise exec -- java -version 2>&1 | head -1

echo ""
echo "Using Node version:"
mise exec -- node --version

echo ""
echo "Building Android app..."
mise exec -- npx expo run:android

echo ""
echo "✓ Build complete!"
echo ""
echo "The app should now be running on your emulator or device."
