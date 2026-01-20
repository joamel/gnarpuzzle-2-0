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

  const leaveAnyJoinedRooms = useCallback(async () => {
    try {
      const sessionKeys = Object.keys(sessionStorage).filter(key => key.startsWith('room_joined_'));
      if (sessionKeys.length === 0) return;

      for (const key of sessionKeys) {
        const roomCode = key.replace('room_joined_', '');
        if (!roomCode) continue;

        try {
          await apiService.leaveRoom(roomCode, true);
        } catch (err) {
          // Best-effort: if token is expired/invalid, server will reject; we still clear local markers.
          console.warn('⚠️ Failed to leave room during logout/account switch:', roomCode, err);
        } finally {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // ignore storage errors (private mode, etc)
    }
  }, []);

  const login = useCallback(async (username: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      // If we're already logged in and the user chooses a different username,
      // treat it as an account switch: leave any joined room(s) and fully reset.
      if (authState.isAuthenticated && authState.user?.username && authState.user.username !== username) {
        await leaveAnyJoinedRooms();
        try {
          await apiService.logout();
        } catch {
          // ignore
        }
        apiService.clearToken();
        localStorage.removeItem('auth_token');
      }
      
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
  }, [authState.isAuthenticated, authState.user?.username, leaveAnyJoinedRooms]);

  const logout = useCallback(async () => {
    try {
      await leaveAnyJoinedRooms();
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
  }, [leaveAnyJoinedRooms]);

  const refreshUser = useCallback(async () => {
    if (!authState.token) return;
    
    try {
      const user = await apiService.getCurrentUser();
      
      // Check if user ID changed (indicating user was recreated)
      if (authState.user && user.id !== authState.user.id) {
        console.log('ℹ️ User ID changed during refresh - user was likely recreated. Maintaining session.');
      }
      
      setAuthState(prev => ({ ...prev, user, isAuthenticated: true }));
    } catch (error) {
      console.error('Failed to refresh user:', error);
      await logout();
    }
  }, [authState.token, authState.user, logout]);

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