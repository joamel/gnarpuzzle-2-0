import express from 'express';
import { AuthService } from '../services/AuthService';
import { UserModel } from '../models/UserModel';

const router = express.Router();

/**
 * POST /api/auth/login
 * Password-based login endpoint
 */
router.post('/login', AuthService.loginWithPassword);

/**
 * POST /api/auth/register
 * Password-based registration endpoint
 */
router.post('/register', AuthService.registerWithPassword);

/**
 * POST /api/auth/guest
 * Legacy username-only login (insecure)
 */
router.post('/guest', AuthService.loginOrRegister);

/**
 * POST /api/auth/refresh  
 * Refresh JWT token
 * Requires Authorization: Bearer <token> header
 */
router.post('/refresh', AuthService.refreshToken);

/**
 * PUT /api/auth/username
 * Rename current user (preserves userId)
 * Requires Authorization: Bearer <token> header
 */
router.put('/username', AuthService.authenticateToken, AuthService.renameUsername);

/**
 * PUT /api/auth/password
 * Change password for current user
 * Requires Authorization: Bearer <token> header
 */
router.put('/password', AuthService.authenticateToken, AuthService.changePassword);

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

    const fullUser = await UserModel.findById(user.id);
    if (!fullUser) {
      res.status(401).json({
        error: 'User not found',
        message: 'User associated with token no longer exists. Please log in again.'
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: fullUser.id,
        username: fullUser.username,
        created_at: fullUser.created_at,
        last_active: fullUser.last_active,
        isGuest: !fullUser.password_hash
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