import { Game } from '../../../shared/types.js';
import type { LeaderboardResponse, MyStatsResponse } from '../types/stats';
import { logger } from '../utils/logger';
import { normalizeRoomCode } from '../utils/roomCode';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  async refreshToken(): Promise<{ token: string; user: any }> {
    if (!this.token) {
      throw new Error('No token to refresh');
    }
    
    return this.request<{ token: string; user: any }>('/api/auth/refresh', {
      method: 'POST',
    });
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const method = (options.method || 'GET').toUpperCase();
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        // Avoid stale room/member/game snapshots due to HTTP caching.
        // Socket events can arrive out-of-order; the UI often refetches immediately after.
        ...(method === 'GET' ? { cache: 'no-store' as const } : null),
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({} as any));
        const errorMessage = errorData?.error || errorData?.message || `HTTP ${response.status}: ${response.statusText}`;

        const err: any = new Error(errorMessage);
        err.status = response.status;
        err.endpoint = endpoint;

        // Handle authentication errors with intelligent retry
        if (response.status === 403 || response.status === 401) {
          // Special case: /me is used as a passive auth-check on startup.
          // If token is stale/invalid, treat it as logged-out (no refresh attempts here).
          if (endpoint === '/api/auth/me') {
            this.clearToken();
            throw err;
          }

          // Don't retry for login/refresh endpoints to avoid infinite loops
          // Also don't retry for endpoints that can legitimately return 401 for non-token reasons.
          if (
            endpoint === '/api/auth/login' ||
            endpoint === '/api/auth/register' ||
            endpoint === '/api/auth/refresh' ||
            endpoint === '/api/auth/password'
          ) {
            throw err;
          }

          logger.auth.info('Authentication failed - attempting token refresh', {
            status: response.status,
            endpoint,
          });
          
          // Try to refresh the token. Only clear token/redirect if refresh fails.
          let refreshResponse: { token: string; user: any };
          try {
            refreshResponse = await this.refreshToken();
          } catch (refreshError) {
            logger.auth.warn('Token refresh failed, redirecting to login', { refreshError });
            this.clearToken();
            window.location.href = '/';
            return Promise.reject(new Error('Session expired - please log in again'));
          }

          this.setToken(refreshResponse.token);

          // Log if user was recreated
          if ((refreshResponse as any).recreated) {
            logger.auth.info('User was recreated during token refresh - continuing with new token');
          } else {
            logger.auth.info('Token refreshed successfully, retrying original request');
          }

          // Retry the original request with new token
          const retryHeaders = {
            ...headers,
            Authorization: `Bearer ${refreshResponse.token}`
          };

          const retryResponse = await fetch(url, {
            ...options,
            ...(method === 'GET' ? { cache: 'no-store' as const } : null),
            headers: retryHeaders,
          });

          if (!retryResponse.ok) {
            const retryErrorData = await retryResponse.json().catch(() => ({} as any));
            const retryErrorMessage = retryErrorData?.error || retryErrorData?.message || `HTTP ${retryResponse.status}: ${retryResponse.statusText}`;
            const retryErr: any = new Error(retryErrorMessage);
            retryErr.status = retryResponse.status;
            retryErr.endpoint = endpoint;
            throw retryErr;
          }

          return await retryResponse.json();
        }

        throw err;
      }

      return await response.json();
    } catch (error) {
      const message = (error as any)?.message ? String((error as any).message) : '';
      const lower = message.toLowerCase();
      const status = (error as any)?.status;
      const isExpectedAuthFailure =
        (endpoint === '/api/auth/login' && lower.includes('invalid credentials')) ||
        (endpoint === '/api/auth/password' && (lower.includes('current password is incorrect') || lower.includes('invalid credentials'))) ||
        (endpoint === '/api/auth/me' && (status === 401 || status === 403));

      if (!isExpectedAuthFailure) {
        logger.api.error('API Error', { endpoint, error });
      }
      throw error;
    }
  }

  // Auth endpoints
  async login(username: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async register(username: string, password: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async guestLogin(username: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async logout(): Promise<void> {
    await this.request<any>('/api/auth/logout', { method: 'DELETE' });
    this.clearToken();
  }

  async getCurrentUser(): Promise<any> {
    const response = await this.request<{ success: boolean; user: any }>('/api/auth/me');
    // Backend returns { success: true, user: { id, username } }
    return response.user || response;
  }

  async renameUsername(username: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('/api/auth/username', {
      method: 'PUT',
      body: JSON.stringify({ username }),
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }>{
    return this.request<{ success: boolean; message?: string }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // Room endpoints
  async getRooms(): Promise<any[]> {
    const response = await this.request<{ success: boolean; rooms: any[]; total: number }>('/api/rooms');
    // Backend returns { success: true, rooms: [], total: 0 }
    return response.rooms || [];
  }

  async createRoom(name: string, options?: { max_players?: number; board_size?: number; turn_duration?: number; letter_timer?: number; placement_timer?: number; require_password?: boolean }): Promise<any> {
    const response = await this.request<{ success: boolean; room: any }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ 
        name, 
        max_players: options?.max_players,
        board_size: options?.board_size,
        turn_duration: options?.turn_duration,
        letter_timer: options?.letter_timer,
        placement_timer: options?.placement_timer,
        require_password: options?.require_password
      }),
    });
    // Backend returns { success: true, room: {...} }
    return response.room || response;
  }

  async getRoomByCode(code: string): Promise<any> {
    const roomCode = normalizeRoomCode(code);
    return this.request<any>(`/api/rooms/${roomCode}`);
  }

  async joinRoom(code: string, password?: string): Promise<any> {
    const response = await this.request<{ success: boolean; message: string; room: any; error?: string }>(`/api/rooms/${normalizeRoomCode(code)}/join`, { 
      method: 'POST',
      body: password ? JSON.stringify({ password }) : undefined
    });
    // Backend returns { success: true, message: 'Successfully joined room', room: {...} }
    return response.room || response;
  }

  async leaveRoom(code: string, intentional: boolean = false): Promise<any> {
    return this.request<any>(`/api/rooms/${normalizeRoomCode(code)}/leave`, { 
      method: 'DELETE',
      body: JSON.stringify({ intentional })
    });
  }

  async kickMember(code: string, userId: number): Promise<any> {
    return this.request<any>(`/api/rooms/${normalizeRoomCode(code)}/kick`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async updateRoomSettings(
    roomId: number,
    settings: {
      name?: string;
      max_players?: number;
      grid_size?: number;
      letter_timer?: number;
      placement_timer?: number;
    }
  ): Promise<any> {
    return this.request<any>(`/api/rooms/${roomId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Game endpoints
  async startGame(roomId: number): Promise<Game> {
    logger.api.debug('startGame called', { roomId });
    const endpoint = `/api/rooms/${roomId}/start`;
    logger.api.debug('Making POST request', { endpoint });
    
    try {
      const result = await this.request<Game>(endpoint, { method: 'POST' });
      return result;
    } catch (error) {
      logger.api.error('startGame failed', { error, roomId });
      throw error;
    }
  }

  async selectLetter(gameId: number, playerId: number, letter: string): Promise<any> {
    return this.request<any>(`/api/games/${gameId}/select-letter`, {
      method: 'POST',
      body: JSON.stringify({ playerId, letter }),
    });
  }

  async placeLetter(gameId: number, playerId: number, x: number, y: number): Promise<any> {
    return this.request<any>(`/api/games/${gameId}/place-letter`, {
      method: 'POST',
      body: JSON.stringify({ playerId, x, y }),
    });
  }

  async setPlacementIntent(gameId: number): Promise<any> {
    return this.request<any>(`/api/games/${gameId}/placement-intent`, {
      method: 'POST'
    });
  }

  async confirmPlacement(gameId: number, playerId: number): Promise<any> {
    return this.request<any>(`/api/games/${gameId}/confirm-placement`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  }

  async getPlayerScore(gameId: number, userId: number): Promise<{ score: number; words: any[] }> {
    return this.request<{ score: number; words: any[] }>(`/api/games/${gameId}/players/${userId}/score`);
  }

  async getAllPlayerScores(gameId: number): Promise<{ scores: any }> {
    return this.request<{ scores: any }>(`/api/games/${gameId}/scores`);
  }

  async getGame(gameId: number): Promise<any> {
    return this.request<any>(`/api/games/${gameId}`);
  }

  async getGameByRoomId(roomId: number): Promise<any> {
    return this.request<any>(`/api/games/room/${roomId}`);
  }

  // Stats endpoints
  async getOnlineStats(): Promise<{ online: { total: number; authenticated: number; anonymous: number } }> {
    return this.request<{ online: { total: number; authenticated: number; anonymous: number } }>('/api/stats/online');
  }

  async getMyStats(): Promise<MyStatsResponse> {
    return this.request<MyStatsResponse>('/api/stats/me');
  }

  async getLeaderboard(): Promise<LeaderboardResponse> {
    return this.request<LeaderboardResponse>('/api/stats/leaderboard');
  }
}

// Singleton instance
export const apiService = new ApiService();
export default apiService;