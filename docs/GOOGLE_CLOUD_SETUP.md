# Google Cloud OAuth Setup Guide

This guide explains how to set up Google OAuth for all Utter components.

## Overview

Utter uses Google OAuth for authentication across all components:
- **Relay Server**: Verifies ID tokens
- **utterd** (Linux daemon): Device authorization flow
- **linux-test-client**: Browser-based OAuth flow
- **Android app**: Google Play Services Sign-In

All devices under the same Google account can communicate with each other (Tailscale-style trusted pool).

## Prerequisites

- Google account
- Access to [Google Cloud Console](https://console.cloud.google.com)

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **"Select a project"** → **"New Project"**
3. Enter project name: `utter-relay` (or any name)
4. Click **"Create"**
5. Wait for project creation, then select it

---

## Step 2: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** user type (unless you have a Google Workspace)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: `Utter`
   - **User support email**: Your email
   - **Developer contact email**: Your email
5. Click **"Save and Continue"**
6. On **"Scopes"** page:
   - Click **"Add or Remove Scopes"**
   - Select:
     - `openid`
     - `email`
     - `profile`
   - Click **"Update"** → **"Save and Continue"**
7. On **"Test users"** page:
   - Click **"Add Users"**
   - Add your Google account email
   - Click **"Save and Continue"**
8. Review and click **"Back to Dashboard"**

---

## Step 3: Create OAuth Credentials

You need to create **2 different credentials** for the different client types.

### 3.1. Relay Server, utterd & linux-test-client (Web Application)

For the relay server (verification only), utterd, and linux-test-client (browser-based flow):

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Select **"Web application"**
4. Name: `Utter Web Client`
5. Add **Authorized redirect URIs**:
   - `http://localhost:3000/oauth/callback`
   - *(This is for utterd and linux-test-client local callback)*
6. Click **"Create"**
7. Copy **Client ID** and **Client Secret**

**Configure relay server:**
```bash
cd relay-server
cp .env.example .env
# Edit .env and add:
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

**Configure linux-test-client:**
```bash
cd linux-test-client
cp .env.example .env
# Edit .env and add:
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

**Configure utterd:**
```bash
cd utterd
# Run utterd with environment variables:
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=your-client-secret \
cargo run

# Or export in your shell profile:
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret
```

### 3.2. Android App

For Android app (Google Play Services):

1. Get your **SHA-1 fingerprint**:
   ```bash
   cd android-app
   # Debug key (for development):
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android

   # Copy the SHA1 fingerprint
   ```

2. In Google Cloud Console:
   - Go to **"APIs & Services"** → **"Credentials"**
   - Click **"Create Credentials"** → **"OAuth client ID"**
   - Select **"Android"**
   - Name: `Utter Android App`
   - Package name: `com.utter.android`
   - SHA-1 certificate fingerprint: *(paste the SHA-1 from step 1)*
   - Click **"Create"**

3. Copy the **Client ID**

4. Update the Android app:
   ```kotlin
   // In SignInActivity.kt and MainActivity.kt
   // Replace:
   private const val GOOGLE_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
   // With your actual Client ID
   ```

---

## Step 4: Testing

### Test Mode (Development)

For development without OAuth:
```bash
# Relay server - allow test mode
cd relay-server
# In .env:
ALLOW_TEST_MODE=true

# All clients will use userId = 'test-user'
```

### Production Mode (OAuth Required)

```bash
# Relay server - enforce OAuth
cd relay-server
# In .env:
ALLOW_TEST_MODE=false
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Test Each Component

**1. Start relay server:**
```bash
cd relay-server
pnpm start
```

**2. Test utterd:**
```bash
cd utterd
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com \
GOOGLE_CLIENT_SECRET=your-client-secret \
cargo run

# You should see:
# 📱 Sign in with Google:
#    Visit: https://accounts.google.com/o/oauth2/v2/auth?...
#
# Waiting for authorization...
#
# (Visit the URL in your browser, sign in, and utterd will continue)
```

**3. Test linux-test-client:**
```bash
cd linux-test-client
pnpm start

# Browser should open for Google Sign-In
```

**4. Test Android app:**
```bash
cd android-app
./build.sh
./install.sh

# Open app, tap "Sign in with Google"
```

---

## Security Notes

1. **ID Token Verification**: The relay server verifies ID tokens with Google's servers
2. **Token Storage**:
   - utterd: `~/.config/utterd/oauth.json` (0600 permissions)
   - linux-test-client: `~/.config/utter-client/oauth.json` (0600 permissions)
   - Android: SharedPreferences (app-private storage)
3. **Refresh Tokens**: Automatically refreshed before expiry
4. **E2E Encryption**: OAuth is for authentication only; messages are still encrypted end-to-end

---

## Troubleshooting

### "Access blocked: This app's request is invalid"

**Solution**: Ensure OAuth consent screen is configured and your email is added as a test user.

### "Error 400: redirect_uri_mismatch"

**Solution**: Verify redirect URI in Google Cloud Console matches:
- `http://localhost:3000/oauth/callback` for linux-test-client

### "Developer Error" on Android

**Solution**:
1. Verify SHA-1 fingerprint matches
2. Verify package name is `com.utter.android`
3. Verify Client ID is from the **Android** credential (not Web)

### Token expired errors

**Solution**: Tokens are automatically refreshed. If issues persist, sign out and sign in again:
- utterd: Delete `~/.config/utterd/oauth.json`
- linux-test-client: Delete `~/.config/utter-client/oauth.json`
- Android: Uninstall and reinstall app

---

## Production Deployment

When ready for production:

1. **Publish OAuth Consent Screen**:
   - Go to **"OAuth consent screen"**
   - Click **"Publish App"**
   - Google may require verification if requesting sensitive scopes

2. **Use Environment Variables**:
   ```bash
   # Relay server
   export GOOGLE_CLIENT_ID=...
   export ALLOW_TEST_MODE=false

   # utterd
   export GOOGLE_CLIENT_ID=...

   # linux-test-client
   export GOOGLE_CLIENT_ID=...
   export GOOGLE_CLIENT_SECRET=...
   ```

3. **Secure Credentials**:
   - Never commit `.env` files
   - Use secret management (e.g., AWS Secrets Manager, HashiCorp Vault)
   - Rotate credentials periodically

---

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Device Authorization Flow](https://developers.google.com/identity/protocols/oauth2/limited-input-device)
- [Google Sign-In for Android](https://developers.google.com/identity/sign-in/android)
