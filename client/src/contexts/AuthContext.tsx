import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthState } from '../types/game';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';

interface AuthContextType extends AuthState {
  login: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('auth_token'),
    isAuthenticated: false,
    isLoading: true,
  });

  const login = useCallback(async (username: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));
      
      // Disconnect old socket before logging in with new user
      socketService.disconnect();
      
      const response = await apiService.login(username);
      
      apiService.setToken(response.token);
      
      setAuthState({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });

      // Connect socket with token for new user
      await socketService.connect(response.token);
      
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      apiService.clearToken();
      socketService.disconnect();
      
      setAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      
      localStorage.removeItem('auth_token');
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!authState.token) return;
    
    try {
      const user = await apiService.getCurrentUser();
      setAuthState(prev => ({ ...prev, user, isAuthenticated: true }));
    } catch (error) {
      console.error('Failed to refresh user:', error);
      await logout();
    }
  }, [authState.token, logout]);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setAuthState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      try {
        // Try to get current user - this will trigger automatic token refresh if needed
        apiService.setToken(token);
        const user = await apiService.getCurrentUser();
        
        setAuthState({
          user,
          token: apiService.getToken() || token, // Use refreshed token if available
          isAuthenticated: true,
          isLoading: false,
        });

        // Connect socket with current token
        await socketService.connect(apiService.getToken() || token);
        
      } catch (error) {
        console.warn('Authentication check failed - token may be invalid:', error);
        // apiService.getCurrentUser() already handles token refresh and cleanup
        // so we just need to update our state
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    };

    checkAuth();
  }, []);

  const value: AuthContextType = {
    ...authState,
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};