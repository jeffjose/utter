# Deployment Guide

## Prerequisites

### 1. EAS CLI

```bash
pnpm add -g eas-cli
eas login
```

### 2. Configure EAS Project

```bash
cd mobile-app
eas init
```

This creates an EAS project ID and updates `app.json`.

---

## Development Builds

Development builds include native code and can run the full app (unlike Expo Go).

### Android Development Build

```bash
# Build APK for local testing
eas build --profile development --platform android

# Or build locally (faster, requires Android Studio)
npx expo run:android
```

### iOS Development Build

```bash
# Build for iOS simulator
eas build --profile development --platform ios

# Or build locally (requires macOS + Xcode)
npx expo run:ios
```

---

## Production Builds

### Android Production

#### Option 1: APK (Sideload/Testing)

```bash
eas build --profile preview --platform android
```

Downloads APK file you can install directly.

#### Option 2: AAB (Google Play Store)

```bash
eas build --profile production --platform android
```

Creates Android App Bundle for Google Play submission.

### iOS Production

```bash
# Build for TestFlight/App Store
eas build --profile production --platform ios
```

Requires:
- Apple Developer account ($99/year)
- iOS distribution certificate
- App Store provisioning profile

---

## EAS Build Configuration

Create `eas.json`:

```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "simulator": false
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json"
      },
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "your-app-store-connect-app-id",
        "appleTeamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

---

## Configuration for Production

### 1. Update Google OAuth

In `src/utils/constants.ts`:

```typescript
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'production-client-id-here';
```

Add to `app.json`:

```json
{
  "expo": {
    "extra": {
      "googleClientId": "your-production-client-id"
    }
  }
}
```

Access in code:

```typescript
import Constants from 'expo-constants';
const GOOGLE_CLIENT_ID = Constants.expoConfig?.extra?.googleClientId;
```

### 2. Set Default Server URL

Update `src/utils/constants.ts`:

```typescript
export const DEFAULT_WEBSOCKET_URL = 'wss://relay.yourdomain.com';
```

Use `wss://` (secure WebSocket) for production.

### 3. Update App Icons

Replace placeholder icons in `assets/`:
- `icon.png` - 1024x1024 app icon
- `adaptive-icon.png` - 1024x1024 Android adaptive icon
- `splash-icon.png` - Splash screen image

### 4. App Store Metadata

**iOS (App Store Connect):**
- Screenshots (required sizes)
- Description
- Keywords
- Privacy policy URL
- Support URL

**Android (Google Play Console):**
- Feature graphic (1024x500)
- Screenshots
- Description
- Privacy policy

---

## Code Signing

### Android

EAS handles code signing automatically. For manual signing:

1. Generate keystore:
```bash
keytool -genkeypair -v -keystore utter-release.keystore -alias utter -keyalg RSA -keysize 2048 -validity 10000
```

2. Add to `eas.json`:
```json
{
  "build": {
    "production": {
      "android": {
        "keystorePath": "./utter-release.keystore",
        "keystoreAlias": "utter"
      }
    }
  }
}
```

### iOS

EAS handles provisioning profiles. Or manually:

1. Create App ID in Apple Developer Portal
2. Create Distribution Certificate
3. Create App Store Provisioning Profile
4. Configure in EAS

---

## Submitting to Stores

### Google Play Store

```bash
# Build
eas build --profile production --platform android

# Submit
eas submit --platform android
```

**Manual submission:**
1. Build AAB: `eas build --profile production --platform android`
2. Download AAB from EAS build page
3. Upload to Google Play Console
4. Fill out store listing
5. Submit for review

### Apple App Store

```bash
# Build
eas build --profile production --platform ios

# Submit to TestFlight
eas submit --platform ios
```

**Manual submission:**
1. Build IPA: `eas build --profile production --platform ios`
2. Download IPA from EAS build page
3. Upload to App Store Connect via Transporter
4. Fill out App Store listing
5. Submit for review

---

## Over-The-Air (OTA) Updates

Update JavaScript/React Native code without app store:

### 1. Set up EAS Update

```bash
eas update:configure
```

### 2. Publish Update

```bash
# Publish to production
eas update --branch production --message "Bug fixes"

# Publish to preview
eas update --branch preview --message "New features"
```

### 3. Users Get Updates

Updates download automatically on app restart.

**Limitations:**
- Cannot update native code (Java/Kotlin/Swift/Objective-C)
- Cannot update native modules
- For crypto changes, must publish new app version

---

## Environment Variables

### Development

Create `.env`:
```
GOOGLE_CLIENT_ID=dev-client-id
RELAY_SERVER_URL=ws://localhost:8080
```

### Production

Use EAS Secrets:

```bash
eas secret:create --scope project --name GOOGLE_CLIENT_ID --value "prod-client-id"
eas secret:create --scope project --name RELAY_SERVER_URL --value "wss://relay.yourdomain.com"
```

Access in `app.config.js`:

```javascript
export default {
  expo: {
    extra: {
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      relayServerUrl: process.env.RELAY_SERVER_URL,
    },
  },
};
```

---

## Build Optimization

### 1. Minimize Bundle Size

In `app.json`:

```json
{
  "expo": {
    "web": {
      "bundler": "metro"
    },
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "usesCleartextTraffic": false,
            "enableProguard": true,
            "enableShrinkResources": true
          }
        }
      ]
    ]
  }
}
```

### 2. Enable Hermes (Android)

Hermes JavaScript engine improves performance:

```json
{
  "expo": {
    "jsEngine": "hermes"
  }
}
```

Already enabled by default in Expo SDK 50+.

---

## Monitoring & Analytics

### Sentry Error Tracking

```bash
pnpm add sentry-expo
```

Configure:

```typescript
import * as Sentry from 'sentry-expo';

Sentry.init({
  dsn: 'your-sentry-dsn',
  enableInExpoDevelopment: false,
  debug: false,
});
```

### Analytics

Add Expo Analytics or Firebase:

```bash
npx expo install expo-firebase-analytics
```

---

## Release Checklist

### Pre-Release

- [ ] All tests passing (see TESTING.md)
- [ ] OAuth credentials configured for production
- [ ] Server URL points to production relay server
- [ ] App icons updated
- [ ] Version number bumped in `app.json`
- [ ] Privacy policy created
- [ ] Support email configured

### Android

- [ ] Build production AAB
- [ ] Test on physical devices (multiple models)
- [ ] Screenshots captured
- [ ] Store listing completed
- [ ] Privacy policy uploaded
- [ ] Release notes written

### iOS

- [ ] Build production IPA
- [ ] Test on physical devices
- [ ] Screenshots captured (all required sizes)
- [ ] Store listing completed
- [ ] Privacy policy uploaded
- [ ] App Review information provided
- [ ] Export compliance declared

### Post-Release

- [ ] Monitor crash reports (Sentry)
- [ ] Monitor user reviews
- [ ] Track adoption metrics
- [ ] Plan OTA updates if needed

---

## Versioning

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes (e.g., crypto algorithm change)
- **MINOR:** New features (e.g., new screen, feature)
- **PATCH:** Bug fixes

Update in `app.json`:

```json
{
  "expo": {
    "version": "1.0.0",
    "android": {
      "versionCode": 1
    },
    "ios": {
      "buildNumber": "1"
    }
  }
}
```

**Android versionCode** and **iOS buildNumber** must increment with each build.

---

## Support

For deployment issues:

- **EAS Build:** https://docs.expo.dev/build/introduction/
- **App Store:** https://developer.apple.com/app-store/review/
- **Google Play:** https://support.google.com/googleplay/android-developer/

---

## Quick Commands Reference

```bash
# Development builds
npx expo run:android              # Local Android build
npx expo run:ios                  # Local iOS build

# Production builds
eas build -p android --profile production
eas build -p ios --profile production

# Submit to stores
eas submit -p android
eas submit -p ios

# OTA updates
eas update --branch production --message "Update"

# Check build status
eas build:list
```
