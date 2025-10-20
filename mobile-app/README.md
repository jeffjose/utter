# Utter Mobile App

Cross-platform mobile app (Android & iOS) for secure, encrypted text input to other devices.

## Features

- ✅ Google OAuth authentication
- ✅ WebSocket connection to relay server
- ✅ E2E encryption (X25519 + AES-256-GCM)
- ✅ Auto-send after typing pause
- ✅ Voice input via keyboard (Google Keyboard / iOS keyboard)
- ✅ Device selection UI

## Prerequisites

- Node.js 20+ (managed via mise)
- pnpm 8+ (managed via mise)
- For iOS: macOS with Xcode
- For Android: Android Studio or Android SDK

## Setup

### 1. Install Dependencies

```bash
# Install with pnpm (NOT npm)
pnpm install
```

### 2. Configure Google OAuth

Create a Google OAuth client ID and update `src/utils/constants.ts`:

```typescript
export const GOOGLE_CLIENT_ID = 'your-google-client-id-here';
```

### 3. Configure Server URL

Update the default server URL in `src/utils/constants.ts`:

```typescript
export const DEFAULT_WEBSOCKET_URL = 'ws://YOUR_SERVER_IP:8080';
```

## Development

### Run on Android (Development Build)

**Important:** This app requires a development build (NOT Expo Go) because it uses `react-native-quick-crypto` for encryption.

```bash
# Build and run on Android
npx expo run:android
```

### Run on iOS (Development Build)

```bash
# Build and run on iOS (requires macOS)
npx expo run:ios
```

### Web (Testing Only)

```bash
# Note: Crypto features may not work in web mode
npx expo start --web
```

## Architecture

### Screens

- **SignInScreen** - Google OAuth authentication
- **ServerConnectionScreen** - Connect to WebSocket relay server
- **DeviceListScreen** - Select target device
- **TextInputScreen** - Type/speak text to send (encrypted)

### Services

- **AuthManager** - OAuth token management
- **WebSocketClient** - Relay server connection
- **MessageEncryption** - E2E encryption (X25519 + AES-GCM)
- **KeyManager** - Secure key storage

### State Management

- **Zustand stores:**
  - `useAuthStore` - Authentication state
  - `useConnectionStore` - WebSocket connection & devices

## Encryption

This app uses the same encryption as `utterd` (Rust client):

- **Key Exchange:** X25519 ECDH (via TweetNaCl)
- **Encryption:** AES-256-GCM (via react-native-quick-crypto)
- **Key Derivation:** HKDF-SHA256

Messages are fully end-to-end encrypted. The relay server cannot read message content.

## Building for Production

### Android

```bash
# Build APK
npx eas build --platform android --profile preview

# Build AAB (for Google Play)
npx eas build --platform android --profile production
```

### iOS

```bash
# Build for TestFlight/App Store
npx eas build --platform ios --profile production
```

## Project Structure

```
mobile-app/
├── src/
│   ├── screens/          # React Native screens
│   ├── navigation/       # React Navigation
│   ├── services/         # Business logic
│   │   └── crypto/       # Encryption modules
│   ├── state/            # Zustand stores
│   ├── hooks/            # Custom React hooks
│   ├── types/            # TypeScript types
│   └── utils/            # Utilities & constants
├── App.tsx               # Root component
├── app.json              # Expo configuration
└── package.json
```

## Troubleshooting

### "crypto.createCipheriv is not a function"

This means you're running in Expo Go. This app requires a development build:

```bash
npx expo run:android  # or npx expo run:ios
```

### "Failed to connect to WebSocket"

- Check server URL is correct
- Ensure relay server is running
- Check firewall/network settings

### Google OAuth not working

- Verify GOOGLE_CLIENT_ID is set correctly
- Check OAuth redirect URI configuration
- Ensure app.json has correct scheme: "utter"

## License

Same as parent Utter project.
