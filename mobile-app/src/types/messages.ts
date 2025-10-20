export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeral_public_key: string;
}

export interface Message {
  type: 'message' | 'register' | 'device_list' | 'error';
  from?: string;
  to?: string;
  content?: string;
  encrypted?: boolean;
  timestamp?: number;
  ciphertext?: string;
  nonce?: string;
  ephemeral_public_key?: string;
}

export interface RegisterMessage {
  type: 'register';
  token: string;
  clientType: 'android' | 'ios';
  deviceId: string;
  deviceName: string;
  publicKey: string;
  version: string;
  platform: string;
  arch: string;
}
