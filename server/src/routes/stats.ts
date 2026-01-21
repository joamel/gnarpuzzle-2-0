import express from 'express';
import { getSocketService } from '../index';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { DatabaseManager } from '../config/database';
import { createCategoryLogger } from '../utils/logger';

const statsLogger = createCategoryLogger('STATS');

const router = express.Router();

type UserStats = {
  gamesPlayed: number;
  gamesFinished: number;
  totalScore: number;
  bestScore: number;
  averageScore: number;
  totalWordsFound: number;
  lastPlayedAt: string | null;
};

const safeParseJsonArray = (value: unknown): any[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * GET /api/stats/online
 * Get current online users count
 */
router.get('/online', (req, res) => {
  try {
    const socketService = getSocketService();
    
    if (!socketService) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Socket service not available'
      });
      return;
    }

    // Get connected users from socket service
    const connectedUsers = (socketService as any).connectedUsers || new Map();
    const onlineCount = connectedUsers.size;
    
    // Get authenticated users count (users with userId)
    const authenticatedUsers = Array.from(connectedUsers.values())
      .filter((userData: any) => userData.userId)
      .length;

    res.status(200).json({
      success: true,
      online: {
        total: onlineCount,
        authenticated: authenticatedUsers,
        anonymous: onlineCount - authenticatedUsers
      }
    });

  } catch (error) {
    statsLogger.error('Error getting online stats', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get online statistics'
    });
  }
});

/**
 * GET /api/stats/summary
 * Get general game statistics
 */
router.get('/summary', async (req, res) => {
  try {
    const socketService = getSocketService();
    
    if (!socketService) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Socket service not available'
      });
      return;
    }

    // Get connected users
    const connectedUsers = (socketService as any).connectedUsers || new Map();
    const onlineCount = connectedUsers.size;
    const authenticatedUsers = Array.from(connectedUsers.values())
      .filter((userData: any) => userData.userId)
      .length;

    // Get room statistics
    const roomStats = (socketService as any).roomPlayerReadyStatus || new Map();
    const activeRooms = roomStats.size;

    res.status(200).json({
      success: true,
      stats: {
        online: {
          total: onlineCount,
          authenticated: authenticatedUsers,
          anonymous: onlineCount - authenticatedUsers
        },
        rooms: {
          active: activeRooms
        }
      }
    });

  } catch (error) {
    statsLogger.error('Error getting game stats', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get game statistics'
    });
  }
});

/**
 * GET /api/stats/me
 * Get personal statistics for the authenticated user
 */
router.get('/me', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = authReq.user;

    if (!user) {
      res.status(401).json({
        error: 'Access denied',
        message: 'Authorization token required'
      });
      return;
    }

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const rows = await db.all(
      `
        SELECT
          p.game_id as gameId,
          p.score as score,
          p.final_score as finalScore,
          p.words_found as wordsFound,
          g.state as gameState,
          g.created_at as createdAt,
          g.finished_at as finishedAt
        FROM players p
        JOIN games g ON g.id = p.game_id
        WHERE p.user_id = ?
          AND g.state IN ('finished', 'abandoned')
        ORDER BY COALESCE(g.finished_at, g.created_at) DESC
      `,
      user.id
    ) as Array<{
      gameId: number;
      score: number;
      finalScore: number;
      wordsFound: string;
      gameState: 'finished' | 'abandoned';
      createdAt: string;
      finishedAt: string | null;
    }>;

    const gameIds = new Set<number>();
    let gamesFinished = 0;
    let totalScore = 0;
    let bestScore = 0;
    let scoredGames = 0;
    let totalWordsFound = 0;
    let lastPlayedAt: string | null = null;

    for (const row of rows) {
      gameIds.add(row.gameId);
      if (row.gameState === 'finished') gamesFinished += 1;

      const score = Number.isFinite(row.finalScore) && row.finalScore > 0
        ? row.finalScore
        : row.score;

      totalScore += score;
      scoredGames += 1;
      bestScore = Math.max(bestScore, score);

      const words = safeParseJsonArray(row.wordsFound);
      totalWordsFound += words.length;

      const playedAt = row.finishedAt || row.createdAt;
      if (!lastPlayedAt) lastPlayedAt = playedAt;
    }

    const stats: UserStats = {
      gamesPlayed: gameIds.size,
      gamesFinished,
      totalScore,
      bestScore,
      averageScore: scoredGames > 0 ? Math.round((totalScore / scoredGames) * 10) / 10 : 0,
      totalWordsFound,
      lastPlayedAt
    };

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username
      },
      stats
    });
  } catch (error) {
    statsLogger.error('Error getting personal stats', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get personal statistics'
    });
  }
});

export default router;