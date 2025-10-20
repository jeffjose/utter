export interface Device {
  id: string;
  name: string;
  type: 'android' | 'ios' | 'linux' | 'windows' | 'macos';
  publicKey: string;
  lastSeen?: number;
  online?: boolean;
}

export interface DeviceListMessage {
  type: 'device_list';
  devices: Device[];
}
