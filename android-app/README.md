# Utter Android App

Simple Android app for voice dictation that sends text to Linux via relay server.

## Project Structure

This is a complete, buildable Android project with the following structure:

```
android-app/
├── app/
│   ├── src/main/
│   │   ├── java/com/utter/android/
│   │   │   ├── MainActivity.kt           # Main UI and logic
│   │   │   └── WebSocketClient.kt        # WebSocket connection handler
│   │   ├── res/
│   │   │   ├── layout/
│   │   │   │   └── activity_main.xml     # UI layout
│   │   │   └── values/
│   │   │       ├── strings.xml           # String resources
│   │   │       └── colors.xml            # Color definitions
│   │   └── AndroidManifest.xml           # App manifest with permissions
│   ├── build.gradle.kts                  # App-level build config
│   └── proguard-rules.pro                # ProGuard rules
├── gradle/wrapper/                       # Gradle wrapper files
├── build.gradle.kts                      # Root build config
├── settings.gradle.kts                   # Project settings
├── gradle.properties                     # Gradle properties
├── gradlew                               # Gradle wrapper script (Unix)
├── gradlew.bat                           # Gradle wrapper script (Windows)
├── .mise.toml                            # Java 17 configuration
├── build.sh                              # Build helper script
└── README.md                             # This file
```

## Features

- Voice input using Google Keyboard speech-to-text
- WebSocket connection to relay server
- Auto-send on timeout or manual send
- Connection status indicator

## Setup in Android Studio

### 1. Create New Project

1. Open Android Studio
2. File → New → New Project
3. Select "Empty Activity"
4. Name: `UtterAndroid`
5. Package name: `com.utter.android`
6. Language: Kotlin
7. Minimum SDK: API 24 (Android 7.0)
8. Click Finish

### 2. Add Dependencies

Add to `app/build.gradle.kts`:

```kotlin
dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")

    // WebSocket
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")

    // JSON
    implementation("org.json:json:20231013")
}
```

### 3. Add Permissions

Add to `AndroidManifest.xml` (inside `<manifest>` tag, before `<application>`):

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

### 4. Copy Source Files

Copy the following files from this directory to your Android Studio project:

- `MainActivity.kt` → `app/src/main/java/com/utter/android/MainActivity.kt`
- `WebSocketClient.kt` → `app/src/main/java/com/utter/android/WebSocketClient.kt`
- `activity_main.xml` → `app/src/main/res/layout/activity_main.xml`

### 5. Build and Run

1. Connect Android device or start emulator
2. Click "Run" (green play button)
3. App should install and launch

## Usage

1. Enter relay server URL (e.g., `ws://192.168.1.100:8080` for local network)
2. Click "Connect"
3. Wait for "Connected" status
4. Tap the text input field
5. Use voice input from keyboard
6. Text will auto-send after 2 seconds, or click "Send" button

## Configuration

Edit in `MainActivity.kt`:

```kotlin
private val AUTO_SEND_DELAY = 2000L  // Auto-send after 2 seconds
```

## Phase 1 Testing (Same Network)

1. Start relay server on your computer:
   ```bash
   cd relay-server
   npm run dev
   ```

2. Start Linux client:
   ```bash
   cd linux-client
   python utter_client.py
   ```

3. Find your computer's local IP:
   ```bash
   ip addr show | grep inet
   ```

4. In Android app, enter server URL: `ws://YOUR_IP:8080`

5. Connect and test voice input

## Troubleshooting

### Connection failed

- Check that relay server is running
- Verify IP address is correct
- Make sure Android and computer are on same WiFi network
- Check firewall settings on computer

### Voice input not working

- Grant microphone permission when prompted
- Make sure Google Voice Typing is enabled in keyboard settings
- Try using Gboard (Google Keyboard)

### Text not sending

- Check connection status shows "Connected"
- Look at relay server logs for errors
- Verify WebSocket URL format: `ws://host:port` (not `http://`)

## Production Deployment

For Phase 2+ with cloud relay server:

1. Deploy relay server to Railway/Render/Fly.io
2. Get the public URL (e.g., `wss://utter-relay.railway.app`)
3. Update server URL in Android app to use `wss://` instead of `ws://`
4. Rebuild and deploy

## Building APK

**Important:** This project requires Java 17 (not Java 25). The build is configured to use mise for Java version management.

### Using the build script (recommended):

```bash
./build.sh
```

### Manual build:

Debug APK:
```bash
mise exec -- ./gradlew assembleDebug
```

Release APK (requires signing):
```bash
mise exec -- ./gradlew assembleRelease
```

APK location: `app/build/outputs/apk/debug/app-debug.apk`

### Installing on Device

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

Or use Android Studio: File → Open → Select android-app folder
