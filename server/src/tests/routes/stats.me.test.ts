import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import statsRoutes from '../../routes/stats';
import { AuthService } from '../../services/AuthService';
import { DatabaseManager } from '../../config/database';

vi.mock('../../services/AuthService');
vi.mock('../../config/database');
vi.mock('../../index', () => ({
  getSocketService: vi.fn(() => null)
}));

describe('Stats Routes - GET /api/stats/me', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', statsRoutes);

  const mockUser = { id: 123, username: 'testuser' };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(AuthService.authenticateToken).mockImplementation(async (req: any, _res: any, next: any) => {
      req.user = mockUser;
      next();
    });
  });

  it('counts wins when DB returns ids/scores as strings (Postgres-safe)', async () => {
    const dbAll = vi.fn(async (sql: string) => {
      // First query: per-user rows for finished/abandoned games (or clearly ended via phase/finished_at)
      if (sql.includes('FROM players p') && sql.includes("g.state IN ('finished', 'abandoned')") && sql.includes('g.finished_at IS NOT NULL')) {
        return [
          {
            gameId: '1',
            score: '0',
            finalScore: '10',
            wordsFound: '[]',
            gameState: 'finished',
            gamePhase: 'finished',
            createdAt: '2026-01-01T00:00:00.000Z',
            finishedAt: '2026-01-01T00:10:00.000Z'
          }
        ];
      }

      // Second query: all players in those games
      if (sql.includes('FROM players') && sql.includes('WHERE game_id IN')) {
        return [
          { gameId: '1', userId: '123', score: '0', finalScore: '10' },
          { gameId: '1', userId: '124', score: '0', finalScore: '7' }
        ];
      }

      return [];
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({
        all: dbAll
      })
    } as any);

    const response = await request(app)
      .get('/api/stats/me')
      .set('Authorization', 'Bearer fake');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.stats).toEqual(
      expect.objectContaining({
        gamesPlayed: 1,
        gamesFinished: 1,
        wins: 1,
        draws: 0,
        losses: 0,
        totalScore: 10,
        bestScore: 10,
        averageScore: 10
      })
    );
  });

  it('counts draws when multiple players share max score', async () => {
    const dbAll = vi.fn(async (sql: string) => {
      if (sql.includes('FROM players p') && sql.includes("g.state IN ('finished', 'abandoned')") && sql.includes('g.finished_at IS NOT NULL')) {
        return [
          {
            gameId: '2',
            score: '0',
            finalScore: '10',
            wordsFound: '[]',
            gameState: 'finished',
            gamePhase: 'finished',
            createdAt: '2026-01-02T00:00:00.000Z',
            finishedAt: '2026-01-02T00:10:00.000Z'
          }
        ];
      }

      if (sql.includes('FROM players') && sql.includes('WHERE game_id IN')) {
        return [
          { gameId: '2', userId: '123', score: '0', finalScore: '10' },
          { gameId: '2', userId: '124', score: '0', finalScore: '10' }
        ];
      }

      return [];
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({
        all: dbAll
      })
    } as any);

    const response = await request(app)
      .get('/api/stats/me')
      .set('Authorization', 'Bearer fake');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.stats).toEqual(
      expect.objectContaining({
        gamesPlayed: 1,
        gamesFinished: 1,
        wins: 0,
        draws: 1,
        losses: 0
      })
    );
  });
});
