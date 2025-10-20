/**
 * WebSocket Client
 * Manages connection to relay server
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { authManager } from './AuthManager';
import { keyManager } from './crypto/KeyManager';
import { RECONNECT_DELAY_MS, APP_VERSION } from '../utils/constants';
import type { Message, RegisterMessage } from '../types/messages';

export type MessageHandler = (message: Message) => void;
export type ConnectionHandler = (connected: boolean) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isIntentionalDisconnect = false;
  private serverUrl: string;
  private onMessage: MessageHandler;
  private onConnectionChange: ConnectionHandler;

  constructor(
    serverUrl: string,
    onMessage: MessageHandler,
    onConnectionChange: ConnectionHandler
  ) {
    this.serverUrl = serverUrl;
    this.onMessage = onMessage;
    this.onConnectionChange = onConnectionChange;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    this.isIntentionalDisconnect = false;
    this.ws = new WebSocket(this.serverUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.onConnectionChange(true);
      this.register();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as Message;
        this.onMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.onConnectionChange(false);

      if (!this.isIntentionalDisconnect) {
        this.scheduleReconnect();
      }
    };
  }

  /**
   * Send message to server
   */
  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message');
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.isIntentionalDisconnect = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Register with relay server
   */
  private async register(): Promise<void> {
    try {
      const idToken = await authManager.getIdToken();
      const publicKey = await keyManager.getPublicKey();

      if (!idToken) {
        console.error('No ID token available for registration');
        return;
      }

      const deviceId = Platform.OS === 'android'
        ? Application.getAndroidId() || 'unknown'
        : await Application.getIosIdForVendorAsync() || 'unknown';

      const deviceName = `${Device.manufacturer || 'Unknown'} ${Device.modelName || 'Device'}`;

      const registerMsg: RegisterMessage = {
        type: 'register',
        token: idToken,
        clientType: Platform.OS === 'ios' ? 'ios' : 'android',
        deviceId,
        deviceName,
        publicKey,
        version: APP_VERSION,
        platform: Platform.OS,
        arch: 'arm64',
      };

      this.send(registerMsg);
      console.log('Registration message sent');
    } catch (error) {
      console.error('Registration failed:', error);
    }
  }
}
