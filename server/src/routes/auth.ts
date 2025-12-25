import express from 'express';
import { AuthService } from '../services/AuthService';

const router = express.Router();

/**
 * POST /api/auth/login
 * Fast user registration/login endpoint
 * Mobile-optimized - just username required
 */
router.post('/login', AuthService.loginOrRegister);

/**
 * POST /api/auth/refresh  
 * Refresh JWT token
 * Requires Authorization: Bearer <token> header
 */
router.post('/refresh', AuthService.refreshToken);

/**
 * DELETE /api/auth/logout
 * Logout endpoint
 * Requires Authorization: Bearer <token> header
 */
router.delete('/logout', AuthService.authenticateToken, AuthService.logout);

/**
 * GET /api/auth/me
 * Get current user info
 * Requires Authorization: Bearer <token> header
 */
router.get('/me', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as any;
    const user = authReq.user;

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Unable to get user info',
      message: 'Internal server error'
    });
  }
});

export { router as authRoutes };