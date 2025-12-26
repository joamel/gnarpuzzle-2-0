import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { AuthService } from '../../services/AuthService';
import { DatabaseManager } from '../../config/database';

describe('AuthService', () => {
  let app: any;
  let dbManager: DatabaseManager;

  beforeEach(async () => {
    // Reset database state
    dbManager = await DatabaseManager.getInstance();
  });

  describe('User Registration/Login', () => {
    it('should create new user with valid username', async () => {
      const mockRequest = {
        body: { username: 'testuser' }
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginOrRegister(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            username: 'testuser'
          }),
          token: expect.any(String)
        })
      );
    });

    it('should reject invalid username lengths', async () => {
      const mockRequest = {
        body: { username: 'a' } // Too short
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginOrRegister(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid username'
        })
      );
    });

    it('should reject invalid characters in username', async () => {
      const mockRequest = {
        body: { username: 'test@user' } // Invalid characters
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginOrRegister(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid username'
        })
      );
    });

    it('should login existing user', async () => {
      // First create user
      const createRequest = {
        body: { username: 'existinguser' }
      };
      
      const createResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginOrRegister(createRequest as any, createResponse as any);

      // Then login same user
      const loginRequest = {
        body: { username: 'existinguser' }
      };
      
      const loginResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginOrRegister(loginRequest as any, loginResponse as any);

      expect(loginResponse.status).toHaveBeenCalledWith(200);
      expect(loginResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            username: 'existinguser'
          })
        })
      );
    });

    it('should generate valid JWT tokens', () => {
      const user = { id: 1, username: 'testuser' };
      const token = AuthService.generateToken(user);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = AuthService.verifyToken(token);
      expect(decoded).toMatchObject({
        userId: 1,
        username: 'testuser'
      });
    });

    it('should reject invalid JWT tokens', () => {
      const invalidToken = 'invalid.jwt.token';
      const decoded = AuthService.verifyToken(invalidToken);
      
      expect(decoded).toBeNull();
    });
  });

  describe('Token Authentication Middleware', () => {
    it('should authenticate valid tokens', () => {
      const user = { id: 1, username: 'testuser' };
      const token = AuthService.generateToken(user);
      
      const mockRequest = {
        headers: {
          authorization: `Bearer ${token}`
        }
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      const mockNext = vi.fn();

      AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user).toMatchObject({
        id: 1,
        username: 'testuser'
      });
    });

    it('should reject requests without tokens', () => {
      const mockRequest = {
        headers: {}
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      const mockNext = vi.fn();

      AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Access denied'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid tokens', () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer invalid.token'
        }
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      const mockNext = vi.fn();

      AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid token'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
