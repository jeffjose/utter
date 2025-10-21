export interface EncryptedMessage {
  ciphertext: string;
  nonce: string;
  ephemeral_public_key: string;
}

export interface Message {
  type: 'message' | 'register' | 'device_list' | 'devices' | 'error' | 'registered' | 'connected';
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
  jwt: string;  // Relay server JWT (obtained by exchanging Google ID token)
  clientType: 'controller' | 'target';  // Mobile app is a controller
  deviceId: string;
  deviceName: string;
  publicKey: string;
  version: string;
  platform: string;
  arch: string;
}
