/**
 * Authentication Manager
 * Handles Google OAuth and token storage
 */

import * as SecureStore from 'expo-secure-store';

const ID_TOKEN_KEY = 'id_token';
const RELAY_JWT_KEY = 'relay_jwt';
const USER_INFO_KEY = 'user_info';

export interface UserInfo {
  email: string;
  name: string;
  picture?: string;
}

export class AuthManager {
  /**
   * Save OAuth ID token
   */
  async saveIdToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(ID_TOKEN_KEY, token);
  }

  /**
   * Get stored ID token
   */
  async getIdToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(ID_TOKEN_KEY);
  }

  /**
   * Save relay server JWT
   */
  async saveRelayJWT(jwt: string): Promise<void> {
    await SecureStore.setItemAsync(RELAY_JWT_KEY, jwt);
  }

  /**
   * Get stored relay server JWT
   */
  async getRelayJWT(): Promise<string | null> {
    return await SecureStore.getItemAsync(RELAY_JWT_KEY);
  }

  /**
   * Save user info
   */
  async saveUserInfo(userInfo: UserInfo): Promise<void> {
    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(userInfo));
  }

  /**
   * Get stored user info
   */
  async getUserInfo(): Promise<UserInfo | null> {
    const userInfoStr = await SecureStore.getItemAsync(USER_INFO_KEY);
    if (!userInfoStr) return null;

    try {
      return JSON.parse(userInfoStr);
    } catch {
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await this.getIdToken();
    return token !== null;
  }

  /**
   * Clear all auth data (logout)
   */
  async clearAuth(): Promise<void> {
    await SecureStore.deleteItemAsync(ID_TOKEN_KEY);
    await SecureStore.deleteItemAsync(RELAY_JWT_KEY);
    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  }
}

// Export singleton instance
export const authManager = new AuthManager();
