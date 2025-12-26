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
      ...options.headers,
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
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }

  async logout(): Promise<void> {
    await this.request('/auth/logout', { method: 'DELETE' });
    this.clearToken();
  }

  async getCurrentUser(): Promise<any> {
    return this.request('/auth/me');
  }

  // Room endpoints
  async getRooms(): Promise<any[]> {
    return this.request('/rooms');
  }

  async createRoom(name: string, settings?: any): Promise<any> {
    return this.request('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, settings }),
    });
  }

  async getRoomByCode(code: string): Promise<any> {
    return this.request(`/rooms/${code}`);
  }

  async joinRoom(code: string): Promise<any> {
    return this.request(`/rooms/${code}/join`, { method: 'POST' });
  }

  async leaveRoom(code: string): Promise<any> {
    return this.request(`/rooms/${code}/leave`, { method: 'DELETE' });
  }

  // Game endpoints
  async startGame(roomId: number): Promise<any> {
    return this.request(`/rooms/${roomId}/start`, { method: 'POST' });
  }

  async selectLetter(gameId: number, playerId: number, letter: string): Promise<any> {
    return this.request(`/games/${gameId}/select-letter`, {
      method: 'POST',
      body: JSON.stringify({ playerId, letter }),
    });
  }

  async placeLetter(gameId: number, playerId: number, x: number, y: number): Promise<any> {
    return this.request(`/games/${gameId}/place-letter`, {
      method: 'POST',
      body: JSON.stringify({ playerId, x, y }),
    });
  }

  async confirmPlacement(gameId: number, playerId: number): Promise<any> {
    return this.request(`/games/${gameId}/confirm-placement`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  }

  async getPlayerScore(gameId: number, userId: number): Promise<{ score: number; words: any[] }> {
    return this.request(`/games/${gameId}/players/${userId}/score`);
  }

  async getAllPlayerScores(gameId: number): Promise<{ scores: any }> {
    return this.request(`/games/${gameId}/scores`);
  }
}

// Singleton instance
export const apiService = new ApiService();
export default apiService;