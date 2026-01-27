import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { RoomModel } from '../models';
import { DatabaseManager } from '../config/database';
import { UserModel } from '../models/UserModel';

export const adminRoutes = express.Router();

const timingSafeEquals = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const requireAdminKey = (req: express.Request, res: express.Response): boolean => {
  const expectedKey = process.env.ADMIN_API_KEY;

  // If not configured, hide the endpoint.
  if (!expectedKey) {
    res.status(404).json({
      error: 'Not found',
      message: 'Route not found'
    });
    return false;
  }

  const providedKey = req.get('X-Admin-Key') || '';
  if (!providedKey || !timingSafeEquals(providedKey, expectedKey)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid admin key'
    });
    return false;
  }

  return true;
};

adminRoutes.post('/seed', async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  try {
    const { seedDatabase } = await import('../config/seed');
    await seedDatabase();

    // Return a small summary so operators can verify the seed actually
    // created/revived rooms in the same backend the client is using.
    const activeRooms = await RoomModel.getActiveRooms();
    const standardNames = new Set(['Snabbspel 4×4', 'Klassiskt 5×5', 'Utmaning 6×6']);
    const standardRooms = activeRooms
      .filter(r => standardNames.has(String(r.name)))
      .map(r => ({ id: r.id, code: r.code, name: r.name, status: r.status, member_count: r.member_count }));

    res.status(200).json({
      success: true,
      message: 'Seed completed',
      rooms: {
        activeTotal: activeRooms.length,
        standardRooms
      },
      backend: {
        db: process.env.DATABASE_URL ? 'postgres' : 'sqlite'
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Seed failed',
      message: err instanceof Error ? err.message : String(err || '')
    });
  }
});

// GET /api/admin/debug/user/:username/games
// Helps diagnose missing stats in production.
adminRoutes.get('/debug/user/:username/games', async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const username = String(req.params.username || '').trim();
  if (!username) {
    res.status(400).json({
      error: 'Bad request',
      message: 'Username is required'
    });
    return;
  }

  try {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const user = await db.get(
      `SELECT id, username, created_at, password_hash FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1`,
      username
    ) as { id: number; username: string; created_at: string; password_hash: string | null } | undefined;

    if (!user?.id) {
      res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
      return;
    }

    const games = await db.all(
      `
        SELECT
          g.id as gameId,
          g.room_id as roomId,
          g.state as state,
          g.current_phase as currentPhase,
          g.created_at as createdAt,
          g.finished_at as finishedAt,
          p.final_score as finalScore,
          p.words_found as wordsFound
        FROM players p
        JOIN games g ON g.id = p.game_id
        WHERE p.user_id = ?
        ORDER BY COALESCE(g.finished_at, g.created_at) DESC
        LIMIT 10
      `,
      user.id
    ) as Array<{
      gameId: number;
      roomId: number;
      state: string;
      currentPhase: string | null;
      createdAt: string;
      finishedAt: string | null;
      finalScore: number;
      wordsFound: string;
    }>;

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        created_at: user.created_at,
        isGuest: !user.password_hash
      },
      games
    });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : String(err || '')
    });
  }
});

// POST /api/admin/users/:username/password
// Sets/resets a user's password (admin-only). Useful to convert legacy accounts
// into password-protected accounts without losing history/stats.
adminRoutes.post('/users/:username/password', async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const username = String(req.params.username || '').trim();
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

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

  if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
    res.status(400).json({
      error: 'Invalid password',
      message: 'Password must be between 8 and 128 characters'
    });
    return;
  }

  try {
    const user = await UserModel.findByUsername(username);
    if (!user) {
      res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updated = await UserModel.setPasswordHash(user.id, passwordHash);
    if (!updated) {
      res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        isGuest: !updated.password_hash
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : String(err || '')
    });
  }
});
