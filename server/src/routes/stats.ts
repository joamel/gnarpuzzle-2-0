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
  wins: number;
  draws: number;
  losses: number;
  totalScore: number;
  bestScore: number;
  averageScore: number;
  totalWordsFound: number;
  lastPlayedAt: string | null;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
          p.game_id as "gameId",
          p.score as "score",
          p.final_score as "finalScore",
          p.words_found as "wordsFound",
          g.state as "gameState",
          g.current_phase as "gamePhase",
          g.created_at as "createdAt",
          g.finished_at as "finishedAt"
        FROM players p
        JOIN games g ON g.id = p.game_id
        WHERE p.user_id = ?
          AND (
            g.state IN ('finished', 'abandoned')
            OR g.finished_at IS NOT NULL
            OR g.current_phase = 'finished'
          )
        ORDER BY COALESCE(g.finished_at, g.created_at) DESC
      `,
      user.id
    ) as Array<{
      gameId: number;
      score: number;
      finalScore: number;
      wordsFound: string;
      gameState: string;
      gamePhase: string | null;
      createdAt: string;
      finishedAt: string | null;
    }>;

    const gameIds = new Set<number>();
    let gamesFinished = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let totalScore = 0;
    let bestScore = 0;
    let scoredGames = 0;
    let totalWordsFound = 0;
    let lastPlayedAt: string | null = null;

    for (const row of rows) {
      const gameId = toFiniteNumber(row.gameId);
      if (gameId !== null) gameIds.add(gameId);
      if (row.gameState === 'finished' || row.gamePhase === 'finished' || !!row.finishedAt) {
        // Keep compatibility with older/edge cases where state wasn't updated
        // but the game is clearly over.
        if (row.gameState !== 'abandoned') {
          gamesFinished += 1;
        }
      }

      const score = toFiniteNumber(row.finalScore) ?? toFiniteNumber(row.score) ?? 0;

      totalScore += score;
      scoredGames += 1;
      bestScore = Math.max(bestScore, score);

      const words = safeParseJsonArray(row.wordsFound);
      totalWordsFound += words.length;

      const playedAt = row.finishedAt || row.createdAt;
      if (!lastPlayedAt) lastPlayedAt = playedAt;
    }

    // Calculate W/D/L per game by comparing the user's score to all players in that game.
    if (gameIds.size > 0) {
      const ids = Array.from(gameIds);
      const placeholders = ids.map(() => '?').join(',');

      const allPlayers = await db.all(
        `
          SELECT
            game_id as "gameId",
            user_id as "userId",
            score as "score",
            final_score as "finalScore"
          FROM players
          WHERE game_id IN (${placeholders})
        `,
        ...ids
      ) as Array<{
        gameId: number;
        userId: number;
        score: number;
        finalScore: number;
      }>;

      const byGame = new Map<number, Array<{ userId: number; score: number; finalScore: number }>>();
      for (const p of allPlayers) {
        const gameId = toFiniteNumber(p.gameId);
        const userId = toFiniteNumber(p.userId);
        if (gameId === null || userId === null) continue;

        const list = byGame.get(gameId) || [];
        list.push({
          userId,
          score: toFiniteNumber(p.score) ?? 0,
          finalScore: toFiniteNumber(p.finalScore) ?? 0
        });
        byGame.set(gameId, list);
      }

      for (const [gameId, players] of byGame.entries()) {
        const normalized = players.map(p => {
          const raw = toFiniteNumber(p.finalScore) ?? toFiniteNumber(p.score) ?? 0;
          return {
            userId: p.userId,
            score: Number.isFinite(raw) ? raw : 0
          };
        });

        const myUserId = toFiniteNumber(user.id) ?? user.id;
        const me = normalized.find(p => p.userId === myUserId);
        if (!me) continue;

        const maxScore = normalized.reduce((m, p) => Math.max(m, p.score), 0);
        const maxCount = normalized.filter(p => p.score === maxScore).length;

        if (me.score === maxScore) {
          if (maxCount > 1) draws += 1;
          else wins += 1;
        } else {
          losses += 1;
        }
      }
    }

    const stats: UserStats = {
      gamesPlayed: gameIds.size,
      gamesFinished,
      wins,
      draws,
      losses,
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
    const debugId = `stats_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    statsLogger.error('Error getting personal stats', {
      debugId,
      error: error instanceof Error ? error.message : String(error)
    });

    const includeDetails = process.env.DEBUG_API_ERRORS === 'true';
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get personal statistics',
      debugId,
      ...(includeDetails ? { details: error instanceof Error ? error.message : String(error) } : null)
    });
  }
});

export default router;