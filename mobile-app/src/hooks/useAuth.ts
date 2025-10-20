/**
 * Authentication Hook
 * Handles Google OAuth flow
 */

import { useEffect } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { authManager } from '../services/AuthManager';
import { useAuthStore } from '../state/useAuthStore';
import { GOOGLE_CLIENT_ID } from '../utils/constants';

// Required for Expo Auth Session
WebBrowser.maybeCompleteAuthSession();

export function useAuth() {
  const { isAuthenticated, setAuthenticated, setUserInfo, logout: logoutStore } = useAuthStore();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  });

  // Check existing auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Handle OAuth response
  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token, authentication } = response.params;

      // Save token
      authManager.saveIdToken(id_token);

      // Extract user info from token (basic parsing)
      // In production, validate token and extract claims properly
      setAuthenticated(true);

      console.log('OAuth successful');
    }
  }, [response]);

  const checkAuth = async () => {
    const authenticated = await authManager.isAuthenticated();
    setAuthenticated(authenticated);

    if (authenticated) {
      const userInfo = await authManager.getUserInfo();
      setUserInfo(userInfo);
    }
  };

  const signIn = async () => {
    await promptAsync();
  };

  const logout = async () => {
    await authManager.clearAuth();
    logoutStore();
  };

  return {
    isAuthenticated,
    signIn,
    logout,
    request,
  };
}
