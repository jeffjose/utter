# Testing Guide

## Prerequisites

### 1. Development Build Required

**Important:** This app requires a development build, NOT Expo Go.

```bash
# Android
npx expo run:android

# iOS (requires macOS)
npx expo run:ios
```

**Why?** The app uses `react-native-quick-crypto` for AES-256-GCM encryption, which requires native modules.

### 2. Running Relay Server

```bash
cd relay-server
pnpm dev
```

The relay server should be running and accessible from your mobile device.

### 3. Google OAuth Configuration

Update `src/utils/constants.ts` with your Google Client ID:

```typescript
export const GOOGLE_CLIENT_ID = 'your-client-id-here.apps.googleusercontent.com';
```

---

## Test Plan

### Phase 1: Authentication Flow

**Test Steps:**
1. Launch app
2. Should show "Welcome to Utter" sign-in screen
3. Tap "Sign in with Google"
4. Complete OAuth flow in browser
5. Should redirect back to app
6. Should navigate to Server Connection screen

**Expected:**
- ✅ OAuth flow completes successfully
- ✅ Token stored in secure storage
- ✅ Auto-navigates to ServerConnection screen

**Test Auto-Skip:**
1. Close app
2. Reopen app
3. Should skip sign-in and go directly to ServerConnection

---

### Phase 2: Server Connection

**Test Steps:**
1. Ensure relay server is running
2. Get relay server IP address (e.g., `192.168.1.100`)
3. Enter WebSocket URL: `ws://192.168.1.100:8080`
4. Tap "Connect"
5. Should connect and navigate to Device List

**Expected:**
- ✅ WebSocket connects successfully
- ✅ Registration message sent to server
- ✅ Auto-navigates to Device List screen

**Check Relay Server Logs:**
```
WebSocket connected from: <IP>
Registered device: <device_id>
User ID: <google_user_id>
Public key: <base64_key>
```

---

### Phase 3: Device List

**Prerequisites:** Have another client connected (utterd or another mobile device)

**Test Steps:**
1. Should see device list screen
2. Wait for devices to appear
3. Should see other connected devices

**Expected:**
- ✅ Device list appears within 2 seconds
- ✅ Shows device name and type
- ✅ Shows online status (green dot)
- ✅ Can tap device to proceed

**If no devices appear:**
- Check relay server logs
- Ensure other client is connected
- Check WebSocket connection status

---

### Phase 4: Text Input (Plain Text)

**Test Steps:**
1. Tap a device from the list
2. Should navigate to Text Input screen
3. Keyboard should auto-open
4. Type some text (e.g., "hello world")
5. Wait 2 seconds
6. Message should auto-send

**Expected:**
- ✅ Text input has focus
- ✅ Countdown starts after typing
- ✅ Progress bar depletes over 2 seconds
- ✅ Message sent automatically
- ✅ Text input clears after send

**Test Cancellation:**
1. Type text
2. Tap "Tap to cancel" before countdown completes
3. Text should clear
4. Countdown should reset

---

### Phase 5: Encryption

**Test Steps:**
1. Send encrypted message from mobile app
2. Check utterd logs to verify decryption

**On Mobile:**
1. Type: "Test encrypted message"
2. Wait for auto-send (2 seconds)

**On Utterd Device:**
1. Watch for message to be typed
2. Should see: "Test encrypted message"

**Expected:**
- ✅ Message encrypted on mobile
- ✅ Utterd decrypts successfully
- ✅ Typed text matches sent text
- ✅ No errors in logs

**Check Mobile Logs:**
```
🔑 Generating X25519 keypair...
✅ Keypair generated
🔄 Performing ECDH...
✅ ECDH complete
🔐 Deriving AES key with HKDF-SHA256...
✅ AES key derived (32 bytes)
🔒 Encrypting message with AES-256-GCM...
✅ Encrypted successfully
```

**Check Utterd Logs:**
```
Received encrypted message
Decrypting...
✅ Decrypted: Test encrypted message
Typing: Test encrypted message
```

---

### Phase 6: Voice Input

**Test Steps:**
1. Open Text Input screen
2. Tap keyboard microphone icon (Google Keyboard on Android, iOS keyboard on iOS)
3. Speak: "This is a voice test"
4. Voice should be transcribed to text
5. Wait 2 seconds
6. Should auto-send

**Expected:**
- ✅ Voice transcription works
- ✅ Text appears in input
- ✅ Auto-send countdown starts
- ✅ Message sent successfully

**Note:** Voice input uses the system keyboard's built-in feature, not a custom implementation.

---

### Phase 7: Reconnection

**Test Steps:**
1. Connect to relay server
2. Kill relay server (Ctrl+C)
3. Mobile app should detect disconnect
4. Restart relay server
5. Mobile app should auto-reconnect

**Expected:**
- ✅ Disconnect detected
- ✅ Auto-reconnect attempts every 3 seconds
- ✅ Reconnects successfully
- ✅ Re-registers with server

---

### Phase 8: Multi-Device

**Test Multiple Devices:**
1. Connect Mobile Device A
2. Connect Mobile Device B
3. Send message from A to B
4. Send message from B to A

**Expected:**
- ✅ Both devices appear in each other's device list
- ✅ Messages delivered correctly
- ✅ Encryption works both ways

---

## Performance Tests

### Encryption Performance

**Test:**
1. Type a message
2. Check logs for encryption time
3. Should complete in <100ms

**Acceptable:**
- ✅ Encryption: <50ms
- ✅ Decryption: <50ms
- ✅ Total roundtrip: <100ms

### Connection Time

**Test:**
1. Tap "Connect" on Server Connection screen
2. Time until Device List appears
3. Should complete in <2 seconds (local network)

---

## Error Handling Tests

### Invalid Server URL

**Test:**
1. Enter invalid URL: `ws://invalid:9999`
2. Tap "Connect"
3. Should show connecting state
4. After timeout, should remain on connection screen

**Expected:**
- ✅ No crash
- ✅ Connection timeout handled gracefully
- ✅ Can retry with correct URL

### Network Disconnect

**Test:**
1. Connect successfully
2. Turn off Wi-Fi
3. Should detect disconnect
4. Turn on Wi-Fi
5. Should auto-reconnect

**Expected:**
- ✅ Disconnect detected
- ✅ Auto-reconnect when network available

### Invalid Recipient Public Key

**Test:**
1. Manually corrupt a device's public key in relay server
2. Try to send message
3. Should fail gracefully

**Expected:**
- ✅ No crash
- ✅ Error logged
- ✅ User notified (in production)

---

## Platform-Specific Tests

### Android

**Test:**
1. Google Keyboard voice input
2. Hardware back button navigation
3. App backgrounding/foregrounding
4. Permissions (Internet, Microphone)

**Expected:**
- ✅ All features work
- ✅ No crashes
- ✅ State preserved on background

### iOS

**Test:**
1. iOS keyboard voice input
2. Swipe back gesture
3. App backgrounding/foregrounding
4. Permissions (Microphone)

**Expected:**
- ✅ All features work
- ✅ No crashes
- ✅ State preserved on background

---

## Security Tests

### Key Persistence

**Test:**
1. Send message to device A
2. Close app
3. Reopen app
4. Send another message to device A
5. Both messages should use same public key

**Expected:**
- ✅ Keypair persists across app restarts
- ✅ Same public key used

### Token Security

**Test:**
1. Sign in
2. Check device storage
3. OAuth token should be in secure storage only

**Expected:**
- ✅ Token not visible in logs
- ✅ Token stored securely (Keychain/Keystore)

---

## Known Issues

### Development Build Only

**Issue:** App doesn't work in Expo Go
**Reason:** react-native-quick-crypto requires native modules
**Solution:** Use development build: `npx expo run:android`

### First-Time Build Time

**Issue:** First build takes 5-10 minutes
**Reason:** Gradle/Xcode building native modules
**Solution:** Subsequent builds are faster (incremental)

---

## Debugging

### Enable Verbose Logging

All crypto operations log to console. Check Metro bundler logs:

```
npx expo start
```

### Common Issues

**"crypto.createCipheriv is not a function"**
- Using Expo Go instead of development build
- Solution: `npx expo run:android`

**"Failed to connect to WebSocket"**
- Relay server not running
- Incorrect IP/URL
- Firewall blocking connection
- Solution: Check server, network, firewall

**"Google OAuth failed"**
- Invalid GOOGLE_CLIENT_ID
- OAuth redirect URI misconfigured
- Solution: Check Google Cloud Console settings

**"Device list empty"**
- No other devices connected
- WebSocket registration failed
- Solution: Check relay server logs, ensure registration successful

---

## Success Criteria

All phases must pass for release:

- [x] Phase 1: Authentication ✅
- [x] Phase 2: Server Connection ✅
- [x] Phase 3: Device List ✅
- [x] Phase 4: Text Input ✅
- [x] Phase 5: Encryption ✅
- [x] Phase 6: Voice Input ✅
- [x] Phase 7: Reconnection ✅
- [x] Phase 8: Multi-Device ✅

**All tests passing = Ready for production!**
