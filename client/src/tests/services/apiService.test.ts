import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiService, ApiService } from '../../services/apiService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock;

describe('ApiService', () => {
  let apiService: ApiService;

  beforeEach(() => {
    vi.clearAllMocks();
    apiService = new ApiService('http://localhost:3001');
  });

  describe('Token Management', () => {
    it('should set and store token', () => {
      const token = 'test-token';
      apiService.setToken(token);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', token);
    });

    it('should clear token', () => {
      apiService.clearToken();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    });

    it('should load token from localStorage on initialization', () => {
      localStorageMock.getItem.mockReturnValue('stored-token');
      const newApiService = new ApiService();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('HTTP Requests', () => {
    it('should make GET request with correct headers', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: 'test' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      apiService.setToken('test-token');
      const result = await apiService.getRooms();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/rooms',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          })
        })
      );
    });

    it('should make POST request with body', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'new-token', user: { id: 1 } })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await apiService.login('testuser');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'testuser' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({ error: 'Invalid request' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(apiService.login('invaliduser')).rejects.toThrow('Invalid request');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(apiService.login('testuser')).rejects.toThrow('Network error');
    });
  });

  describe('Authentication Endpoints', () => {
    it('should login user and return token', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ 
          token: 'auth-token', 
          user: { id: 1, username: 'testuser' }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiService.login('testuser');

      expect(result).toEqual({
        token: 'auth-token',
        user: { id: 1, username: 'testuser' }
      });
    });

    it('should logout user', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      apiService.setToken('test-token');
      await apiService.logout();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/logout',
        expect.objectContaining({
          method: 'DELETE'
        })
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    });
  });

  describe('Room Endpoints', () => {
    it('should get rooms list', async () => {
      const mockRooms = [
        { id: 1, name: 'Room 1', code: 'ABC123' }
      ];
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ 
          success: true, 
          rooms: mockRooms, 
          total: 1 
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiService.getRooms();

      expect(result).toEqual(mockRooms);
    });

    it('should handle empty rooms response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ 
          success: true, 
          rooms: null, 
          total: 0 
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiService.getRooms();

      expect(result).toEqual([]);
    });

    it('should create room', async () => {
      const mockRoom = { 
        id: 1, 
        name: 'New Room', 
        code: 'NEW123' 
      };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ 
          success: true, 
          room: mockRoom 
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiService.createRoom('New Room', { max_players: 4 });

      expect(result).toEqual(mockRoom);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/rooms',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ 
            name: 'New Room', 
            settings: { max_players: 4 } 
          })
        })
      );
    });

    it('should join room', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await apiService.joinRoom('ABC123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/rooms/ABC123/join',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });
  });

  describe('Response Handling', () => {
    it('should handle malformed JSON responses', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(apiService.getRooms()).rejects.toThrow('HTTP 500: Internal Server Error');
    });

    it('should include request details in error messages', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({ error: 'Room not found' })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await expect(apiService.getRoomByCode('INVALID')).rejects.toThrow('Room not found');
    });
  });
});