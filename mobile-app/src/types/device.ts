export interface Device {
  deviceId: string;
  deviceName: string;
  deviceType: 'controller' | 'target';
  userId: string;
  publicKey?: string;
  status: 'online' | 'offline';
  lastConnected: Date | string;
}

export interface DeviceListMessage {
  type: 'device_list';
  devices: Device[];
}
