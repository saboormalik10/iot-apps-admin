import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthUser } from '../api/authService';

interface AuthContextType {
  isLoggedIn: boolean;
  isAuthLoading: boolean;
  user: AuthUser | null;
  login: (accessToken: string, refreshToken: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = '_token';
const REFRESH_TOKEN_KEY = '_refreshToken';
const USER_KEY = '_user';

// NEW: module-level escape hatch so non-React code (the axios interceptor)
// can force a logout without needing a hook.
export let forceLogoutHandler: (() => void) | null = null;

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkAuthStatus = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const storedUser = await AsyncStorage.getItem(USER_KEY);
      setIsLoggedIn(!!token);
      setUser(storedUser ? JSON.parse(storedUser) : null);
    } catch (error) {
      console.error('Error checking auth token:', error);
      setIsLoggedIn(false);
      setUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  const login = useCallback(async (accessToken: string, refreshToken: string, authUser: AuthUser) => {
    await AsyncStorage.multiSet([
      [TOKEN_KEY, accessToken],
      [REFRESH_TOKEN_KEY, refreshToken],
      [USER_KEY, JSON.stringify(authUser)],
    ]);
    setUser(authUser);
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
    setUser(null);
    setIsLoggedIn(false);
  }, []);

  // NEW: register/unregister the module-level handler whenever `logout` changes
  useEffect(() => {
    forceLogoutHandler = logout;
    return () => {
      forceLogoutHandler = null;
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isLoggedIn, isAuthLoading, user, login, logout, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};