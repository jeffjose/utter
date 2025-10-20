# Expo Cross-Platform Mobile App Migration

## Overview

This document outlines the plan to migrate the Android app (Kotlin) to a cross-platform mobile app using Expo/React Native, enabling support for both Android and iOS from a single codebase.

**Current State:**
- Native Android app in Kotlin (~1000 LOC)
- Features: WebSocket client, E2E encryption, Google OAuth, voice input
- Works well but iOS requires separate Swift implementation

**Target State:**
- Single Expo/React Native codebase in TypeScript
- 95%+ code sharing between Android and iOS
- Same features as current Android app
- Leverages existing TypeScript knowledge from relay-server
- New directory: `mobile-app/` (keeps `android-app/` unchanged)

---

## Table of Contents

1. [Why Expo?](#why-expo)
2. [Architecture Comparison](#architecture-comparison)
3. [Feature Mapping](#feature-mapping)
4. [Technology Stack](#technology-stack)
5. [Project Structure](#project-structure)
6. [Implementation Phases](#implementation-phases)
7. [Migration Strategy](#migration-strategy)
8. [Testing Strategy](#testing-strategy)
9. [Deployment](#deployment)

---

# Why Expo?

## Decision Rationale

### Advantages for Utter

| Factor | Expo | Native (Kotlin + Swift) | Weight |
|--------|------|------------------------|--------|
| **Code Reuse** | 95%+ shared | 0% (duplicate everything) | ⭐⭐⭐⭐⭐ |
| **TypeScript** | ✅ Already using TS for relay-server | ❌ Need to learn Swift | ⭐⭐⭐⭐ |
| **Development Speed** | 3-4 weeks total | 8-10 weeks total | ⭐⭐⭐⭐⭐ |
| **Maintenance** | One codebase | Two codebases | ⭐⭐⭐⭐⭐ |
| **Bug Fixes** | Fix once | Fix twice | ⭐⭐⭐⭐ |
| **Hot Reload** | ✅ Instant updates | ❌ Slow rebuilds | ⭐⭐⭐ |
| **OTA Updates** | ✅ Yes (Expo) | ❌ App Store required | ⭐⭐⭐ |
| **Native Features** | Good (Expo modules) | Excellent | ⭐⭐ |
| **App Size** | ~40-50 MB | ~5-10 MB each | ⭐ |
| **Performance** | Good (JS bridge) | Excellent (native) | ⭐⭐ |

**Decision:** Expo is the pragmatic choice for Utter because:
1. Solo developer → one codebase is significantly easier to maintain
2. Simple app → Expo handles all core needs
3. TypeScript expertise → minimal learning curve
4. Speed to market → 3-4 weeks vs 8-10 weeks

### When NOT to Use Expo

Expo would be a poor choice if:
- App requires bleeding-edge native APIs not available in Expo modules
- App size is critical (<10 MB requirement)
- Performance is absolutely critical (games, video editing)
- Team already has separate iOS/Android specialists

**None of these apply to Utter.**

---

# Architecture Comparison

## Current Android App Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Android App (Kotlin)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Activities:                                                 │
│  ├── SignInActivity (Google OAuth)                          │
│  ├── MainActivity (Server connection)                       │
│  ├── DeviceListActivity (Device selection)                  │
│  └── VoiceInputActivity (Main screen)                       │
│                                                              │
│  Managers:                                                   │
│  ├── WebSocketClient (OkHttp)                               │
│  ├── GoogleAuthManager (Play Services)                      │
│  ├── CryptoManager (E2E encryption)                         │
│  │   ├── KeyManager (X25519 keypair)                        │
│  │   └── MessageEncryption (AES-GCM)                        │
│  └── WebSocketManager (Singleton)                           │
│                                                              │
│  UI:                                                         │
│  ├── XML Layouts (activity_*.xml)                           │
│  ├── Material Design Components                             │
│  └── EditText with voice input                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Target Expo App Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               Expo App (React Native + TypeScript)           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Navigation (React Navigation):                             │
│  ├── SignInScreen (Google OAuth)                            │
│  ├── ServerConnectionScreen                                 │
│  ├── DeviceListScreen                                       │
│  └── VoiceInputScreen (Main)                                │
│                                                              │
│  Managers (TypeScript):                                     │
│  ├── WebSocketClient (native WebSocket API)                │
│  ├── AuthManager (expo-auth-session)                       │
│  ├── CryptoManager (expo-crypto + react-native-rsa)        │
│  │   ├── KeyManager (SecureStore)                           │
│  │   └── MessageEncryption (crypto-js or native)            │
│  └── State Management (React Context or Zustand)            │
│                                                              │
│  UI:                                                         │
│  ├── React Native Components                                │
│  ├── Styled Components or NativeWind                        │
│  └── expo-speech-recognition                                │
│                                                              │
│  Platform-Specific:                                         │
│  ├── iOS: Native voice input integration                    │
│  └── Android: Google Play Services (existing)               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Side-by-Side Comparison

| Component | Kotlin (Current) | Expo (Target) |
|-----------|------------------|---------------|
| **Language** | Kotlin | TypeScript |
| **UI Framework** | Android Views (XML) | React Native (JSX) |
| **Navigation** | Intent-based | React Navigation |
| **State Management** | Activity lifecycle | React Context/Zustand |
| **WebSocket** | OkHttp | Native WebSocket API |
| **OAuth** | Play Services | expo-auth-session |
| **Crypto** | BouncyCastle/Tink | expo-crypto + native modules |
| **Voice Input** | Android Speech API | expo-speech or react-native-voice |
| **Secure Storage** | Android KeyStore | expo-secure-store |
| **Build Tool** | Gradle | Metro bundler + EAS |
| **Lines of Code** | ~1200 | ~800 (estimated) |

---

# Feature Mapping

## Core Features & Expo Equivalents

### 1. Google OAuth Authentication

**Current (Kotlin):**
```kotlin
// GoogleAuthManager.kt
GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestIdToken(clientId)
    .requestEmail()
    .build()
```

**Expo Equivalent:**
```typescript
// useAuth.ts
import * as Google from 'expo-auth-session/providers/google';

const [request, response, promptAsync] = Google.useAuthRequest({
  clientId: GOOGLE_CLIENT_ID,
  scopes: ['openid', 'email', 'profile'],
});
```

**Complexity:** ⭐⭐ (Medium)
- Expo has good Google OAuth support via `expo-auth-session`
- Similar flow: user taps button → OAuth flow → ID token
- Tokens stored in `expo-secure-store`

---

### 2. WebSocket Client

**Current (Kotlin):**
```kotlin
// WebSocketClient.kt
val client = OkHttpClient()
val request = Request.Builder().url(serverUrl).build()
val webSocket = client.newWebSocket(request, listener)
```

**Expo Equivalent:**
```typescript
// WebSocketClient.ts
const ws = new WebSocket(serverUrl);

ws.onopen = () => { /* ... */ };
ws.onmessage = (event) => { /* ... */ };
ws.onerror = (error) => { /* ... */ };
```

**Complexity:** ⭐ (Easy)
- React Native has native WebSocket support
- Very similar API to browser WebSocket
- Same reconnection logic as Kotlin version

---

### 3. End-to-End Encryption

**Current (Kotlin):**
```kotlin
// CryptoManager.kt
// Uses BouncyCastle for X25519 ECDH + AES-256-GCM
val keyPair = generateX25519KeyPair()
val sharedSecret = performDH(privateKey, recipientPublicKey)
val aesKey = deriveAESKey(sharedSecret) // HKDF
val ciphertext = encryptAES_GCM(plaintext, aesKey)
```

**Expo Equivalent:**

**Option A: expo-crypto + react-native-rsa-native**
```typescript
// CryptoManager.ts
import * as Crypto from 'expo-crypto';
import RSA from 'react-native-rsa-native';

const keyPair = await RSA.generateKeys(2048);
// Then use expo-crypto for AES-GCM
```

**Option B: Native Module (if Option A insufficient)**
```typescript
// Write custom native module for X25519 + AES-GCM
// Similar to current Kotlin implementation
// Use Expo Config Plugins to integrate
```

**Complexity:** ⭐⭐⭐ (Medium-High)
- Most challenging part of migration
- May require custom native module for X25519
- AES-GCM available via `expo-crypto` or `crypto-js`
- Fallback: use Expo bare workflow for full native access

**Recommended Approach:**
1. Start with `expo-crypto` + `react-native-rsa-native`
2. If insufficient, write custom native module
3. Test thoroughly with existing relay server

---

### 4. Voice Input / Speech-to-Text

**Current (Kotlin):**
```kotlin
// VoiceInputActivity.kt
// Uses Android's built-in speech-to-text via EditText
textInput.addTextChangedListener { /* auto-send after 2s */ }
```

**Expo Equivalent:**

**Option A: expo-speech-recognition** (if available)
```typescript
import * as SpeechRecognition from 'expo-speech-recognition';

const startListening = async () => {
  const result = await SpeechRecognition.start({
    language: 'en-US',
  });
  setText(result.transcript);
};
```

**Option B: react-native-voice**
```typescript
import Voice from '@react-native-voice/voice';

Voice.onSpeechResults = (e) => {
  setText(e.value[0]);
};
await Voice.start('en-US');
```

**Complexity:** ⭐⭐ (Medium)
- Expo SDK includes `expo-speech` (text-to-speech)
- For speech-to-text, use community package `react-native-voice`
- iOS has native support via Speech framework
- Android uses Google's speech recognition

---

### 5. Secure Key Storage

**Current (Kotlin):**
```kotlin
// KeyManager.kt
// Uses Android KeyStore (hardware-backed)
val prefs = context.getSharedPreferences("utter_crypto", MODE_PRIVATE)
prefs.edit().putString("public_key", publicKeyBase64).apply()
```

**Expo Equivalent:**
```typescript
// KeyManager.ts
import * as SecureStore from 'expo-secure-store';

// Store private key securely
await SecureStore.setItemAsync('private_key', privateKeyBase64);

// Retrieve
const privateKey = await SecureStore.getItemAsync('private_key');
```

**Complexity:** ⭐ (Easy)
- `expo-secure-store` provides equivalent functionality
- iOS: Keychain Services
- Android: EncryptedSharedPreferences / Keystore
- Same security guarantees as native

---

### 6. Device Information

**Current (Kotlin):**
```kotlin
val deviceId = Settings.Secure.getString(
    context.contentResolver,
    Settings.Secure.ANDROID_ID
)
val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
```

**Expo Equivalent:**
```typescript
import * as Device from 'expo-device';
import * as Application from 'expo-application';

const deviceId = Application.androidId || await Application.getIosIdForVendorAsync();
const deviceName = `${Device.manufacturer} ${Device.modelName}`;
```

**Complexity:** ⭐ (Easy)
- `expo-device` provides all device information
- Cross-platform API works on both iOS and Android

---

### 7. Auto-Send After Typing Delay

**Current (Kotlin):**
```kotlin
textInput.addTextChangedListener(object : TextWatcher {
    override fun onTextChanged(s: CharSequence?, ...) {
        autoSendRunnable?.let { handler.removeCallbacks(it) }
        autoSendRunnable = Runnable { sendText() }
        handler.postDelayed(autoSendRunnable!!, 2000)
    }
})
```

**Expo Equivalent:**
```typescript
const [text, setText] = useState('');

useEffect(() => {
  const timer = setTimeout(() => {
    if (text.trim()) {
      sendText(text);
    }
  }, 2000);

  return () => clearTimeout(timer);
}, [text]);
```

**Complexity:** ⭐ (Easy)
- React `useEffect` + `setTimeout` provides same behavior
- Cleaner code with React hooks

---

## Feature Parity Matrix

| Feature | Android (Kotlin) | Expo | Implementation Effort |
|---------|------------------|------|----------------------|
| **Google OAuth** | ✅ Play Services | ✅ expo-auth-session | ⭐⭐ Medium |
| **WebSocket Client** | ✅ OkHttp | ✅ Native WebSocket | ⭐ Easy |
| **E2E Encryption** | ✅ BouncyCastle | ⚠️ expo-crypto + native module | ⭐⭐⭐ Medium-High |
| **Voice Input** | ✅ Android Speech API | ✅ react-native-voice | ⭐⭐ Medium |
| **Secure Storage** | ✅ KeyStore | ✅ expo-secure-store | ⭐ Easy |
| **Device Info** | ✅ Build.* | ✅ expo-device | ⭐ Easy |
| **Auto-send Delay** | ✅ Handler | ✅ useEffect + setTimeout | ⭐ Easy |
| **Connection Status** | ✅ Custom | ✅ React state | ⭐ Easy |
| **Device List** | ✅ ListView | ✅ FlatList | ⭐ Easy |
| **Navigation** | ✅ Intents | ✅ React Navigation | ⭐⭐ Medium |

**Overall Feasibility:** ✅ All features achievable in Expo

**Highest Risk:** E2E encryption (may require custom native module)

---

# Technology Stack

## Expo App Dependencies

### Core Framework
```json
{
  "expo": "~50.0.0",
  "react-native": "0.73.0",
  "react": "18.2.0",
  "typescript": "^5.3.0"
}
```

### Navigation
```json
{
  "@react-navigation/native": "^6.1.0",
  "@react-navigation/native-stack": "^6.9.0",
  "react-native-screens": "~3.29.0",
  "react-native-safe-area-context": "4.8.2"
}
```

### Authentication
```json
{
  "expo-auth-session": "~5.4.0",
  "expo-web-browser": "~12.8.0"
}
```

### Cryptography
```json
{
  "expo-crypto": "~12.8.0",
  "expo-secure-store": "~12.8.0",
  "react-native-rsa-native": "^2.0.5",
  "crypto-js": "^4.2.0"
}
```

### Speech Recognition
```json
{
  "@react-native-voice/voice": "^3.2.4",
  "expo-speech": "~11.7.0"
}
```

### Device & Application Info
```json
{
  "expo-device": "~5.9.0",
  "expo-application": "~5.8.0"
}
```

### UI & Styling
```json
{
  "react-native-paper": "^5.12.0",
  "nativewind": "^2.0.11",
  "tailwindcss": "^3.4.0"
}
```

### Utilities
```json
{
  "zustand": "^4.5.0",
  "date-fns": "^3.0.0"
}
```

## Development Tools

### Build & Deployment
- **Expo Application Services (EAS):** Build iOS and Android
- **Expo Go:** Test on device during development
- **Metro Bundler:** JavaScript bundler
- **EAS Update:** Over-the-air updates

### Testing
- **Jest:** Unit tests
- **React Native Testing Library:** Component tests
- **Detox:** E2E tests (optional)

### Type Safety
- **TypeScript:** Full type coverage
- **ESLint:** Code linting
- **Prettier:** Code formatting

---

# Project Structure

## Directory Layout

```
mobile-app/
├── app.json                    # Expo configuration
├── eas.json                    # EAS Build configuration
├── package.json
├── tsconfig.json
├── .gitignore
│
├── src/
│   ├── screens/                # React Native screens
│   │   ├── SignInScreen.tsx
│   │   ├── ServerConnectionScreen.tsx
│   │   ├── DeviceListScreen.tsx
│   │   └── VoiceInputScreen.tsx
│   │
│   ├── navigation/             # React Navigation
│   │   └── AppNavigator.tsx
│   │
│   ├── services/               # Business logic
│   │   ├── WebSocketClient.ts
│   │   ├── AuthManager.ts
│   │   └── crypto/
│   │       ├── CryptoManager.ts
│   │       ├── KeyManager.ts
│   │       └── MessageEncryption.ts
│   │
│   ├── state/                  # State management
│   │   ├── useConnectionStore.ts
│   │   └── useAuthStore.ts
│   │
│   ├── components/             # Reusable components
│   │   ├── DeviceListItem.tsx
│   │   ├── StatusIndicator.tsx
│   │   └── VoiceButton.tsx
│   │
│   ├── hooks/                  # Custom React hooks
│   │   ├── useWebSocket.ts
│   │   ├── useAuth.ts
│   │   └── useVoiceInput.ts
│   │
│   ├── types/                  # TypeScript types
│   │   ├── messages.ts
│   │   ├── device.ts
│   │   └── crypto.ts
│   │
│   ├── utils/                  # Utilities
│   │   ├── constants.ts
│   │   └── helpers.ts
│   │
│   └── App.tsx                 # Root component
│
├── assets/                     # Images, fonts, etc.
│   ├── icon.png
│   └── splash.png
│
└── __tests__/                  # Tests
    ├── unit/
    ├── integration/
    └── e2e/
```

## File Size Comparison

| Component | Kotlin (LOC) | Expo (Estimated LOC) | Reduction |
|-----------|--------------|---------------------|-----------|
| **Auth** | 150 | 80 | -47% |
| **WebSocket** | 250 | 150 | -40% |
| **Crypto** | 300 | 200 | -33% |
| **Screens** | 400 | 250 | -38% |
| **Navigation** | 50 | 30 | -40% |
| **Utils** | 100 | 50 | -50% |
| **Total** | ~1250 | ~760 | **-39%** |

**Reasons for reduction:**
- TypeScript conciseness vs Kotlin verbosity
- React's declarative UI vs imperative Android Views
- Built-in state management vs manual lifecycle
- Hooks reduce boilerplate

---

# Implementation Phases

## Phase Overview

| Phase | Component | Duration | Dependencies |
|-------|-----------|----------|--------------|
| **Phase 1** | Project setup & navigation | 1-2 days | None |
| **Phase 2** | WebSocket client | 2-3 days | Phase 1 |
| **Phase 3** | Authentication (Google OAuth) | 2-3 days | Phase 1 |
| **Phase 4** | Crypto & E2E encryption | 3-5 days | Phase 2 |
| **Phase 5** | Voice input integration | 2-3 days | Phase 2 |
| **Phase 6** | UI/UX polish & testing | 3-4 days | All phases |
| **Phase 7** | iOS testing & platform-specific fixes | 2-3 days | All phases |

**Total Estimated Time:** 15-23 days (~3-4 weeks)

---

## Phase 1: Project Setup & Navigation (1-2 days)

### Goals
- Create Expo project with TypeScript
- Set up React Navigation
- Implement basic screen structure
- Configure build settings

### Tasks

#### 1.1 Initialize Expo Project
```bash
cd /home/jeffjose/scripts/utter
npx create-expo-app mobile-app --template expo-template-blank-typescript
cd mobile-app
```

#### 1.2 Install Core Dependencies
```bash
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
npx expo install react-native-paper
```

#### 1.3 Create Navigation Structure

**File: `src/navigation/AppNavigator.tsx`**
```typescript
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="SignIn">
        <Stack.Screen name="SignIn" component={SignInScreen} />
        <Stack.Screen name="ServerConnection" component={ServerConnectionScreen} />
        <Stack.Screen name="DeviceList" component={DeviceListScreen} />
        <Stack.Screen name="VoiceInput" component={VoiceInputScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

#### 1.4 Create Placeholder Screens

Create basic screens with placeholder content:
- `SignInScreen.tsx`
- `ServerConnectionScreen.tsx`
- `DeviceListScreen.tsx`
- `VoiceInputScreen.tsx`

#### 1.5 Configure app.json

```json
{
  "expo": {
    "name": "Utter",
    "slug": "utter",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "ios": {
      "bundleIdentifier": "com.utter.mobile",
      "supportsTablet": false
    },
    "android": {
      "package": "com.utter.mobile",
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

### Testing Phase 1
```bash
npx expo start

# Test on device:
# - Scan QR code with Expo Go
# - Navigate between screens
# - Verify navigation works smoothly
```

**Success Criteria:**
- ✅ App launches without errors
- ✅ All 4 screens accessible via navigation
- ✅ Works on both Android and iOS (via Expo Go)

---

## Phase 2: WebSocket Client (2-3 days)

### Goals
- Implement WebSocket client matching Kotlin version
- Connection management (connect, disconnect, reconnect)
- Message sending and receiving
- State management with Zustand

### Tasks

#### 2.1 Create WebSocket Client

**File: `src/services/WebSocketClient.ts`**
```typescript
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isIntentionalDisconnect = false;

  constructor(
    private serverUrl: string,
    private onMessage: (data: any) => void,
    private onConnectionChange: (connected: boolean) => void,
  ) {}

  connect(): void {
    this.isIntentionalDisconnect = false;
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.onConnectionChange(true);
      this.register();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.onMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      this.onConnectionChange(false);
      if (!this.isIntentionalDisconnect) {
        this.scheduleReconnect();
      }
    };
  }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect(): void {
    this.isIntentionalDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.ws?.close();
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, 3000);
  }

  private register(): void {
    // Will implement in Phase 3 (with OAuth token)
  }
}
```

#### 2.2 Create Connection Store (Zustand)

**File: `src/state/useConnectionStore.ts`**
```typescript
import { create } from 'zustand';
import { WebSocketClient } from '../services/WebSocketClient';

interface ConnectionState {
  isConnected: boolean;
  client: WebSocketClient | null;
  serverUrl: string;
  setServerUrl: (url: string) => void;
  connect: () => void;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  isConnected: false,
  client: null,
  serverUrl: '',

  setServerUrl: (url: string) => set({ serverUrl: url }),

  connect: () => {
    const { serverUrl } = get();
    const client = new WebSocketClient(
      serverUrl,
      (message) => {
        // Handle incoming messages
      },
      (connected) => set({ isConnected: connected }),
    );
    client.connect();
    set({ client });
  },

  disconnect: () => {
    get().client?.disconnect();
    set({ client: null, isConnected: false });
  },
}));
```

#### 2.3 Create useWebSocket Hook

**File: `src/hooks/useWebSocket.ts`**
```typescript
import { useEffect } from 'react';
import { useConnectionStore } from '../state/useConnectionStore';

export function useWebSocket() {
  const { isConnected, connect, disconnect, client } = useConnectionStore();

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return {
    isConnected,
    connect,
    disconnect,
    send: (message: any) => client?.send(message),
  };
}
```

#### 2.4 Update ServerConnectionScreen

**File: `src/screens/ServerConnectionScreen.tsx`**
```typescript
export default function ServerConnectionScreen({ navigation }) {
  const [serverUrl, setServerUrl] = useState('');
  const { connect, isConnected } = useWebSocket();
  const setGlobalServerUrl = useConnectionStore(state => state.setServerUrl);

  const handleConnect = () => {
    setGlobalServerUrl(serverUrl);
    connect();
  };

  useEffect(() => {
    if (isConnected) {
      navigation.navigate('DeviceList');
    }
  }, [isConnected]);

  return (
    <View>
      <TextInput
        placeholder="Server URL (e.g., ws://192.168.1.100:8080)"
        value={serverUrl}
        onChangeText={setServerUrl}
      />
      <Button onPress={handleConnect}>Connect</Button>
    </View>
  );
}
```

### Testing Phase 2
```bash
# 1. Start relay server
cd relay-server
pnpm dev

# 2. Run Expo app
cd mobile-app
npx expo start

# 3. Test WebSocket connection
# - Enter server URL
# - Tap Connect
# - Check relay server logs for connection
# - Send test message
# - Verify message appears in relay logs
```

**Success Criteria:**
- ✅ WebSocket connects to relay server
- ✅ Connection status updates correctly
- ✅ Auto-reconnect works after disconnect
- ✅ Messages can be sent to server

---

## Phase 3: Authentication (Google OAuth) (2-3 days)

### Goals
- Implement Google OAuth using `expo-auth-session`
- Store ID token securely
- Auto-skip sign-in if already authenticated
- Send token during WebSocket registration

### Tasks

#### 3.1 Install Dependencies
```bash
npx expo install expo-auth-session expo-web-browser expo-secure-store
```

#### 3.2 Configure Google OAuth

**Update `app.json`:**
```json
{
  "expo": {
    "scheme": "utter",
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "bundleIdentifier": "com.utter.mobile",
      "googleServicesFile": "./GoogleService-Info.plist"
    }
  }
}
```

#### 3.3 Create Auth Manager

**File: `src/services/AuthManager.ts`**
```typescript
import * as Google from 'expo-auth-session/providers/google';
import * as SecureStore from 'expo-secure-store';

const GOOGLE_CLIENT_ID = 'your-client-id.apps.googleusercontent.com';

export class AuthManager {
  async getIdToken(): Promise<string | null> {
    return await SecureStore.getItemAsync('id_token');
  }

  async saveIdToken(token: string): Promise<void> {
    await SecureStore.setItemAsync('id_token', token);
  }

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync('id_token');
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getIdToken();
    return token !== null;
  }
}
```

#### 3.4 Create useAuth Hook

**File: `src/hooks/useAuth.ts`**
```typescript
import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import { AuthManager } from '../services/AuthManager';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const authManager = new AuthManager();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      authManager.saveIdToken(id_token);
      setIsAuthenticated(true);
    }
  }, [response]);

  const checkAuth = async () => {
    const authenticated = await authManager.isAuthenticated();
    setIsAuthenticated(authenticated);
  };

  const signIn = async () => {
    await promptAsync();
  };

  const signOut = async () => {
    await authManager.clearTokens();
    setIsAuthenticated(false);
  };

  return {
    isAuthenticated,
    signIn,
    signOut,
  };
}
```

#### 3.5 Update SignInScreen

**File: `src/screens/SignInScreen.tsx`**
```typescript
export default function SignInScreen({ navigation }) {
  const { isAuthenticated, signIn } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigation.replace('ServerConnection');
    }
  }, [isAuthenticated]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Utter</Text>
      <Button onPress={signIn}>Sign in with Google</Button>
    </View>
  );
}
```

#### 3.6 Update WebSocket Registration

**File: `src/services/WebSocketClient.ts`**
```typescript
private async register(): Promise<void> {
  const authManager = new AuthManager();
  const idToken = await authManager.getIdToken();
  const publicKey = ''; // Will implement in Phase 4

  const registerMsg = {
    type: 'register',
    token: idToken,
    clientType: 'android', // Or 'ios' on iOS
    deviceId: await this.getDeviceId(),
    deviceName: await this.getDeviceName(),
    publicKey,
    version: '1.0.0',
    platform: Platform.OS,
    arch: 'arm64', // Or dynamically detect
  };

  this.send(registerMsg);
}
```

### Testing Phase 3
```bash
# 1. Run Expo app
npx expo start

# 2. Test OAuth flow
# - App should show Sign In screen
# - Tap "Sign in with Google"
# - Complete OAuth flow in browser
# - Should redirect back to app
# - Should navigate to ServerConnection screen

# 3. Close and reopen app
# - Should skip sign-in (already authenticated)
# - Should go directly to ServerConnection

# 4. Test registration
# - Connect to relay server
# - Check server logs for verified user_id
```

**Success Criteria:**
- ✅ Google OAuth flow works on both platforms
- ✅ ID token stored securely
- ✅ Auto-skip sign-in when already authenticated
- ✅ Token sent during WebSocket registration
- ✅ Relay server verifies token successfully

---

## Phase 4: Crypto & E2E Encryption (3-5 days)

### Goals
- Implement E2E encryption matching Kotlin version
- X25519 ECDH key exchange
- AES-256-GCM encryption/decryption
- Key storage in secure store

### Tasks

#### 4.1 Install Dependencies
```bash
npx expo install expo-crypto
npm install react-native-rsa-native crypto-js
npm install @types/crypto-js --save-dev
```

#### 4.2 Research Crypto Implementation

**Option A: expo-crypto + crypto-js** (Try first)
- Use `expo-crypto` for random bytes
- Use `crypto-js` for AES-GCM
- May need custom native module for X25519

**Option B: Custom Native Module** (Fallback)
- Write native module for X25519 + AES-GCM
- Use Expo Config Plugins to integrate
- Similar to Kotlin implementation

#### 4.3 Create KeyManager

**File: `src/services/crypto/KeyManager.ts`**
```typescript
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export class KeyManager {
  private static readonly PRIVATE_KEY = 'utter_private_key';
  private static readonly PUBLIC_KEY = 'utter_public_key';

  async getOrGenerateKeyPair(): Promise<KeyPair> {
    let privateKey = await SecureStore.getItemAsync(KeyManager.PRIVATE_KEY);
    let publicKey = await SecureStore.getItemAsync(KeyManager.PUBLIC_KEY);

    if (!privateKey || !publicKey) {
      const keyPair = await this.generateKeyPair();
      await this.saveKeyPair(keyPair);
      return keyPair;
    }

    return { privateKey, publicKey };
  }

  private async generateKeyPair(): Promise<KeyPair> {
    // TODO: Implement X25519 key generation
    // Option 1: Use react-native-rsa-native
    // Option 2: Custom native module
    // For now, placeholder:
    const privateKey = await Crypto.getRandomBytesAsync(32);
    const publicKey = await Crypto.getRandomBytesAsync(32);

    return {
      privateKey: this.base64Encode(privateKey),
      publicKey: this.base64Encode(publicKey),
    };
  }

  private async saveKeyPair(keyPair: KeyPair): Promise<void> {
    await SecureStore.setItemAsync(KeyManager.PRIVATE_KEY, keyPair.privateKey);
    await SecureStore.setItemAsync(KeyManager.PUBLIC_KEY, keyPair.publicKey);
  }

  async getPublicKeyBase64(): Promise<string> {
    const keyPair = await this.getOrGenerateKeyPair();
    return keyPair.publicKey;
  }

  private base64Encode(bytes: Uint8Array): string {
    // Convert Uint8Array to base64
    return btoa(String.fromCharCode(...bytes));
  }
}
```

#### 4.4 Create MessageEncryption

**File: `src/services/crypto/MessageEncryption.ts`**
```typescript
import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

export class MessageEncryption {
  constructor(private keyManager: KeyManager) {}

  async encrypt(plaintext: string, recipientPublicKey: string): Promise<EncryptedMessage> {
    // 1. Generate ephemeral keypair
    const ephemeralKeyPair = await this.generateEphemeralKeyPair();

    // 2. Perform ECDH (X25519)
    const sharedSecret = await this.performDH(
      ephemeralKeyPair.privateKey,
      recipientPublicKey
    );

    // 3. Derive AES key using HKDF
    const aesKey = this.deriveAESKey(sharedSecret);

    // 4. Generate random nonce (12 bytes for AES-GCM)
    const nonce = await Crypto.getRandomBytesAsync(12);

    // 5. Encrypt with AES-256-GCM
    const ciphertext = this.encryptAES_GCM(plaintext, aesKey, nonce);

    return {
      ciphertext: this.base64Encode(ciphertext),
      nonce: this.base64Encode(nonce),
      ephemeralPublicKey: ephemeralKeyPair.publicKey,
    };
  }

  async decrypt(
    encrypted: EncryptedMessage,
    senderPublicKey: string
  ): Promise<string> {
    // 1. Load my private key
    const keyPair = await this.keyManager.getOrGenerateKeyPair();

    // 2. Perform ECDH with sender's ephemeral public key
    const sharedSecret = await this.performDH(
      keyPair.privateKey,
      encrypted.ephemeralPublicKey
    );

    // 3. Derive AES key (same derivation as sender)
    const aesKey = this.deriveAESKey(sharedSecret);

    // 4. Decrypt with AES-256-GCM
    const ciphertext = this.base64Decode(encrypted.ciphertext);
    const nonce = this.base64Decode(encrypted.nonce);

    const plaintext = this.decryptAES_GCM(ciphertext, aesKey, nonce);

    return plaintext;
  }

  private async performDH(privateKey: string, publicKey: string): Promise<Uint8Array> {
    // TODO: Implement X25519 ECDH
    // This is the challenging part - may need native module
    throw new Error('Not implemented');
  }

  private deriveAESKey(sharedSecret: Uint8Array): CryptoJS.lib.WordArray {
    // HKDF-SHA256
    const salt = CryptoJS.enc.Utf8.parse('utter-relay-e2e-2024');
    const info = CryptoJS.enc.Utf8.parse('message-encryption-v1');

    // Simplified HKDF (use proper library in production)
    const key = CryptoJS.PBKDF2(
      CryptoJS.lib.WordArray.create(sharedSecret as any),
      salt,
      { keySize: 256 / 32, iterations: 1 }
    );

    return key;
  }

  private encryptAES_GCM(
    plaintext: string,
    key: CryptoJS.lib.WordArray,
    nonce: Uint8Array
  ): Uint8Array {
    // TODO: Use crypto-js or native module for AES-GCM
    // crypto-js doesn't have AES-GCM, may need react-native-aes-gcm-crypto
    throw new Error('Not implemented');
  }

  private decryptAES_GCM(
    ciphertext: Uint8Array,
    key: CryptoJS.lib.WordArray,
    nonce: Uint8Array
  ): string {
    // TODO: Use crypto-js or native module for AES-GCM
    throw new Error('Not implemented');
  }
}
```

**Note:** Phase 4 is the most complex. May require:
1. Research into React Native crypto libraries
2. Possibly writing a custom native module
3. Or using Expo bare workflow for full native access

#### 4.5 Fallback: Native Module Approach

If expo-crypto + crypto-js insufficient, create native module:

**File: `src/services/crypto/native/CryptoNative.ts`**
```typescript
import { NativeModules } from 'react-native';

const { CryptoNative } = NativeModules;

export interface CryptoNativeInterface {
  generateX25519KeyPair(): Promise<{ privateKey: string; publicKey: string }>;
  performECDH(privateKey: string, publicKey: string): Promise<string>;
  encryptAES_GCM(plaintext: string, key: string, nonce: string): Promise<string>;
  decryptAES_GCM(ciphertext: string, key: string, nonce: string): Promise<string>;
}

export default CryptoNative as CryptoNativeInterface;
```

Then implement native code:
- **Android:** Kotlin (reuse existing `CryptoManager.kt`)
- **iOS:** Swift (new implementation)

### Testing Phase 4
```bash
# 1. Unit tests for crypto functions
npm test -- crypto

# 2. Integration test with relay server
# - Generate keypair on mobile app
# - Send public key during registration
# - Encrypt message on mobile
# - Send to utterd (Rust client)
# - Verify utterd can decrypt
# - Send encrypted message from utterd
# - Verify mobile can decrypt

# 3. Test key persistence
# - Close and reopen app
# - Verify same keypair loaded
```

**Success Criteria:**
- ✅ Keypair generation works
- ✅ Public key sent during registration
- ✅ Encryption/decryption roundtrip successful
- ✅ Messages decrypt correctly on utterd
- ✅ Keys persist across app restarts

---

## Phase 5: Voice Input Integration (2-3 days)

### Goals
- Implement voice input using `@react-native-voice/voice`
- Auto-send after 2 seconds of no typing
- Send encrypted messages to target device

### Tasks

#### 5.1 Install Dependencies
```bash
npm install @react-native-voice/voice
npx expo install expo-speech
```

#### 5.2 Create useVoiceInput Hook

**File: `src/hooks/useVoiceInput.ts`**
```typescript
import { useEffect, useState } from 'react';
import Voice from '@react-native-voice/voice';

export function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    Voice.onSpeechResults = (e) => {
      setTranscript(e.value?.[0] || '');
    };

    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startListening = async () => {
    try {
      await Voice.start('en-US');
    } catch (error) {
      console.error('Voice input error:', error);
    }
  };

  const stopListening = async () => {
    try {
      await Voice.stop();
    } catch (error) {
      console.error('Voice stop error:', error);
    }
  };

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
  };
}
```

#### 5.3 Update VoiceInputScreen

**File: `src/screens/VoiceInputScreen.tsx`**
```typescript
export default function VoiceInputScreen({ route }) {
  const { deviceId, deviceName, publicKey } = route.params;
  const [text, setText] = useState('');
  const { isListening, transcript, startListening, stopListening } = useVoiceInput();
  const { send } = useWebSocket();
  const cryptoManager = useCryptoManager();

  // Auto-send after 2 seconds of no typing
  useEffect(() => {
    if (!text.trim()) return;

    const timer = setTimeout(async () => {
      await sendMessage(text);
      setText('');
    }, 2000);

    return () => clearTimeout(timer);
  }, [text]);

  // Update text when voice transcript changes
  useEffect(() => {
    if (transcript) {
      setText(transcript);
    }
  }, [transcript]);

  const sendMessage = async (message: string) => {
    const encrypted = await cryptoManager.encrypt(message, publicKey);

    send({
      type: 'message',
      to: deviceId,
      encrypted: true,
      content: encrypted.ciphertext,
      nonce: encrypted.nonce,
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      timestamp: Date.now(),
    });
  };

  return (
    <View style={styles.container}>
      <Text>Sending to: {deviceName}</Text>

      <TextInput
        placeholder="Type or speak a message..."
        value={text}
        onChangeText={setText}
        multiline
      />

      <Button
        onPress={isListening ? stopListening : startListening}
        title={isListening ? '🎤 Listening...' : '🎤 Tap to Speak'}
      />
    </View>
  );
}
```

### Testing Phase 5
```bash
# 1. Run on physical device (voice input doesn't work in simulator)
npx expo start

# 2. Test voice input
# - Navigate to VoiceInputScreen
# - Tap "Tap to Speak"
# - Speak: "Hello world"
# - Verify text appears in input field
# - Verify auto-send after 2 seconds

# 3. Test typing
# - Type text manually
# - Verify auto-send after 2 seconds

# 4. Test encrypted message delivery
# - Ensure utterd is running
# - Send message from mobile app
# - Verify message types on Linux
```

**Success Criteria:**
- ✅ Voice input works on both platforms
- ✅ Transcript appears in text field
- ✅ Auto-send triggers after 2 seconds
- ✅ Messages encrypted before sending
- ✅ Messages delivered to target device

---

## Phase 6: UI/UX Polish & Testing (3-4 days)

### Goals
- Polish UI to match or exceed Android app
- Add loading states and error handling
- Implement device dropdown on main screen
- Comprehensive testing

### Tasks

#### 6.1 Implement Device Dropdown

**File: `src/screens/VoiceInputScreen.tsx`** (updated)
```typescript
export default function VoiceInputScreen() {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  return (
    <View style={styles.container}>
      {/* Device selector dropdown */}
      <TouchableOpacity onPress={() => setShowDevicePicker(true)}>
        <View style={styles.deviceSelector}>
          <Text>{selectedDevice?.deviceName || 'Select Device'}</Text>
          <Text>▼</Text>
        </View>
      </TouchableOpacity>

      {/* Device picker modal */}
      <Modal visible={showDevicePicker} animationType="slide">
        <FlatList
          data={devices}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => {
                setSelectedDevice(item);
                setShowDevicePicker(false);
              }}
            >
              <Text>{item.deviceName}</Text>
            </TouchableOpacity>
          )}
        />
      </Modal>

      {/* Rest of UI... */}
    </View>
  );
}
```

#### 6.2 Add Loading States

```typescript
// Loading spinner during connection
{isConnecting && <ActivityIndicator size="large" />}

// Empty state for device list
{devices.length === 0 && (
  <Text>No devices found. Start utterd on your Linux machine.</Text>
)}
```

#### 6.3 Error Handling

```typescript
// Connection errors
if (connectionError) {
  Alert.alert('Connection Error', connectionError, [
    { text: 'Retry', onPress: () => connect() },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

// Encryption errors
try {
  await sendMessage(text);
} catch (error) {
  Alert.alert('Failed to send message', error.message);
}
```

#### 6.4 Styling with NativeWind (TailwindCSS)

Install:
```bash
npm install nativewind
npm install --save-dev tailwindcss
npx tailwindcss init
```

Use:
```typescript
<View className="flex-1 bg-white p-4">
  <Text className="text-2xl font-bold mb-4">Select Device</Text>
  <TouchableOpacity className="bg-blue-500 p-4 rounded-lg">
    <Text className="text-white text-center">Connect</Text>
  </TouchableOpacity>
</View>
```

#### 6.5 Testing Checklist

**Unit Tests:**
- [ ] WebSocket client connection/disconnection
- [ ] Message encryption/decryption
- [ ] Auth token storage/retrieval
- [ ] Device list parsing

**Integration Tests:**
- [ ] Full OAuth flow
- [ ] WebSocket registration with token
- [ ] Device list fetch
- [ ] Encrypted message send/receive

**E2E Tests:**
- [ ] Sign in → Connect → Select Device → Send Message
- [ ] Auto-reconnect on network loss
- [ ] Token refresh
- [ ] App backgrounding/foregrounding

**Manual Testing:**
- [ ] Test on Android physical device
- [ ] Test on iOS physical device (or simulator)
- [ ] Test voice input on both platforms
- [ ] Test with poor network (airplane mode on/off)
- [ ] Test with multiple devices

### Testing Phase 6
```bash
# Run unit tests
npm test

# Run on both platforms
npx expo start

# Manual testing on Android
npx expo run:android

# Manual testing on iOS
npx expo run:ios
```

**Success Criteria:**
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ UI looks polished on both platforms
- ✅ Error states handled gracefully
- ✅ Loading states provide feedback

---

## Phase 7: iOS Testing & Platform-Specific Fixes (2-3 days)

### Goals
- Test thoroughly on iOS
- Fix platform-specific issues
- Ensure feature parity with Android

### Tasks

#### 7.1 iOS-Specific Configuration

**Update `app.json` for iOS:**
```json
{
  "ios": {
    "bundleIdentifier": "com.utter.mobile",
    "buildNumber": "1.0.0",
    "supportsTablet": false,
    "infoPlist": {
      "NSMicrophoneUsageDescription": "Utter needs microphone access for voice input",
      "NSSpeechRecognitionUsageDescription": "Utter uses speech recognition for voice-to-text"
    }
  }
}
```

#### 7.2 Test Voice Input on iOS

iOS uses native Speech framework, which may behave differently:
```typescript
// Platform-specific voice input configuration
if (Platform.OS === 'ios') {
  Voice.start('en-US', {
    // iOS-specific options
  });
}
```

#### 7.3 Test Crypto on iOS

Ensure encryption works on iOS:
- Test keypair generation
- Test message encryption/decryption
- Verify compatibility with Android-encrypted messages

#### 7.4 Handle iOS Keychain

`expo-secure-store` uses iOS Keychain, which may have different behavior:
```typescript
// Ensure tokens persist across app reinstalls (optional)
await SecureStore.setItemAsync('key', 'value', {
  keychainAccessible: SecureStore.WHEN_UNLOCKED,
});
```

#### 7.5 iOS Build & Testing

```bash
# Build iOS app with EAS
eas build --platform ios --profile preview

# Or run locally (requires macOS + Xcode)
npx expo run:ios
```

### Testing Phase 7

**iOS-Specific Tests:**
- [ ] OAuth flow works on iOS
- [ ] WebSocket connection stable
- [ ] Voice input works (test on physical device)
- [ ] Encryption/decryption works
- [ ] Keys persist in Keychain
- [ ] App works on both iPhone and iPad
- [ ] Dark mode support
- [ ] Notch/safe area handling

**Cross-Platform Tests:**
- [ ] Android → iOS message delivery
- [ ] iOS → Android message delivery
- [ ] iOS → Linux message delivery
- [ ] Mixed device types in device list

**Success Criteria:**
- ✅ All features work on iOS
- ✅ iOS app feels native (not like a web app)
- ✅ Cross-platform messaging works flawlessly
- ✅ Performance is smooth on both platforms

---

# Migration Strategy

## Parallel Development

### Keep android-app/ Unchanged

```
utter/
├── android-app/            # Existing Kotlin app (unchanged)
│   └── ...
├── mobile-app/             # New Expo app (in development)
│   └── ...
├── relay-server/           # Shared
├── utterd/                 # Shared
└── README.md
```

**Benefits:**
- Can test both versions side-by-side
- Rollback option if Expo doesn't work
- Gradual migration of users

### Code Reuse Strategy

**Shared TypeScript Code:**
- Message types (`types/messages.ts`)
- Constants (server URLs, etc.)
- Crypto algorithms (if written in TS)

**Consider:**
```
utter/
├── shared/                 # Shared TypeScript code
│   ├── types/
│   │   ├── messages.ts
│   │   └── device.ts
│   └── constants.ts
├── android-app/
├── mobile-app/             # Imports from ../shared/
├── relay-server/           # Imports from ../shared/
└── linux-test-client/      # Imports from ../shared/
```

## Gradual Rollout

### Alpha Testing (Internal)
1. Deploy Expo app to TestFlight (iOS) and Google Play Internal Testing (Android)
2. Test with 2-3 devices
3. Gather feedback
4. Fix bugs

### Beta Testing (Limited)
1. Expand to 10-20 beta testers
2. Monitor crash reports (Sentry, Firebase Crashlytics)
3. Performance monitoring
4. Iterate based on feedback

### Production Release
1. Release to App Store and Google Play
2. Monitor metrics (crash-free sessions, user engagement)
3. Support both Kotlin app and Expo app initially
4. Gradually sunset Kotlin app after Expo proves stable

---

# Testing Strategy

## Test Pyramid

```
         ┌─────────────┐
         │   E2E (5%)  │  Full user flows
         ├─────────────┤
         │ Integration │  Component integration
         │    (25%)    │
         ├─────────────┤
         │    Unit     │  Functions, utilities
         │    (70%)    │
         └─────────────┘
```

## Unit Tests (Jest + React Native Testing Library)

**File: `__tests__/services/WebSocketClient.test.ts`**
```typescript
describe('WebSocketClient', () => {
  it('should connect to server', async () => {
    const client = new WebSocketClient('ws://localhost:8080', jest.fn(), jest.fn());
    await client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('should send registration message', () => {
    // ...
  });

  it('should auto-reconnect on disconnect', () => {
    // ...
  });
});
```

## Integration Tests

**File: `__tests__/integration/auth-flow.test.ts`**
```typescript
describe('Authentication Flow', () => {
  it('should complete OAuth and store token', async () => {
    const { getByText } = render(<App />);

    fireEvent.press(getByText('Sign in with Google'));
    // Mock OAuth response
    await waitFor(() => {
      expect(SecureStore.getItemAsync).toHaveBeenCalledWith('id_token');
    });
  });
});
```

## E2E Tests (Optional: Detox)

**File: `e2e/full-flow.e2e.ts`**
```typescript
describe('Full User Flow', () => {
  it('should send encrypted message to Linux client', async () => {
    await element(by.id('sign-in-button')).tap();
    // Complete OAuth (mocked)
    await element(by.id('server-url-input')).typeText('ws://localhost:8080');
    await element(by.id('connect-button')).tap();
    await element(by.id('device-list-item-0')).tap();
    await element(by.id('text-input')).typeText('Hello world');
    // Wait 2 seconds for auto-send
    await waitFor(element(by.text('✓ Sent'))).toBeVisible().withTimeout(3000);
  });
});
```

## Manual Testing Checklist

**OAuth:**
- [ ] Sign in with Google works
- [ ] Token persists across app restarts
- [ ] Sign out clears token
- [ ] Token refresh works

**WebSocket:**
- [ ] Connection establishes
- [ ] Registration succeeds with valid token
- [ ] Auto-reconnect works
- [ ] Connection survives app backgrounding

**Encryption:**
- [ ] Keypair generated and persisted
- [ ] Public key sent during registration
- [ ] Messages encrypt correctly
- [ ] Messages decrypt correctly on Linux

**Voice Input:**
- [ ] Microphone permission requested
- [ ] Voice recognition works
- [ ] Transcript appears in text field
- [ ] Works on both Android and iOS

**UI/UX:**
- [ ] All screens navigate correctly
- [ ] Loading states show
- [ ] Error states show appropriate messages
- [ ] Dark mode supported (if applicable)

**Cross-Platform:**
- [ ] Works on Android 7.0+
- [ ] Works on iOS 13.0+
- [ ] Works on tablets
- [ ] Consistent behavior across platforms

---

# Deployment

## Build Configuration

### EAS Build (Recommended)

**File: `eas.json`**
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "bundler": "metro"
      }
    }
  }
}
```

### Building

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for Android (APK for testing)
eas build --platform android --profile preview

# Build for iOS (Simulator)
eas build --platform ios --profile preview

# Build for production
eas build --platform all --profile production
```

## App Store Deployment

### Google Play Store (Android)

1. **Generate Signing Keys:**
   ```bash
   eas credentials
   ```

2. **Build AAB:**
   ```bash
   eas build --platform android --profile production
   ```

3. **Upload to Google Play Console:**
   - Create app listing
   - Upload AAB
   - Fill out store listing (description, screenshots)
   - Submit for review

### Apple App Store (iOS)

1. **Apple Developer Account Required** ($99/year)

2. **Build IPA:**
   ```bash
   eas build --platform ios --profile production
   ```

3. **Upload to App Store Connect:**
   - Create app listing
   - Upload IPA via EAS Submit or Transporter
   - Fill out store listing
   - Submit for review

### Over-the-Air (OTA) Updates

```bash
# Publish update (code changes only, no native changes)
eas update --branch production --message "Fix voice input bug"

# Users get update on next app launch
# No App Store review required for JS-only changes
```

---

# Appendix: Comparison Tables

## Development Time Comparison

| Task | Kotlin + Swift | Expo |
|------|---------------|------|
| **Initial Setup** | 2 days (each platform) = 4 days | 1 day (both platforms) |
| **OAuth Implementation** | 3 days (each) = 6 days | 3 days (both) |
| **WebSocket Client** | 3 days (each) = 6 days | 2 days (both) |
| **E2E Encryption** | 4 days (each) = 8 days | 4 days (both) |
| **Voice Input** | 3 days (each) = 6 days | 3 days (both) |
| **UI Implementation** | 5 days (each) = 10 days | 4 days (both) |
| **Testing** | 4 days (each) = 8 days | 4 days (both) |
| **Platform-specific fixes** | 3 days (each) = 6 days | 3 days (both) |
| **Total** | **54 days** | **24 days** |

**Time Savings: 30 days (55% faster)**

## Maintenance Comparison

| Activity | Kotlin + Swift | Expo |
|----------|---------------|------|
| **Bug Fix** | Fix in both codebases | Fix once |
| **New Feature** | Implement twice | Implement once |
| **Dependency Updates** | Update twice | Update once |
| **Testing** | Test on both | Test on both (but one codebase) |
| **Code Review** | Review twice | Review once |

**Maintenance Effort: ~50% reduction**

## App Size Comparison

| Platform | Kotlin/Swift | Expo | Difference |
|----------|--------------|------|------------|
| **Android** | ~8 MB | ~42 MB | +34 MB |
| **iOS** | ~6 MB | ~45 MB | +39 MB |

**Note:** Expo apps are larger due to bundled JavaScript runtime, but for most users this is acceptable.

---

# Conclusion

## Recommended Approach

**Proceed with Expo migration for the following reasons:**

1. **Time Efficiency:** 3-4 weeks vs 8-10 weeks for native
2. **Maintenance:** One codebase instead of two
3. **TypeScript Expertise:** Leverage existing knowledge from relay-server
4. **Feature Parity:** All features achievable in Expo
5. **OTA Updates:** Ship bug fixes without App Store review
6. **Cross-Platform:** iOS support without learning Swift

## Highest Risk: E2E Encryption

**Mitigation:**
1. Prototype crypto implementation first (Phase 4)
2. If `expo-crypto` + libraries insufficient, write custom native module
3. Fallback: Use Expo bare workflow for full native access
4. Test extensively with existing relay server and utterd

## Next Steps

1. **Review this document** - Confirm approach
2. **Phase 1: Setup** - Create Expo project, test navigation
3. **Phase 4 Spike** - Prototype encryption early (de-risk)
4. **Iterate** - Build incrementally, test frequently
5. **Deploy** - Beta test before full release

---

## References

- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [expo-auth-session](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [expo-crypto](https://docs.expo.dev/versions/latest/sdk/crypto/)
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [react-native-voice](https://github.com/react-native-voice/voice)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)

---

**Document Version:** 1.0
**Last Updated:** 2025-10-19
**Status:** Ready for review and implementation
