/**
 * WebSocket Connection State Store
 */

import { create } from 'zustand';
import { WebSocketClient } from '../services/WebSocketClient';
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
  setDevices: (devices: Device[]) => void;
  handleMessage: (message: Message) => void;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  isConnected: false,
  serverUrl: '',
  client: null,
  devices: [],

  setServerUrl: (url: string) => set({ serverUrl: url }),

  connect: () => {
    const { serverUrl, disconnect } = get();

    // Disconnect existing connection
    disconnect();

    const client = new WebSocketClient(
      serverUrl,
      (message) => get().handleMessage(message),
      (connected) => set({ isConnected: connected })
    );

    client.connect();
    set({ client });
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

  setDevices: (devices: Device[]) => set({ devices }),

  handleMessage: (message: Message) => {
    console.log('Received message:', message);

    // Handle device list
    if (message.type === 'device_list') {
      const deviceListMsg = message as any;
      if (deviceListMsg.devices) {
        get().setDevices(deviceListMsg.devices);
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
