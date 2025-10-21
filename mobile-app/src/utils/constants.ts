import {
  GOOGLE_CLIENT_ID as ENV_GOOGLE_CLIENT_ID,
  SERVER_URL as ENV_SERVER_URL,
  MAX_MESSAGE_LENGTH as ENV_MAX_MESSAGE_LENGTH,
} from '@env';

// App configuration
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Utter';

// Google OAuth configuration
// Use WEB client ID for requestIdToken (same as android-app/GoogleAuthManager.kt)
// Android credentials (package + SHA-1) are verified automatically by Google Play Services
export const GOOGLE_CLIENT_ID = ENV_GOOGLE_CLIENT_ID;

// WebSocket configuration
export const DEFAULT_WEBSOCKET_URL = ENV_SERVER_URL || 'ws://192.168.3.189:8080';
export const RECONNECT_DELAY_MS = 3000;

// Auto-send configuration
export const AUTO_SEND_DELAY_MS = 2000;

// Message length limit
export const MAX_MESSAGE_LENGTH = parseInt(ENV_MAX_MESSAGE_LENGTH || '5000', 10);

// Crypto configuration (matches utterd)
export const HKDF_SALT = 'utter-relay-e2e-2024';
export const HKDF_INFO = 'message-encryption-v1';
