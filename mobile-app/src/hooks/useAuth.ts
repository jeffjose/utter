/**
 * Authentication Hook
 * Handles Google OAuth flow using native Google Sign-In
 * Matches the implementation from android-app/GoogleAuthManager.kt
 */

import { useEffect, useState } from 'react';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { authManager } from '../services/AuthManager';
import { useAuthStore } from '../state/useAuthStore';
import { GOOGLE_CLIENT_ID } from '../utils/constants';

export function useAuth() {
  const { isAuthenticated, setAuthenticated, setUserInfo, logout: logoutStore } = useAuthStore();
  const [isConfigured, setIsConfigured] = useState(false);

  // Configure Google Sign-In on mount (like GoogleAuthManager init)
  useEffect(() => {
    GoogleSignin.configure({
      // Use WEB client ID for requestIdToken (same as Kotlin's requestIdToken(clientId))
      // Android package + SHA-1 are verified automatically by Google Play Services
      webClientId: GOOGLE_CLIENT_ID,
      offlineAccess: false,
      scopes: ['openid', 'email', 'profile'],
    });
    setIsConfigured(true);
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const authenticated = await authManager.isAuthenticated();
      setAuthenticated(authenticated);

      if (authenticated) {
        const userInfo = await authManager.getUserInfo();
        setUserInfo(userInfo);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    }
  };

  const signIn = async () => {
    try {
      // Check if Google Play Services are available
      await GoogleSignin.hasPlayServices();

      // Sign in and get user info (like GoogleAuthManager.getSignInIntent)
      const userInfo = await GoogleSignin.signIn();

      // Get ID token (like account.idToken in Kotlin)
      const idToken = userInfo.data?.idToken;

      if (idToken) {
        // Save token (like GoogleAuthManager.saveIdToken)
        await authManager.saveIdToken(idToken);

        // Save user info
        await authManager.saveUserInfo({
          email: userInfo.data?.user.email || '',
          name: userInfo.data?.user.name || '',
          picture: userInfo.data?.user.photo || undefined,
        });

        setAuthenticated(true);
        setUserInfo({
          email: userInfo.data?.user.email || '',
          name: userInfo.data?.user.name || '',
          picture: userInfo.data?.user.photo || undefined,
        });

        console.log('Sign-in successful:', userInfo.data?.user.email);
      } else {
        throw new Error('No ID token received');
      }
    } catch (error: any) {
      console.error('Sign-in failed - Full error object:', JSON.stringify(error, null, 2));
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      console.error('Error stack:', error?.stack);
      if (error?.userInfo) {
        console.error('Error userInfo:', JSON.stringify(error.userInfo, null, 2));
      }
      throw error;
    }
  };

  const logout = async () => {
    try {
      await GoogleSignin.signOut();
      await authManager.clearAuth();
      logoutStore();
      console.log('Signed out');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return {
    isAuthenticated,
    signIn,
    logout,
    request: isConfigured ? {} : null, // For backward compatibility with SignInScreen
  };
}
