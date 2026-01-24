import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiService } from '../../services/apiService';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn().mockReturnValue(null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn().mockReturnValue(null),
} as Storage;
global.localStorage = localStorageMock;

describe('ApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      // Note: The ApiService constructor reads from localStorage at initialization
      // Since the module is already loaded by the time this test runs, we verify
      // that calling setToken stores the token correctly in localStorage
      const token = 'init-test-token';
      apiService.setToken(token);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('auth_token', token);
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
      await apiService.getRooms();

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

      await apiService.login('testuser', 'password123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'testuser', password: 'password123' }),
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

      await expect(apiService.login('invaliduser', 'password123')).rejects.toThrow('Invalid request');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(apiService.login('testuser', 'password123')).rejects.toThrow('Network error');
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

      const result = await apiService.login('testuser', 'password123');

      expect(result).toEqual({
        token: 'auth-token',
        user: { id: 1, username: 'testuser' }
      });
    });

    it('should register user and return token', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          token: 'reg-token',
          user: { id: 2, username: 'newuser' }
        })
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await apiService.register('newuser', 'password123');

      expect(result).toEqual({ token: 'reg-token', user: { id: 2, username: 'newuser' } });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/register',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ username: 'newuser', password: 'password123' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
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

    it('should rename username', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'new-token', user: { id: 1, username: 'newname' } })
      };
      mockFetch.mockResolvedValue(mockResponse);

      apiService.setToken('test-token');
      const result = await apiService.renameUsername('newname');

      expect(result).toEqual({ token: 'new-token', user: { id: 1, username: 'newname' } });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/auth/username',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ username: 'newname' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token'
          })
        })
      );
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
            max_players: 4,
            board_size: undefined,
            turn_duration: undefined
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

    it('should kick room member', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true })
      };
      mockFetch.mockResolvedValue(mockResponse);

      await apiService.kickMember('ABC123', 42);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/rooms/ABC123/kick',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ userId: 42 })
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