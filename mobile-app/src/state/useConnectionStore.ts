/**
 * WebSocket Connection State Store
 */

import { create } from 'zustand';
import { WebSocketClient } from '../services/WebSocketClient';
import { JwtService } from '../services/JwtService';
import { authManager } from '../services/AuthManager';
import type { Device } from '../types/device';
import type { Message } from '../types/messages';

interface ConnectionState {
  isConnected: boolean;
  serverUrl: string;
  client: WebSocketClient | null;
  devices: Device[];
  setServerUrl: (url: string) => void;
  connect: () => void;
  disconnect: () => void;
  send: (message: any) => void;
  requestDeviceList: () => void;
  setDevices: (devices: Device[]) => void;
  handleMessage: (message: Message) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  isConnected: false,
  serverUrl: '',
  client: null,
  devices: [],

  setServerUrl: (url: string) => set({ serverUrl: url }),

  connect: async () => {
    const { serverUrl, disconnect } = get();

    try {
      // Disconnect existing connection
      disconnect();

      // Exchange Google ID token for relay server JWT
      const idToken = await authManager.getIdToken();
      if (!idToken) {
        console.error('No Google ID token available');
        throw new Error('Please sign in with Google first');
      }

      console.log('Exchanging Google ID token for relay server JWT...');
      const relayJwt = await JwtService.exchangeForJWT(serverUrl, idToken);
      await authManager.saveRelayJWT(relayJwt);
      console.log('Relay JWT obtained and saved');

      // Create WebSocket client
      const client = new WebSocketClient(
        serverUrl,
        (message) => get().handleMessage(message),
        (connected) => set({ isConnected: connected })
      );

      client.connect();
      set({ client });
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  },

  disconnect: () => {
    const { client } = get();
    if (client) {
      client.disconnect();
    }
    set({ client: null, isConnected: false });
  },

  send: (message: any) => {
    const { client } = get();
    if (client) {
      client.send(message);
    }
  },

  requestDeviceList: () => {
    const { client } = get();
    if (client) {
      client.requestDeviceList();
    }
  },

  setDevices: (devices: Device[]) => {
    console.log('setDevices called with', devices.length, 'devices');
    set({ devices });
  },

  handleMessage: (message: Message) => {
    console.log('handleMessage called with type:', message.type);
    console.log('handleMessage full message:', JSON.stringify(message, null, 2));

    // Handle device list
    if (message.type === 'devices' || message.type === 'device_list') {
      const deviceListMsg = message as any;
      console.log('Handling devices message, has devices?', !!deviceListMsg.devices);
      if (deviceListMsg.devices) {
        console.log('Device list array length:', deviceListMsg.devices.length);
        console.log('Device list contents:', JSON.stringify(deviceListMsg.devices, null, 2));
        get().setDevices(deviceListMsg.devices);
        console.log('Devices set in store');
      }
    }

    // Handle other message types as needed
    if (message.type === 'message') {
      console.log('Received message from:', message.from);
    }

    if (message.type === 'error') {
      console.error('Server error:', message.content);
    }
  },
}));
