/**
 * Authentication State Store
 */

import { create } from 'zustand';
import type { UserInfo } from '../services/AuthManager';

interface AuthState {
  isAuthenticated: boolean;
  userInfo: UserInfo | null;
  setAuthenticated: (authenticated: boolean) => void;
  setUserInfo: (userInfo: UserInfo | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userInfo: null,

  setAuthenticated: (authenticated: boolean) =>
    set({ isAuthenticated: authenticated }),

  setUserInfo: (userInfo: UserInfo | null) =>
    set({ userInfo }),

  logout: () =>
    set({ isAuthenticated: false, userInfo: null }),
}));
