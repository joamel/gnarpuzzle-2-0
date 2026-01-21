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
    it('should register new user with valid username and password', async () => {
      const mockRequest = {
        body: { username: 'testuser', password: 'password123' }
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.registerWithPassword(mockRequest as any, mockResponse as any);

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
        body: { username: 'a', password: 'password123' } // Too short
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.registerWithPassword(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid username'
        })
      );
    });

    it('should reject invalid characters in username', async () => {
      const mockRequest = {
        body: { username: 'test@user', password: 'password123' } // Invalid characters
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.registerWithPassword(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid username'
        })
      );
    });

    it('should login existing user with correct password', async () => {
      // First register user
      const registerRequest = {
        body: { username: 'existinguser', password: 'password123' }
      };
      
      const registerResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.registerWithPassword(registerRequest as any, registerResponse as any);

      // Then login same user
      const loginRequest = {
        body: { username: 'existinguser', password: 'password123' }
      };
      
      const loginResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };

      await AuthService.loginWithPassword(loginRequest as any, loginResponse as any);

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

    it('should reject login with wrong password', async () => {
      // Register
      const registerRequest = {
        body: { username: 'pwuser', password: 'password123' }
      };
      const registerResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.registerWithPassword(registerRequest as any, registerResponse as any);

      // Login wrong
      const loginRequest = {
        body: { username: 'pwuser', password: 'wrongpassword' }
      };
      const loginResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.loginWithPassword(loginRequest as any, loginResponse as any);

      expect(loginResponse.status).toHaveBeenCalledWith(401);
      expect(loginResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid credentials'
        })
      );
    });

    it('should treat usernames as case-insensitive for login', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const original = `TestUser_${suffix}`;

      // Register with mixed casing
      const registerRequest = {
        body: { username: original, password: 'password123' }
      };
      const registerResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.registerWithPassword(registerRequest as any, registerResponse as any);
      expect(registerResponse.status).toHaveBeenCalledWith(200);

      // Login with different casing
      const loginRequest = {
        body: { username: original.toLowerCase(), password: 'password123' }
      };
      const loginResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.loginWithPassword(loginRequest as any, loginResponse as any);
      expect(loginResponse.status).toHaveBeenCalledWith(200);
    });

    it('should not allow registering the same username with different casing', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const original = `TestUser_${suffix}`;

      const firstRequest = {
        body: { username: original, password: 'password123' }
      };
      const firstResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.registerWithPassword(firstRequest as any, firstResponse as any);
      expect(firstResponse.status).toHaveBeenCalledWith(200);

      const secondRequest = {
        body: { username: original.toLowerCase(), password: 'password123' }
      };
      const secondResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      await AuthService.registerWithPassword(secondRequest as any, secondResponse as any);
      expect(secondResponse.status).toHaveBeenCalledWith(409);
    });

    it('should not allow guest login to bypass password-protected accounts', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const username = `Protected_${suffix}`;

      const registerRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.registerWithPassword({ body: { username, password: 'password123' } } as any, registerRes as any);
      expect(registerRes.status).toHaveBeenCalledWith(200);

      const guestRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.loginOrRegister({ body: { username } } as any, guestRes as any);
      expect(guestRes.status).toHaveBeenCalledWith(403);
      expect(guestRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Password required' })
      );
    });

    it('should allow case-insensitive guest login for legacy non-password accounts', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const username = `legacy_${suffix}`;

      const firstRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.loginOrRegister({ body: { username } } as any, firstRes as any);
      expect(firstRes.status).toHaveBeenCalledWith(200);

      const secondRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.loginOrRegister({ body: { username: username.toUpperCase() } } as any, secondRes as any);
      expect(secondRes.status).toHaveBeenCalledWith(200);
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

    it('should delete guest user on logout (clean up temporary guests)', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const username = `guest_${suffix}`;

      let createdUser: any = null;
      const guestRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          createdUser = payload.user;
        })
      };

      await AuthService.loginOrRegister({ body: { username } } as any, guestRes as any);
      expect(guestRes.status).toHaveBeenCalledWith(200);
      expect(createdUser).toBeTruthy();

      const logoutRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.logout({ user: { id: createdUser.id, username: createdUser.username } } as any, logoutRes as any);
      expect(logoutRes.status).toHaveBeenCalledWith(200);

      // User should now be deleted
      const { UserModel } = await import('../../models');
      const found = await UserModel.findById(createdUser.id);
      expect(found).toBeNull();
    });
  });

  describe('Username Rename', () => {
    it('should rename username while preserving userId', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const original = `user_${suffix}`;
      const renamed = `user2_${suffix}`;

      let createdUser: any = null;
      const createReq = { body: { username: original, password: 'password123' } };
      const createRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          createdUser = payload.user;
        })
      };

      await AuthService.registerWithPassword(createReq as any, createRes as any);
      expect(createdUser).toBeTruthy();

      let renamePayload: any = null;
      const renameReq = { body: { username: renamed }, user: { id: createdUser.id, username: createdUser.username } };
      const renameRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          renamePayload = payload;
        })
      };

      await AuthService.renameUsername(renameReq as any, renameRes as any);

      expect(renameRes.status).toHaveBeenCalledWith(200);
      expect(renamePayload).toEqual(
        expect.objectContaining({
          success: true,
          user: expect.objectContaining({
            id: createdUser.id,
            username: renamed,
          }),
          token: expect.any(String)
        })
      );
    });

    it('should reject rename to an existing username', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const userA = `a_${suffix}`;
      const userB = `b_${suffix}`;

      // Create user A
      const reqA = { body: { username: userA, password: 'password123' } };
      const resA = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.registerWithPassword(reqA as any, resA as any);

      // Create user B and capture id
      let createdB: any = null;
      const reqB = { body: { username: userB, password: 'password123' } };
      const resB = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          createdB = payload.user;
        })
      };
      await AuthService.registerWithPassword(reqB as any, resB as any);
      expect(createdB).toBeTruthy();

      const renameReq = { body: { username: userA }, user: { id: createdB.id, username: createdB.username } };
      const renameRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };

      await AuthService.renameUsername(renameReq as any, renameRes as any);

      expect(renameRes.status).toHaveBeenCalledWith(409);
      expect(renameRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Username already taken'
        })
      );
    });
  });

  describe('Password Change', () => {
    it('should change password when current password is correct', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const username = `pw_${suffix}`;

      let createdUser: any = null;
      const registerReq = { body: { username, password: 'password123' } };
      const registerRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          createdUser = payload.user;
        })
      };
      await AuthService.registerWithPassword(registerReq as any, registerRes as any);
      expect(registerRes.status).toHaveBeenCalledWith(200);
      expect(createdUser).toBeTruthy();

      const changeReq = {
        body: { currentPassword: 'password123', newPassword: 'newpassword123' },
        user: { id: createdUser.id, username: createdUser.username }
      };

      const changeRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.changePassword(changeReq as any, changeRes as any);
      expect(changeRes.status).toHaveBeenCalledWith(200);

      const loginOldRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.loginWithPassword({ body: { username, password: 'password123' } } as any, loginOldRes as any);
      expect(loginOldRes.status).toHaveBeenCalledWith(401);

      const loginNewRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.loginWithPassword({ body: { username, password: 'newpassword123' } } as any, loginNewRes as any);
      expect(loginNewRes.status).toHaveBeenCalledWith(200);
    });

    it('should reject password change when current password is wrong', async () => {
      const suffix = Math.random().toString(36).slice(2, 8);
      const username = `pw2_${suffix}`;

      const registerReq = { body: { username, password: 'password123' } };
      const registerRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.registerWithPassword(registerReq as any, registerRes as any);
      expect(registerRes.status).toHaveBeenCalledWith(200);

      let createdUser: any = null;
      const loginRes = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((payload: any) => {
          createdUser = payload.user;
        })
      };
      await AuthService.loginWithPassword({ body: { username, password: 'password123' } } as any, loginRes as any);
      expect(createdUser).toBeTruthy();

      const changeReq = {
        body: { currentPassword: 'wrongpassword', newPassword: 'newpassword123' },
        user: { id: createdUser.id, username: createdUser.username }
      };
      const changeRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      await AuthService.changePassword(changeReq as any, changeRes as any);
      expect(changeRes.status).toHaveBeenCalledWith(401);
      expect(changeRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Invalid credentials' })
      );
    });
  });

  describe('Token Authentication Middleware', () => {
    it('should authenticate valid tokens', async () => {
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

      // Mock DatabaseManager to return the user exists
      const mockDb = {
        get: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' }),
        run: vi.fn().mockResolvedValue({ lastInsertRowid: 0, changes: 1 })
      };
      vi.spyOn(DatabaseManager, 'getInstance').mockResolvedValue({
        getDatabase: () => mockDb
      } as any);

      await AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user).toMatchObject({
        id: 1,
        username: 'testuser'
      });
    });

    it('should reject requests without tokens', async () => {
      const mockRequest = {
        headers: {}
      };
      
      const mockResponse = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      };
      
      const mockNext = vi.fn();

      await AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Access denied'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid tokens', async () => {
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

      await AuthService.authenticateToken(mockRequest as any, mockResponse as any, mockNext);

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
