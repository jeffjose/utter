// App configuration
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'Utter';

// Google OAuth configuration
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID_HERE';

// WebSocket configuration
export const DEFAULT_WEBSOCKET_URL = 'ws://192.168.1.100:8080';
export const RECONNECT_DELAY_MS = 3000;

// Auto-send configuration
export const AUTO_SEND_DELAY_MS = 2000;

// Crypto configuration (matches utterd)
export const HKDF_SALT = 'utter-relay-e2e-2024';
export const HKDF_INFO = 'message-encryption-v1';
