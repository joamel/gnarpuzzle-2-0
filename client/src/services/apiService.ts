import { Game } from '../../../shared/types.js';

const API_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string): void {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken(): void {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
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
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }

  // Auth endpoints
  async login(username: string): Promise<{ token: string; user: any }> {
    return this.request<{ token: string; user: any }>('/api/auth/login', {
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
    return this.request<any>(`/api/rooms/${code}`);
  }

  async joinRoom(code: string, password?: string): Promise<any> {
    const response = await this.request<{ success: boolean; message: string; room: any; error?: string }>(`/api/rooms/${code}/join`, { 
      method: 'POST',
      body: password ? JSON.stringify({ password }) : undefined
    });
    // Backend returns { success: true, message: 'Successfully joined room', room: {...} }
    return response.room || response;
  }

  async leaveRoom(code: string, intentional: boolean = false): Promise<any> {
    return this.request<any>(`/api/rooms/${code}/leave`, { 
      method: 'DELETE',
      body: JSON.stringify({ intentional })
    });
  }

  async updateRoomSettings(roomId: number, settings: { max_players?: number; grid_size?: number; letter_timer?: number; placement_timer?: number }): Promise<any> {
    return this.request<any>(`/api/rooms/${roomId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Game endpoints
  async startGame(roomId: number): Promise<Game> {
    console.log('🌐 ApiService.startGame called with roomId:', roomId);
    const endpoint = `/api/rooms/${roomId}/start`;
    console.log('📍 Making POST request to:', endpoint);
    
    try {
      const result = await this.request<Game>(endpoint, { method: 'POST' });
      return result;
    } catch (error) {
      console.error('❌ ApiService.startGame failed:', error);
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
}

// Singleton instance
export const apiService = new ApiService();
export default apiService;