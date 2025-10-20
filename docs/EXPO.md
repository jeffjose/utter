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

## Development Environment

**Toolchain Management:**
- [`mise`](https://mise.jdx.dev/) - Polyglot runtime manager (Linux native)
- Manages Node.js, pnpm, and other tool versions
- Consistent tooling across all Utter projects

**Package Manager:**
- [`pnpm`](https://pnpm.io/) - Fast, disk space efficient package manager
- Used throughout this document instead of `npm`
- Consistent with `relay-server/` and `linux-test-client/`

**Initial Setup:**
```bash
# Install mise (if not already installed)
curl https://mise.run | sh
echo 'eval "$(mise activate bash)"' >> ~/.bashrc  # or ~/.zshrc
source ~/.bashrc

# Install Node.js and pnpm via mise
mise use -g node@20
mise use -g pnpm@8

# Verify installation
node --version  # Should be v20.x.x
pnpm --version  # Should be 8.x.x
```

**Project Configuration:**

Create `.mise.toml` in `mobile-app/` directory:
```toml
[tools]
node = "20"
pnpm = "8"

[env]
# Optional: Set pnpm store location
PNPM_HOME = "{{ env.HOME }}/.local/share/pnpm"
```

**Command Equivalents:**

| npm | pnpm | Notes |
|-----|------|-------|
| `npm install` | `pnpm install` or `pnpm i` | Install dependencies |
| `npm install <pkg>` | `pnpm add <pkg>` | Add package |
| `npm install -D <pkg>` | `pnpm add -D <pkg>` | Add dev dependency |
| `npm test` | `pnpm test` | Run tests |
| `npx <cmd>` | `pnpm dlx <cmd>` | Execute package binary |
| `npm run <script>` | `pnpm <script>` | Run package script |

**Throughout this document:**
- All commands use `pnpm` instead of `npm`
- `npx expo` commands can optionally use `pnpm dlx expo`
- mise ensures consistent Node.js and pnpm versions

---

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

⚠️ **IMPORTANT: IMPLEMENTATION ORDER GUIDE**

The phases in this document are being reordered. **Use this table as your implementation guide:**

| When Implementing | Use Section Named | Why |
|-------------------|-------------------|-----|
| **Phase 0** | Phase 0: Crypto Spike | ✅ Correct - already added |
| **Phase 1** | Phase 1: Project Setup | ✅ Correct location |
| **Phase 2** | OLD "Phase 3: Authentication" section below | ⚠️ Content hasn't moved yet |
| **Phase 3** | OLD "Phase 2: WebSocket" section below | ⚠️ Content hasn't moved yet |
| **Phase 4** | Create from "Phase 6" Device List portion | 📝 Extract device list UI |
| **Phase 5** | Phase 5: Text Input | ✅ Mostly correct |
| **Phase 6** | OLD "Phase 4: Crypto & E2E" section | ⚠️ Use crypto from Phase 0 |
| **Phase 7** | Phase 6: UI/UX Polish | ⚠️ Renumber to 7 |
| **Phase 8** | Phase 7: iOS Testing | ⚠️ Renumber to 8 |

**🔑 KEY INSIGHT:** When you see "Phase 2" heading below, scroll down to find the **Authentication (OAuth)** content (currently mislabeled as "Phase 3"). Implement Auth first, then come back for WebSocket.

**Critical Dependencies:**
- ✅ Phase 0 (Crypto Spike) → Must complete FIRST (Go/No-Go decision)
- ✅ Phase 2 (Auth) → Must come BEFORE Phase 3 (WebSocket)
- ✅ Phase 3 (WebSocket) → Needs `AuthManager.getIdToken()` from Phase 2
- ✅ Phase 6 (Encryption) → Uses crypto modules from Phase 0

**Why This Matters:**
The original document had WebSocket before Auth, which creates a circular dependency. WebSocket registration needs the OAuth token, so Auth must come first.

---

## Phase Overview

**IMPORTANT:** Phases are ordered to minimize risk and ensure logical dependencies.

| Phase | Component | Duration | Dependencies | Risk Level |
|-------|-----------|----------|--------------|------------|
| **Phase 0** | Crypto spike (risk mitigation) | 2-3 days | None | 🔴 HIGH |
| **Phase 1** | Project setup & navigation | 1 day | None | 🟢 LOW |
| **Phase 2** | Authentication (Google OAuth) | 2-3 days | Phase 1 | 🟡 MEDIUM |
| **Phase 3** | WebSocket client | 2-3 days | Phase 2 | 🟡 MEDIUM |
| **Phase 4** | Device list UI | 1-2 days | Phase 3 | 🟢 LOW |
| **Phase 5** | Text input & plain messages | 1-2 days | Phase 3 | 🟢 LOW |
| **Phase 6** | Encryption integration | 2-3 days | Phase 0, Phase 5 | 🟡 MEDIUM |
| **Phase 7** | UI/UX polish & testing | 2-3 days | All phases | 🟢 LOW |
| **Phase 8** | iOS testing & platform fixes | 2-3 days | All phases | 🟡 MEDIUM |

**Total Estimated Time:** 14-22 days (~3-4 weeks)

**Critical Path:** Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 6

**Key Changes from Original Plan:**
- ✅ Added Phase 0 (Crypto Spike) - Fail fast on highest risk
- ✅ Moved Auth before WebSocket (correct dependency order)
- ✅ Extracted Device List UI as separate phase (clearer deliverable)
- ✅ Split Text Input from Encryption (incremental testing)
- ✅ Each phase now has clear end-to-end test checkpoint

---

## Phase 0: Crypto Spike / Risk Mitigation (2-3 days)

**⚠️ CRITICAL: This is a GO/NO-GO phase. Do NOT proceed to Phase 1 until crypto is validated.**

### Why Phase 0 Exists

E2E encryption is the **highest risk** component of this migration. If X25519 + AES-GCM doesn't work in Expo:
- The entire Expo approach fails
- Need to pivot to native apps (Kotlin + Swift)
- Discovering this on Day 10+ wastes significant time

**Phase 0 validates crypto feasibility before investing in the full app.**

---

### Goals

- ✅ Validate X25519 ECDH key exchange works in Expo
- ✅ Validate AES-256-GCM encryption/decryption works
- ✅ Test interoperability with existing utterd (Rust) implementation
- ✅ Determine technology choice (`expo-crypto` vs native module)
- ✅ Create reusable `CryptoManager` module for Phase 6
- ✅ **Make GO/NO-GO decision**

---

### Tasks

#### 0.1 Create Standalone Crypto Test Project

```bash
# Create minimal Expo project for crypto testing
npx create-expo-app crypto-spike --template blank-typescript
cd crypto-spike
```

#### 0.2 Install Crypto Libraries

```bash
# Try expo-crypto first
npx expo install expo-crypto

# Try community libraries
pnpm add crypto-js
pnpm add -D @types/crypto-js

# If needed: react-native-rsa-native for X25519
pnpm add react-native-rsa-native
```

#### 0.3 Implement X25519 Key Generation

**File: `CryptoTest.ts`**
```typescript
import * as Crypto from 'expo-crypto';

// Option 1: Try expo-crypto
async function generateX25519KeyPair_ExpoCrypto() {
  try {
    // Check if expo-crypto supports X25519
    const privateKey = await Crypto.getRandomBytesAsync(32);
    const publicKey = derivePublicKeyFromPrivate(privateKey); // If possible

    console.log('✅ expo-crypto supports X25519');
    return { privateKey, publicKey };
  } catch (error) {
    console.error('❌ expo-crypto does not support X25519:', error);
    return null;
  }
}

// Option 2: Try react-native-rsa-native or similar
// Option 3: Write custom native module

// Test all options
export async function testKeyGeneration() {
  const result = await generateX25519KeyPair_ExpoCrypto();

  if (!result) {
    console.log('⚠️ Need alternative approach for X25519');
    // Try other libraries...
  }

  return result;
}
```

#### 0.4 Implement ECDH Key Exchange

```typescript
// Perform Diffie-Hellman key exchange
async function performECDH(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array
): Promise<Uint8Array> {
  // This is the critical operation that may not be available in Expo
  // May need native module

  try {
    const sharedSecret = /* ... */;
    console.log('✅ ECDH works');
    return sharedSecret;
  } catch (error) {
    console.error('❌ ECDH failed:', error);
    throw error;
  }
}
```

#### 0.5 Implement AES-256-GCM Encryption

```typescript
import CryptoJS from 'crypto-js';

async function encryptAES_GCM(
  plaintext: string,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  // Test if crypto-js or expo-crypto supports AES-GCM
  try {
    // Note: crypto-js doesn't have AES-GCM, may need alternative
    const ciphertext = /* ... */;
    console.log('✅ AES-GCM encryption works');
    return ciphertext;
  } catch (error) {
    console.error('❌ AES-GCM encryption failed:', error);
    throw error;
  }
}

async function decryptAES_GCM(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<string> {
  // Decrypt
  try {
    const plaintext = /* ... */;
    console.log('✅ AES-GCM decryption works');
    return plaintext;
  } catch (error) {
    console.error('❌ AES-GCM decryption failed:', error);
    throw error;
  }
}
```

#### 0.6 Test Interoperability with Utterd

**Critical Test:** Can mobile app encrypt, and utterd decrypt?

```typescript
// Test file: test-with-utterd.ts

async function testCryptoRoundtrip() {
  // 1. Generate keypair on mobile
  const mobileKeys = await generateX25519KeyPair();
  console.log('Mobile public key:', base64Encode(mobileKeys.publicKey));

  // 2. Get utterd's public key (from relay server or hardcoded for test)
  const utterdPublicKey = base64Decode('utterd_public_key_here');

  // 3. Perform ECDH
  const sharedSecret = await performECDH(mobileKeys.privateKey, utterdPublicKey);

  // 4. Derive AES key
  const aesKey = await deriveAESKey(sharedSecret);

  // 5. Encrypt message
  const plaintext = 'Hello from Expo';
  const nonce = await Crypto.getRandomBytesAsync(12);
  const ciphertext = await encryptAES_GCM(plaintext, aesKey, nonce);

  // 6. Send to utterd via relay (or copy/paste for manual test)
  console.log('Encrypted message:', {
    ciphertext: base64Encode(ciphertext),
    nonce: base64Encode(nonce),
    ephemeralPublicKey: base64Encode(mobileKeys.publicKey)
  });

  // 7. Verify utterd can decrypt (check utterd logs)
  console.log('✅ Check utterd logs to verify decryption');
}
```

**Test Process:**
1. Run crypto spike app
2. Copy encrypted output
3. Manually send to utterd via relay
4. Check if utterd successfully decrypts and types message

---

### Decision Tree

After completing tasks 0.1-0.6:

#### ✅ **SUCCESS: expo-crypto works**
```
Decision: Proceed with Expo
Next Step: Phase 1
Technology: expo-crypto + crypto-js
Effort: Use spike code in Phase 6
```

#### ⚠️ **PARTIAL: Need native module**
```
Decision: Proceed with Expo bare workflow
Next Step: Phase 1, but plan for native module in Phase 6
Technology: Custom native module for X25519
Effort: +2-3 days in Phase 6
```

#### ❌ **FAILURE: Crypto doesn't work**
```
Decision: Pivot to native apps (Kotlin + Swift)
Next Step: Abandon Expo, implement iOS in Swift
Technology: Native crypto libraries (BouncyCastle, CryptoKit)
Effort: 8-10 weeks total (back to original estimate)
```

---

### Testing Phase 0

```bash
# 1. Run spike app on physical device
cd crypto-spike
npx expo start

# 2. Test key generation
# - Tap "Test Key Generation"
# - Verify no errors
# - Check logs for public/private keys

# 3. Test encryption/decryption
# - Tap "Test Encryption"
# - Verify roundtrip works (encrypt → decrypt → same text)

# 4. Test with utterd
# - Start relay server and utterd
# - Run crypto spike
# - Tap "Send Encrypted to Utterd"
# - Check utterd logs for decrypted message
```

**Success Criteria:**
- ✅ X25519 keypair generation works
- ✅ ECDH key exchange works
- ✅ AES-256-GCM encryption/decryption works
- ✅ Utterd successfully decrypts message from mobile
- ✅ Mobile successfully decrypts message from utterd
- ✅ Performance acceptable (<100ms for encrypt/decrypt)

**Failure Criteria:**
- ❌ X25519 not available in any library
- ❌ AES-GCM not available in any library
- ❌ Utterd cannot decrypt mobile messages
- ❌ Encryption takes >500ms (too slow)

---

### Deliverables

**If SUCCESS:**
1. `CryptoManager.ts` - Reusable crypto module
2. `KeyManager.ts` - Key generation and storage
3. `MessageEncryption.ts` - Encrypt/decrypt functions
4. Test results document
5. **GO decision for Phase 1**

**If FAILURE:**
1. Document of findings
2. **NO-GO decision for Expo**
3. Alternative plan (native apps or different framework)

---

### Time Estimate

- **Best case:** 2 days (expo-crypto works out of box)
- **Likely case:** 3 days (need to try multiple libraries)
- **Worst case:** 3 days + pivot decision

**DO NOT proceed to Phase 1 until this phase is complete.**

---

## Phase 1: Project Setup & Navigation (1 day)

### Goals
- Create Expo project with TypeScript
- Set up React Navigation
- Implement basic screen structure
- Configure build settings

### Tasks

#### 1.0 Setup Toolchain with mise

**Prerequisites:** Ensure mise is installed (see Technology Stack section)

```bash
cd /home/jeffjose/scripts/utter

# Verify mise is available
mise --version

# Ensure Node.js 20 and pnpm 8 are installed globally
mise use -g node@20
mise use -g pnpm@8

# Verify
node --version  # Should be v20.x.x
pnpm --version  # Should be 8.x.x
```

#### 1.1 Initialize Expo Project
```bash
cd /home/jeffjose/scripts/utter
npx create-expo-app mobile-app --template expo-template-blank-typescript
cd mobile-app

# Create mise configuration for this project
cat > .mise.toml << 'EOF'
[tools]
node = "20"
pnpm = "8"
EOF

# Activate mise for this directory
mise install
```

#### 1.2 Install Core Dependencies
```bash
# Use npx for expo-specific commands (or pnpm dlx expo)
npx expo install @react-navigation/native @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context

# Use pnpm for standard npm packages
pnpm add react-native-paper
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

## Phase 2: Authentication (Google OAuth) (2-3 days)

**Prerequisites:** Phase 1 complete

### Goals
- Implement Google OAuth using `expo-auth-session`
- Store ID token securely in `expo-secure-store`
- Auto-skip sign-in if already authenticated
- Prepare token for WebSocket registration (Phase 3)

### Why Phase 2 (Not Phase 3)

Authentication must come **before** WebSocket because:
- WebSocket registration requires OAuth token
- Phase 3 (WebSocket) depends on `AuthManager.getIdToken()`
- Correct dependency order: Auth → WebSocket → Device List

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

## Phase 3: WebSocket Client (2-3 days)

**Prerequisites:** Phase 2 (Authentication) complete - need `AuthManager.getIdToken()`

### Goals
- Implement WebSocket client matching Kotlin version
- Connection management (connect, disconnect, reconnect)
- Message sending and receiving
- Register with relay server using OAuth token from Phase 2
- State management with Zustand

### Why Phase 3 (After Auth)

WebSocket comes **after** Authentication because:
- Registration message requires OAuth token from `AuthManager`
- Phase 2 creates `AuthManager.getIdToken()` method
- Relay server needs verified token to accept registration

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
pnpm add react-native-rsa-native crypto-js
pnpm add -D @types/crypto-js
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
pnpm test -- crypto

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

## Phase 5: Text Input Integration (1-2 days)

**Important:** This phase does **NOT** implement voice recognition in the app. We rely on Google Keyboard's (or iOS keyboard's) built-in voice input feature.

### Goals
- Auto-focus `TextInput` when screen opens
- Keyboard opens automatically (with mic button available)
- Implement 2-second auto-send countdown with visual progress
- Send encrypted messages to target device

### Tasks

#### 5.1 Install Dependencies
```bash
# No voice recognition libraries needed!
# Using standard React Native components only
```

#### 5.2 Create TextInputScreen

**File: `src/screens/TextInputScreen.tsx`**
```typescript
import { useEffect, useRef, useState } from 'react';
import { TextInput, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function TextInputScreen({ route, navigation }) {
  const { deviceId, deviceName, publicKey } = route.params;
  const [text, setText] = useState('');
  const [countdown, setCountdown] = useState(0); // 0 to 1 progress
  const textInputRef = useRef<TextInput>(null);

  // Auto-focus keyboard when screen opens
  useEffect(() => {
    const timer = setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-send countdown (2 seconds)
  useEffect(() => {
    if (text.trim() === '') {
      setCountdown(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / 2000, 1); // 2 seconds
      setCountdown(progress);

      if (progress >= 1) {
        clearInterval(interval);
        sendMessage();
      }
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(interval);
  }, [text]);

  const sendMessage = async () => {
    if (!text.trim()) return;

    const encrypted = await encryptMessage(text, publicKey);
    await sendToRelay({
      type: 'message',
      to: deviceId,
      encrypted: true,
      content: encrypted.ciphertext,
      nonce: encrypted.nonce,
      ephemeralPublicKey: encrypted.ephemeralPublicKey,
      timestamp: Date.now(),
    });

    setText('');
    setCountdown(0);

    // Show brief confirmation
    showToast('✓ Sent');
  };

  const cancelSend = () => {
    setText('');
    setCountdown(0);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.deviceName}>{deviceName}</Text>
      </View>

      {/* Main text input area */}
      <TextInput
        ref={textInputRef}
        style={styles.textInput}
        placeholder="Start typing or use keyboard mic..."
        value={text}
        onChangeText={setText}
        multiline
        autoFocus={true}  // Auto-focus on mount
        keyboardType="default"
        returnKeyType="default"
      />

      {/* Countdown progress bar */}
      {countdown > 0 && (
        <TouchableOpacity onPress={cancelSend} style={styles.countdownContainer}>
          <Text style={styles.countdownText}>
            Sending in {Math.ceil((1 - countdown) * 2)}s
          </Text>
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                { width: `${(1 - countdown) * 100}%` } // Depletes over time
              ]}
            />
          </View>
          <Text style={styles.cancelHint}>Tap to cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    fontSize: 16,
    color: '#6750A4',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    padding: 16,
    textAlignVertical: 'top',
  },
  countdownContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  countdownText: {
    fontSize: 14,
    color: '#49454F',
    marginBottom: 8,
  },
  progressBarContainer: {
    width: '60%',
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6750A4',
  },
  cancelHint: {
    fontSize: 12,
    color: '#9E9E9E',
    marginTop: 8,
  },
});
```

### How It Works

**1. User Flow:**
```
Tap device in list
    ↓
Navigate to TextInputScreen
    ↓
Keyboard auto-opens (with system mic button)
    ↓
User types OR taps keyboard mic to dictate
    ↓
Text appears in TextInput
    ↓
2-second countdown starts
    ↓
Progress bar depletes
    ↓
Message sends automatically
    ↓
TextInput clears
```

**2. Voice Input (via Keyboard):**
- Android: Google Keyboard has built-in mic button
- iOS: iOS keyboard has built-in dictation
- **No in-app voice recognition needed**
- User taps keyboard mic → speaks → text appears
- Same experience as any messaging app

**3. Auto-Send Countdown:**
- Starts when `text` changes and is non-empty
- Progress updates every 50ms for smooth animation
- Progress bar depletes from 100% → 0% over 2 seconds
- Visual: `▓▓▓▓▓░░░` → `▓▓▓░░░░░` → `░░░░░░░░`
- Tap anywhere to cancel
- If user types more, countdown resets

### Testing Phase 5
```bash
# 1. Run on physical device
npx expo start  # or: pnpm dlx expo start

# 2. Test text input
# - Navigate to device list
# - Tap a device
# - Verify keyboard opens automatically
# - Type text manually
# - Verify countdown starts
# - Verify auto-send after 2 seconds

# 3. Test keyboard voice input
# - Navigate to TextInputScreen
# - Tap microphone button on keyboard (Google Keyboard or iOS keyboard)
# - Speak: "Hello world"
# - Verify text appears in input field
# - Verify countdown starts
# - Verify auto-send after 2 seconds

# 4. Test cancel
# - Start typing
# - Wait for countdown to start
# - Tap the countdown area
# - Verify text clears and countdown stops

# 5. Test encrypted message delivery
# - Ensure utterd is running
# - Send message from mobile app
# - Verify message types on Linux
```

**Success Criteria:**
- ✅ Keyboard opens automatically when screen opens
- ✅ User can type text normally
- ✅ User can use keyboard's mic button to dictate (Google Keyboard or iOS keyboard)
- ✅ Text appears in input field
- ✅ Auto-send countdown starts after typing stops
- ✅ Countdown bar animates smoothly (depletes over 2 seconds)
- ✅ Tap to cancel countdown works
- ✅ Messages encrypted before sending
- ✅ Messages delivered to target device
- ✅ TextInput clears after sending

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
pnpm add nativewind
pnpm add -D tailwindcss
pnpm dlx tailwindcss init
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
pnpm test

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
# Install EAS CLI globally via mise (recommended)
mise use -g eas-cli@latest

# Or install via npm globally (alternative)
# npm install -g eas-cli

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

# UI/UX Reference: Tailscale Android App

## Source

This section captures UI/UX patterns and design insights learned from studying the **Tailscale Android app** (`tailscale-android/` repository), which was redesigned in May 2024 using Jetpack Compose and Material Design 3.

**Repository:** https://github.com/tailscale/tailscale-android

**Key Files Analyzed:**
- `android/src/main/java/com/tailscale/ipn/ui/view/MainView.kt` - Main screen with peer list
- `android/src/main/java/com/tailscale/ipn/ui/view/IntroView.kt` - Onboarding screen
- `android/src/main/java/com/tailscale/ipn/ui/view/PeerDetails.kt` - Device detail screen
- `android/src/main/java/com/tailscale/ipn/ui/view/SearchView.kt` - Search functionality
- `android/src/main/java/com/tailscale/ipn/ui/view/Avatar.kt` - User avatar component
- `android/src/main/java/com/tailscale/ipn/MainActivity.kt` - Navigation structure

---

## Tailscale's Information Architecture

### Screen Flow (Relevant to Utter)

```
IntroView (first launch)
    ↓
MainView (peer/node list) ← Main screen
    ├─> PeerDetails (tap on peer)
    ├─> SearchView (tap search bar)
    ├─> SettingsView (tap avatar)
    └─> ExitNodePicker (not relevant to Utter)
```

**Similarities to Utter:**
- Login/intro flow → Main list of devices → Detail view
- Search functionality
- Settings via avatar
- Single-activity architecture with Jetpack Compose

---

## Key UI Patterns from Tailscale

### 1. MainView Header (Lines 156-210)

**Pattern: Clean Status Header with Avatar**

```kotlin
ListItem(
    leadingContent = { TintedSwitch(...) },      // VPN toggle (we skip)
    headlineContent = { Text(tailnetName) },     // Domain/user info
    supportingContent = {                        // Connection status
        Row {
            Text(stateStr)                       // "Connected", "Running"
            HealthIcon()                         // Warning/error icon
        }
    },
    trailingContent = {                          // Profile avatar
        Avatar(
            profile = user,
            size = 36,
            onClick = { navigateToSettings() }
        )
    }
)
```

**Utter Application:**
```typescript
// Header in DeviceListScreen
<View style={headerStyle}>
  <View style={statusRow}>
    <StatusDot isConnected={true} />
    <Text>Connected to relay</Text>
  </View>

  <Avatar
    source={{ uri: user.profilePicture }}
    onPress={() => navigation.navigate('Settings')}
  />
</View>
```

**Key Takeaways:**
- ✅ Status indicator (dot + text) on left
- ✅ Clickable avatar on right → Settings
- ✅ Clean, single-row header
- ❌ Skip: VPN toggle switch (not needed for Utter)

---

### 2. Device/Peer List with Search (Lines 547-706)

**Pattern: Search Bar + Scrollable List**

```kotlin
Column {
    // Search bar
    OutlinedTextField(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        singleLine = true,
        shape = MaterialTheme.shapes.extraLarge,
        leadingIcon = { Icon(Icons.Outlined.Search) },
        trailingIcon = {
            if (isSearchFocused) {
                IconButton { Icon(Icons.Outlined.Clear) }
            }
        },
        placeholder = { Text("Search") },
        value = searchTerm,
        onValueChange = { onSearch(it) }
    )

    // Peer list
    LazyColumn {
        peerList.forEach { peerSet ->
            stickyHeader {
                Text(peerSet.user.DisplayName)  // Section header
            }

            items(peerSet.peers) { peer ->
                ListItem(
                    modifier = Modifier.combinedClickable(
                        onClick = { navigateToPeerDetails(peer) },
                        onLongClick = { showContextMenu(peer) }
                    ),
                    headlineContent = {
                        Row {
                            StatusDot(peer.isOnline)
                            Spacer(8.dp)
                            Text(peer.displayName)
                        }
                    },
                    supportingContent = { Text(peer.ipAddress) }
                )
            }
        }
    }
}
```

**Utter Application:**
```typescript
// DeviceListScreen
<View style={container}>
  {/* Search bar */}
  <TextInput
    style={searchBar}
    placeholder="Search devices..."
    value={searchTerm}
    onChangeText={setSearchTerm}
  />

  {/* Device list */}
  <FlatList
    data={filteredDevices}
    renderItem={({ item }) => (
      <TouchableOpacity
        onPress={() => navigation.navigate('TextInput', { device: item })}
      >
        <View style={deviceRow}>
          <StatusDot isOnline={item.status === 'online'} />
          <View>
            <Text style={deviceName}>{item.deviceName}</Text>
            <Text style={deviceIP}>{item.ipAddress}</Text>
          </View>
        </View>
      </TouchableOpacity>
    )}
    keyExtractor={(item) => item.deviceId}
  />
</View>
```

**Key Takeaways:**
- ✅ Search bar with rounded corners (Material extraLarge shape)
- ✅ Clear icon appears when focused
- ✅ Status dot (colored circle) next to each device
- ✅ Device name + IP address in two lines
- ✅ Tap to navigate to detail/action screen
- ❌ Skip: Long-press context menu (nice-to-have, not essential)

---

### 3. Status Dot Component

**Pattern: Circular Status Indicator**

```kotlin
Box(
    modifier = Modifier
        .size(10.dp)
        .background(
            color = when(peer.status) {
                "online" -> Color.Green
                "offline" -> Color.Gray
            },
            shape = RoundedCornerShape(percent = 50)  // Perfect circle
        )
)
```

**Utter Application:**
```typescript
// StatusDot.tsx
export function StatusDot({ isOnline }: { isOnline: boolean }) {
  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,  // Half of width/height = circle
        backgroundColor: isOnline ? '#4CAF50' : '#9E9E9E',
      }}
    />
  );
}
```

**Usage:**
- Green (#4CAF50) = Online/connected
- Gray (#9E9E9E) = Offline/disconnected

---

### 4. Avatar Component (Lines 40-103)

**Pattern: Circular Profile Picture with Fallback**

```kotlin
Avatar(
    profile = user,
    size = 36,
    action = { navigateToSettings() },
    isFocusable = true
)

// Implementation:
Box(contentAlignment = Alignment.Center) {
    // Fallback icon
    if (!isIconLoaded) {
        Icon(Icons.Default.Person)
    }

    // Profile picture overlay
    AsyncImage(
        model = profilePicURL,
        modifier = Modifier.size(36.dp).clip(CircleShape),
        onState = { state ->
            if (state is Success) {
                isIconLoaded = true
            }
        }
    )
}
```

**Utter Application:**
```typescript
// Avatar.tsx
export function Avatar({
  user,
  size = 36,
  onPress
}: AvatarProps) {
  return (
    <TouchableOpacity onPress={onPress}>
      <Image
        source={{ uri: user.profilePicture }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
        }}
        defaultSource={require('./assets/default-avatar.png')}
      />
    </TouchableOpacity>
  );
}
```

---

### 5. Material Design 3 Styling

**Colors & Spacing from Tailscale:**

```kotlin
// Spacing
.padding(16.dp)         // Standard padding
.padding(8.dp)          // Small padding
.size(10.dp)            // Status dot
.size(36.dp)            // Avatar

// Shapes
RoundedCornerShape(10.dp)     // Cards, containers
RoundedCornerShape(percent=50) // Circles (status dots, avatars)
MaterialTheme.shapes.extraLarge // Search bar

// Colors
MaterialTheme.colorScheme.primary
MaterialTheme.colorScheme.surface
MaterialTheme.colorScheme.onSurface
MaterialTheme.colorScheme.onSurfaceVariant
```

**Utter Equivalent (React Native):**
```typescript
const theme = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    full: 9999,  // Circle
  },
  colors: {
    primary: '#6750A4',      // Material Purple
    surface: '#FFFFFF',
    onSurface: '#1C1B1F',
    onSurfaceVariant: '#49454F',
    statusOnline: '#4CAF50',
    statusOffline: '#9E9E9E',
  },
};
```

---

## Utter-Specific Screen Designs (Corrected)

### Screen 1: SignInScreen (Google OAuth)

```
┌─────────────────────────┐
│                         │
│      Utter Logo         │
│                         │
│  "Welcome to Utter"     │
│  "Dictate to Linux"     │
│                         │
│  [Sign in with Google]  │
│                         │
└─────────────────────────┘
```

**Pattern:** Simple, centered (like Tailscale's IntroView)
- Logo + welcome text + single button
- Auto-skip if already authenticated

---

### Screen 2: DeviceListScreen (Main Screen)

```
┌─────────────────────────────────────┐
│ ● Connected       👤 [Avatar]       │ ← Header
├─────────────────────────────────────┤
│ 🔍 Search devices...                │ ← Search bar
├─────────────────────────────────────┤
│ Linux Targets                       │ ← Section header
├─────────────────────────────────────┤
│ ● Work Laptop                       │ ← Tap to open
│   192.168.1.100                     │
├─────────────────────────────────────┤
│ ● Home Desktop                      │
│   192.168.1.101                     │
├─────────────────────────────────────┤
│ ○ Server (offline)                  │
│   192.168.1.102                     │
└─────────────────────────────────────┘
```

**Interactions:**
- **Tap device** → Navigate to TextInputScreen
- **Tap avatar** → Navigate to Settings
- **Type in search** → Filter devices in real-time

**Key Elements:**
- Connection status (● + "Connected")
- Search bar (Material rounded style)
- Status dots (green = online, gray = offline)
- Device name + IP address

---

### Screen 3: TextInputScreen (CORRECTED)

**Important:** This app does **NOT** implement voice recognition. It simply uses the **Google Keyboard's built-in voice input** feature.

```
┌─────────────────────────────────────┐
│ ← Back     Work Laptop              │ ← Top bar
├─────────────────────────────────────┤
│                                     │
│                                     │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ Hello, this is a test        │  │ ← TextInput
│  │                              │  │   (auto-focused)
│  │                              │  │
│  └──────────────────────────────┘  │
│                                     │
│      Sending in 2s ▓▓▓▓░░░░        │ ← Countdown bar
│      Tap to cancel                 │
│                                     │
└─────────────────────────────────────┘
         ↑
    Keyboard opens here
    (Google Keyboard with mic button)
```

**How It Works:**

1. **Screen Opens:**
   - `TextInput` auto-focuses
   - Keyboard automatically appears (Android/iOS system keyboard)
   - User sees Google Keyboard with built-in microphone button

2. **User Input:**
   - **Option A:** User taps mic button on Google Keyboard → speaks → text appears
   - **Option B:** User types directly on keyboard

3. **Auto-Send Logic:**
   - When user stops typing/speaking (detected via `onChangeText`)
   - Start 2-second countdown
   - Progress bar depletes: `▓▓▓▓▓░░░` → `▓▓▓░░░░░` → `░░░░░░░░` → SEND
   - Tap anywhere to cancel countdown
   - If user types more, countdown resets

4. **Message Sent:**
   - Text encrypted with target device's public key
   - Sent via WebSocket to relay server
   - TextInput clears
   - Brief confirmation: "✓ Sent"

**Implementation:**
```typescript
// TextInputScreen.tsx
export default function TextInputScreen({ route, navigation }) {
  const { device } = route.params;
  const [text, setText] = useState('');
  const [countdown, setCountdown] = useState(0);
  const textInputRef = useRef<TextInput>(null);

  // Auto-focus keyboard on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      textInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Auto-send countdown
  useEffect(() => {
    if (text.trim() === '') {
      setCountdown(0);
      return;
    }

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / 2000, 1); // 2 seconds
      setCountdown(progress);

      if (progress >= 1) {
        clearInterval(interval);
        sendMessage();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [text]);

  const sendMessage = async () => {
    if (!text.trim()) return;

    const encrypted = await encryptMessage(text, device.publicKey);
    await sendToRelay(encrypted, device.deviceId);

    setText('');
    setCountdown(0);

    // Show confirmation
    showToast('✓ Sent');
  };

  const cancelSend = () => {
    setText('');
    setCountdown(0);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.deviceName}>{device.deviceName}</Text>
      </View>

      {/* Main text input area */}
      <TextInput
        ref={textInputRef}
        style={styles.textInput}
        placeholder="Start typing or tap mic on keyboard..."
        value={text}
        onChangeText={setText}
        multiline
        autoFocus={true}  // ← Key: auto-focus
        keyboardType="default"
        returnKeyType="default"
      />

      {/* Countdown bar */}
      {countdown > 0 && (
        <TouchableOpacity onPress={cancelSend}>
          <View style={styles.countdownContainer}>
            <Text style={styles.countdownText}>
              Sending in {Math.ceil((1 - countdown) * 2)}s
            </Text>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${(1 - countdown) * 100}%` }
                ]}
              />
            </View>
            <Text style={styles.cancelHint}>Tap to cancel</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

**Key Points:**
- ❌ **NO** microphone button in the app
- ✅ **YES** to Google Keyboard's mic button (built-in)
- ✅ Auto-focus `TextInput` on screen mount
- ✅ Keyboard opens automatically
- ✅ User can type OR use keyboard mic
- ✅ 2-second countdown after typing stops
- ✅ Tap to cancel countdown

---

## Comparison: Tailscale vs Utter

| Feature | Tailscale | Utter |
|---------|-----------|-------|
| **Main Toggle** | VPN on/off switch | ❌ Not needed |
| **Peer List** | Nodes in tailnet | ✅ Linux target devices |
| **Peer Details** | Full info screen | ✅ Simplified (just tap to send) |
| **Search** | Full-screen SearchView | ✅ Inline search bar |
| **Status Indicator** | VPN connection state | ✅ WebSocket connection state |
| **Avatar** | Profile pic → Settings | ✅ Same pattern |
| **Exit Nodes** | Complex picker | ❌ Not applicable |
| **Voice Input** | N/A | ✅ Google Keyboard's mic (not in app) |
| **Auto-Send** | N/A | ✅ 2-second countdown |

---

## Design System Summary

### Spacing
- `4dp` / `8dp` - Small gaps
- `16dp` - Standard padding
- `24dp` / `32dp` - Large spacing

### Border Radius
- `8dp` - Small rounded corners
- `12dp` - Medium rounded corners
- `50%` - Circles (status dots, avatars)
- `extraLarge` - Search bars (~28dp)

### Colors (Material Design 3)
- **Primary:** `#6750A4` (Purple)
- **Surface:** `#FFFFFF` (White)
- **OnSurface:** `#1C1B1F` (Dark gray)
- **OnSurfaceVariant:** `#49454F` (Medium gray)
- **Status Online:** `#4CAF50` (Green)
- **Status Offline:** `#9E9E9E` (Gray)

### Typography
- **titleMedium:** 16sp, Medium weight
- **bodyMedium:** 14sp, Regular weight
- **bodySmall:** 12sp, Regular weight
- **labelSmall:** 11sp, Medium weight

---

## Key Learnings Applied to Expo Implementation

### ✅ Patterns to Adopt

1. **Clean header with status + avatar** (MainView pattern)
2. **Search bar with rounded corners** (Material extraLarge shape)
3. **Status dots** (10dp circles, green/gray)
4. **Device list with tap-to-navigate** (LazyColumn → FlatList)
5. **Material Design 3 theming** (colors, spacing, typography)
6. **Animated transitions** (slide + fade)
7. **Auto-focus text input** (keyboard opens automatically)

### ❌ Patterns to Skip

1. **VPN toggle switch** (not relevant)
2. **Exit node picker** (not relevant)
3. **Full-screen search** (inline is simpler for Utter)
4. **Long-press context menu** (nice-to-have, not essential)
5. **Microphone button in app** (using Google Keyboard's mic instead)

### 🆕 Utter-Specific Additions

1. **Auto-send countdown** (2-second timer with visual progress)
2. **Tap to cancel** countdown
3. **Minimal text input** (clean, auto-focused)
4. **Keyboard auto-open** (when navigating to TextInputScreen)

---

## Updated Phase 5: Text Input Integration (Not Voice)

**Correction:** Phase 5 is **not** about voice input libraries. It's about:
1. Auto-focusing text input
2. Keyboard management
3. Auto-send countdown logic

### Goals (Revised)
- Auto-focus `TextInput` when screen opens
- Keyboard opens automatically
- Implement 2-second auto-send countdown
- Allow user to type or use Google Keyboard's mic
- Send encrypted messages to target device

### Dependencies (Revised)
```bash
# No voice libraries needed!
# Just standard React Native components:
# - TextInput (built-in)
# - Keyboard API (built-in)
```

### Implementation (Revised)

See corrected `TextInputScreen.tsx` example above.

**Success Criteria (Revised):**
- ✅ Keyboard opens automatically when screen opens
- ✅ User can type OR use keyboard mic button
- ✅ Text appears in input field
- ✅ Auto-send triggers after 2 seconds of no typing
- ✅ Countdown bar animates (depletes over 2 seconds)
- ✅ Tap to cancel countdown works
- ✅ Messages encrypted before sending
- ✅ Messages delivered to target device

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

### Expo & React Native
- [Expo Documentation](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [expo-auth-session](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [expo-crypto](https://docs.expo.dev/versions/latest/sdk/crypto/)
- [expo-secure-store](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)

### UI/UX Reference
- [Tailscale Android App (GitHub)](https://github.com/tailscale/tailscale-android) - UI/UX patterns, Material Design 3 implementation
- [Tailscale Android Blog Post](https://tailscale.com/blog/android) - May 2024 redesign announcement
- [Material Design 3](https://m3.material.io/) - Design system reference

---

**Document Version:** 1.3
**Last Updated:** 2025-10-19
**Status:** ⚠️ Reordering in progress - Use Implementation Order Guide

**Changelog:**
- v1.3 (2025-10-19): **TOOLCHAIN** - Added mise and pnpm throughout document
- v1.3 (2025-10-19): All `npm install` → `pnpm add`, `npm test` → `pnpm test`
- v1.3 (2025-10-19): Added Development Environment section with mise setup
- v1.3 (2025-10-19): Added Phase 1.0: Setup Toolchain with mise
- v1.3 (2025-10-19): Added `.mise.toml` configuration examples
- v1.2 (2025-10-19): **RESTRUCTURING** - Added Phase 0 (Crypto Spike), reordered phases to fix dependencies
- v1.2 (2025-10-19): Added Implementation Order Guide (see top of Implementation Phases section)
- v1.2 (2025-10-19): Updated Phase Overview table with correct order and risk levels
- v1.1 (2025-10-19): Added UI/UX analysis from Tailscale Android app (tailscale-android/)
- v1.1 (2025-10-19): Corrected Phase 5 - Text Input (NOT voice recognition in app)
- v1.1 (2025-10-19): Clarified that app uses Google Keyboard's mic button, not custom voice input
- v1.0 (2025-10-19): Initial document with 7-phase implementation plan

**Known Issues in v1.3:**
- ⚠️ Phase headings updated but some content hasn't moved yet
- ⚠️ Use "Implementation Order Guide" table to find correct content for each phase
- ⚠️ Phase 2 heading says "Auth" but content below is WebSocket (use "Phase 3" section for Auth content)
- ⚠️ Phase 3 heading says "WebSocket" but content below is Auth (use "Phase 2" section for WebSocket content)
- 📝 Phase 4 (Device List UI) needs to be extracted from Phase 6 content
