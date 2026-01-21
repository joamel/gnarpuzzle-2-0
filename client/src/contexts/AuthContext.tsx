import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthState } from '../types/game';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { logger } from '../utils/logger';

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  loginAsGuest: (username: string) => Promise<void>;
  renameUsername: (username: string) => Promise<void>;
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
          logger.room.warn('Failed to leave room during logout/account switch', { roomCode, err });
        } finally {
          sessionStorage.removeItem(key);
        }
      }
    } catch {
      // ignore storage errors (private mode, etc)
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
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
      
      const response = await apiService.login(username, password);
      
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
      const message = (error as any)?.message ? String((error as any).message) : '';
      if (!message.toLowerCase().includes('invalid credentials')) {
        console.error('Login error:', error);
      }
      setAuthState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [authState.isAuthenticated, authState.user?.username, leaveAnyJoinedRooms]);

  const loginAsGuest = useCallback(async (username: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      // If we're already logged in and switching accounts, leave room(s) and reset.
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

      socketService.disconnect();

      const response = await apiService.guestLogin(username);
      apiService.setToken(response.token);

      setAuthState({
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      });

      await socketService.connect(response.token);
    } catch (error) {
      const message = (error as any)?.message ? String((error as any).message) : '';
      if (!message.toLowerCase().includes('password required')) {
        console.error('Guest login error:', error);
      }
      setAuthState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [authState.isAuthenticated, authState.user?.username, leaveAnyJoinedRooms]);

  const renameUsername = useCallback(async (username: string) => {
    if (!authState.isAuthenticated || !authState.user) {
      throw new Error('Not authenticated');
    }

    try {
      setAuthState(prev => ({ ...prev, isLoading: true }));

      const response = await apiService.renameUsername(username);
      apiService.setToken(response.token);

      setAuthState(prev => ({
        ...prev,
        user: response.user,
        token: response.token,
        isAuthenticated: true,
        isLoading: false,
      }));

      // Refresh the Socket.IO auth token while keeping room intent.
      await socketService.reconnectWithToken(response.token);
    } catch (error) {
      console.error('Rename username error:', error);
      setAuthState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [authState.isAuthenticated, authState.user]);

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
        logger.auth.info('User ID changed during refresh - user was likely recreated. Maintaining session.');
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
        const status = (error as any)?.status;
        // Stale token on startup is common; treat as logged-out without noisy logs.
        if (status !== 401 && status !== 403) {
          logger.auth.warn('Authentication check failed', { error });
        }
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

  // Best-effort cleanup on tab close / browser close.
  // This is especially useful for temporary guest accounts. Not guaranteed to run.
  useEffect(() => {
    const token = authState.token;
    if (!token) return;

    const baseUrl = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';
    const url = `${baseUrl}/api/auth/logout`;

    const sendLogout = () => {
      try {
        // Use fetch keepalive so the browser can attempt to complete the request during unload.
        fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
          keepalive: true,
        } as any);
      } catch {
        // ignore
      }
    };

    window.addEventListener('pagehide', sendLogout);
    return () => {
      window.removeEventListener('pagehide', sendLogout);
    };
  }, [authState.token]);

  const value: AuthContextType = {
    ...authState,
    login,
    loginAsGuest,
    renameUsername,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};