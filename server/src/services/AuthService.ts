import * as jwt from 'jsonwebtoken';
import { SignOptions } from 'jsonwebtoken';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models';
import { DatabaseManager } from '../config/database';
import { authLogger, logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

// Ensure JWT_SECRET is always a string
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set');
}

interface JWTPayload {
  userId: number;
  username: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

export class AuthService {
  // Generate JWT token
  static generateToken(user: { id: number; username: string }): string {
    const secret: string = JWT_SECRET;
    const payload = { userId: user.id, username: user.username };
    const options: SignOptions = { expiresIn: JWT_EXPIRES_IN as any };
    
    return jwt.sign(payload, secret, options);
  }

  // Verify JWT token
  static verifyToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
      const meta = {
        error: message,
        tokenLength: token ? token.length : 0,
        tokenPrefix: token ? token.substring(0, 20) + '...' : null
      };

      // These are common/expected in real traffic (stale token, random garbage, etc).
      if (
        message.includes('jwt malformed') ||
        message.includes('invalid token') ||
        message.includes('jwt expired')
      ) {
        // Keep quiet to avoid noisy logs for expected/benign failures.
        // Use LOG_LEVEL=debug and add explicit logs at call sites if needed.
      } else {
        authLogger.warn('JWT verification failed', meta);
      }
      return null;
    }
  }

  // Fast user registration/login (mobile-optimized)
  static async loginOrRegister(req: Request, res: Response): Promise<void> {
    try {
      const { username } = req.body;

      if (!username || username.length < 2 || username.length > 20) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username must be between 2 and 20 characters'
        });
        return;
      }

      // Validate username characters (alphanumeric + Swedish characters + underscore)
      const usernameRegex = /^[a-zA-Z0-9_åäöÅÄÖ]+$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username can only contain letters, numbers, underscore and Swedish characters'
        });
        return;
      }

      let user = await UserModel.findByUsername(username);

      if (!user) {
        // Create new user
        user = await UserModel.create(username);
        logger.info(`New user registered: ${username}`);
      } else {
        // Prevent insecure guest/legacy login from bypassing password-protected accounts.
        if ((user as any).password_hash) {
          res.status(403).json({
            error: 'Password required',
            message: 'This username is protected. Please log in with a password.'
          });
          return;
        }

        // Update last active
        await UserModel.updateLastActive(user.id);
        logger.info(`User login: ${username}`);
      }

      const token = AuthService.generateToken(user);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
          isGuest: !user.password_hash
        },
        token,
        expiresIn: JWT_EXPIRES_IN
      });

    } catch (error) {
      logger.error('Login/register error:', error);
      res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to authenticate user'
      });
    }
  }

  static async registerWithPassword(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body || {};

      if (!username || typeof username !== 'string' || username.length < 2 || username.length > 20) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username must be between 2 and 20 characters'
        });
        return;
      }

      const usernameRegex = /^[a-zA-Z0-9_åäöÅÄÖ]+$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username can only contain letters, numbers, underscore and Swedish characters'
        });
        return;
      }

      if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        res.status(400).json({
          error: 'Invalid password',
          message: 'Password must be between 8 and 128 characters'
        });
        return;
      }

      const existing = await UserModel.findByUsername(username);
      if (existing) {
        res.status(409).json({
          error: 'Username already taken',
          message: 'That username is already in use'
        });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await UserModel.createWithPassword(username, passwordHash);

      const token = AuthService.generateToken(user);
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
          isGuest: !user.password_hash
        },
        token,
        expiresIn: JWT_EXPIRES_IN
      });
    } catch (error) {
      logger.error('Register error:', error);
      res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to register user'
      });
    }
  }

  static async loginWithPassword(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body || {};

      if (!username || typeof username !== 'string' || username.length < 2 || username.length > 20) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username must be between 2 and 20 characters'
        });
        return;
      }

      if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
        res.status(400).json({
          error: 'Invalid password',
          message: 'Password must be between 8 and 128 characters'
        });
        return;
      }

      const user = await UserModel.findByUsername(username);
      // Avoid leaking whether a username exists.
      if (!user || !user.password_hash) {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid username or password'
        });
        return;
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Invalid username or password'
        });
        return;
      }

      await UserModel.updateLastActive(user.id);
      const token = AuthService.generateToken(user);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
          isGuest: !user.password_hash
        },
        token,
        expiresIn: JWT_EXPIRES_IN
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        error: 'Authentication failed',
        message: 'Unable to authenticate user'
      });
    }
  }

  // Change password for current user (requires current password)
  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const currentUser = authReq.user;
      if (!currentUser) {
        res.status(401).json({
          error: 'Access denied',
          message: 'Authorization token required'
        });
        return;
      }

      const { currentPassword, newPassword } = (req.body || {}) as any;

      if (!currentPassword || typeof currentPassword !== 'string' || currentPassword.length < 8 || currentPassword.length > 128) {
        res.status(400).json({
          error: 'Invalid password',
          message: 'Current password is required'
        });
        return;
      }

      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
        res.status(400).json({
          error: 'Invalid password',
          message: 'Password must be between 8 and 128 characters'
        });
        return;
      }

      if (currentPassword === newPassword) {
        res.status(400).json({
          error: 'Invalid password',
          message: 'New password must be different'
        });
        return;
      }

      const user = await UserModel.findById(currentUser.id);
      if (!user) {
        res.status(404).json({
          error: 'User not found',
          message: 'User no longer exists'
        });
        return;
      }

      if (!user.password_hash) {
        res.status(400).json({
          error: 'Password not set',
          message: 'This account does not have a password'
        });
        return;
      }

      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Current password is incorrect'
        });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      const updated = await UserModel.setPasswordHash(user.id, passwordHash);
      if (!updated) {
        res.status(404).json({
          error: 'User not found',
          message: 'User no longer exists'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Password updated'
      });
    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({
        error: 'Password change failed',
        message: 'Unable to change password'
      });
    }
  }

  // Rename username (preserves userId)
  static async renameUsername(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      const currentUser = authReq.user;
      if (!currentUser) {
        res.status(401).json({
          error: 'Access denied',
          message: 'Authorization token required'
        });
        return;
      }

      const raw = req.body?.username;
      const username = typeof raw === 'string' ? raw.trim() : '';

      if (!username || username.length < 2 || username.length > 20) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username must be between 2 and 20 characters'
        });
        return;
      }

      // Validate username characters (alphanumeric + Swedish characters + underscore)
      const usernameRegex = /^[a-zA-Z0-9_åäöÅÄÖ]+$/;
      if (!usernameRegex.test(username)) {
        res.status(400).json({
          error: 'Invalid username',
          message: 'Username can only contain letters, numbers, underscore and Swedish characters'
        });
        return;
      }

      // No-op rename
      if (username === currentUser.username) {
        const user = await UserModel.findById(currentUser.id);
        if (!user) {
          res.status(404).json({
            error: 'User not found',
            message: 'User no longer exists'
          });
          return;
        }

        const token = AuthService.generateToken(user);
        res.status(200).json({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
            isGuest: !user.password_hash
          },
          token,
          expiresIn: JWT_EXPIRES_IN
        });
        return;
      }

      // Guests/legacy accounts (no password hash) cannot change username.
      const fullUser = await UserModel.findById(currentUser.id);
      if (!fullUser) {
        res.status(404).json({
          error: 'User not found',
          message: 'User no longer exists'
        });
        return;
      }

      if (!fullUser.password_hash) {
        res.status(403).json({
          error: 'Guest account',
          message: 'Guest accounts cannot change username'
        });
        return;
      }

      const existing = await UserModel.findByUsername(username);
      if (existing && existing.id !== currentUser.id) {
        res.status(409).json({
          error: 'Username already taken',
          message: 'That username is already in use'
        });
        return;
      }

      const updated = await UserModel.updateUsername(currentUser.id, username);
      if (!updated) {
        res.status(404).json({
          error: 'User not found',
          message: 'User no longer exists'
        });
        return;
      }

      const token = AuthService.generateToken(updated);
      res.status(200).json({
        success: true,
        user: {
          id: updated.id,
          username: updated.username,
          created_at: updated.created_at,
          isGuest: !updated.password_hash
        },
        token,
        expiresIn: JWT_EXPIRES_IN
      });
    } catch (error) {
      logger.error('Rename username error:', error);
      res.status(500).json({
        error: 'Rename failed',
        message: 'Unable to rename username'
      });
    }
  }

  // Refresh token
  static async refreshToken(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        res.status(401).json({
          error: 'No token provided',
          message: 'Authorization header required'
        });
        return;
      }

      const decoded = AuthService.verifyToken(token);
      if (!decoded) {
        res.status(401).json({
          error: 'Invalid token',
          message: 'Token verification failed'
        });
        return;
      }

      // Get fresh user data
      const user = await UserModel.findById(decoded.userId);
      if (!user) {
        res.status(401).json({
          error: 'User not found',
          message: 'User associated with token no longer exists. Please log in again.'
        });
        return;
      }

      // Update last active and generate new token
      await UserModel.updateLastActive(user.id);
      const newToken = AuthService.generateToken(user);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at,
          isGuest: !user.password_hash
        },
        token: newToken,
        expiresIn: JWT_EXPIRES_IN
      });

    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(500).json({
        error: 'Token refresh failed',
        message: 'Unable to refresh token'
      });
    }
  }

  // Logout
  static async logout(req: Request, res: Response): Promise<void> {
    // For stateless JWT, logout is mainly client-side
    // But we can update the user's last_active timestamp
    try {
      const authReq = req as AuthenticatedRequest;
      if (authReq.user) {
        await UserModel.updateLastActive(authReq.user.id);

        const deleteGuestOnLogout = process.env.DELETE_GUEST_ON_LOGOUT === 'true';

        // If this is a guest/legacy account (no password hash), we try to clean it up.
        // IMPORTANT: users can own rooms. If a guest owns a room that still has members,
        // transfer ownership to the longest-tenured remaining member.
        const fullUser = await UserModel.findById(authReq.user.id);
        if (fullUser && !fullUser.password_hash && deleteGuestOnLogout) {
          const dbManager = await DatabaseManager.getInstance();
          const db = dbManager.getDatabase();

          const ownedRooms = (await db.all(
            'SELECT id FROM rooms WHERE created_by = ?',
            authReq.user.id
          )) as Array<{ id: number }>;

          for (const room of ownedRooms) {
            const nextOwner = (await db.get(
              `
              SELECT user_id
              FROM room_members
              WHERE room_id = ? AND user_id != ?
              ORDER BY joined_at ASC
              LIMIT 1
              `,
              room.id,
              authReq.user.id
            )) as { user_id: number } | null;

            if (nextOwner?.user_id) {
              await db.run(
                'UPDATE rooms SET created_by = ? WHERE id = ?',
                nextOwner.user_id,
                room.id
              );
            } else {
              // No remaining members -> remove the room.
              await db.run('DELETE FROM rooms WHERE id = ?', room.id);
            }
          }

          await UserModel.delete(authReq.user.id);
          logger.info(`Guest user deleted on logout: ${authReq.user.username}`);

          res.status(200).json({
            success: true,
            message: 'Logged out successfully',
            deletedGuest: true
          });
          return;
        }

        logger.info(`User logout: ${authReq.user.username}`);
      }

      res.status(200).json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        error: 'Logout failed',
        message: 'Unable to complete logout'
      });
    }
  }

  // Middleware to authenticate requests
  static async authenticateToken(req: Request, res: Response, next: any): Promise<void> {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        error: 'Access denied',
        message: 'Authorization token required'
      });
      return;
    }

    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
      res.status(403).json({
        error: 'Invalid token',
        message: 'Token verification failed'
      });
      return;
    }

    // Verify user still exists in database
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      const debugId = `auth_missing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      logger.warn(`Token references non-existent user: ${decoded.userId} (${decoded.username})`, {
        debugId,
        userId: decoded.userId,
        username: decoded.username
      });

      const includeDetails = process.env.DEBUG_API_ERRORS === 'true';
      res.status(403).json({
        error: 'Invalid token',
        message: 'User no longer exists. Please log in again.',
        debugId,
        ...(includeDetails ? { decoded: { userId: decoded.userId, username: decoded.username } } : null)
      });
      return;
    }

    // Keep last_active updated so inactivity-based cleanup works reliably.
    await UserModel.updateLastActive(user.id);

    // Add user info to request
    (req as AuthenticatedRequest).user = {
      id: decoded.userId,
      username: decoded.username
    };

    next();
  }

  // Optional authentication (doesn't fail if no token)
  static optionalAuth(req: Request, _res: Response, next: any): void {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = AuthService.verifyToken(token);
      if (decoded) {
        (req as AuthenticatedRequest).user = {
          id: decoded.userId,
          username: decoded.username
        };

        // Best-effort: keep last_active updated even for optionally-authenticated routes.
        // This prevents GuestCleanupService from deleting active guest users who are polling
        // room state via GET endpoints.
        void UserModel.updateLastActive(decoded.userId).catch(() => {
          // ignore
        });
      }
    }

    next();
  }
}

export type { AuthenticatedRequest };