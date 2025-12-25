import jwt, { SignOptions } from 'jsonwebtoken';
import { Request, Response } from 'express';
import { UserModel } from '../models';
import { logger } from '../index';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-this';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

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
      return jwt.verify(token, JWT_SECRET) as JWTPayload;
    } catch (error) {
      logger.warn('Invalid token verification:', error);
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
        // Update last active
        await UserModel.updateLastActive(user.id);
        logger.info(`User login: ${username}`);
      }

      const token = this.generateToken(user);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
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

      const decoded = this.verifyToken(token);
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
          message: 'User associated with token no longer exists'
        });
        return;
      }

      // Update last active and generate new token
      await UserModel.updateLastActive(user.id);
      const newToken = this.generateToken(user);

      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          created_at: user.created_at
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
  static authenticateToken(req: Request, res: Response, next: any): void {
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
      }
    }

    next();
  }
}

export type { AuthenticatedRequest };