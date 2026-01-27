import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import statsRoutes from '../../routes/stats';
import { DatabaseManager } from '../../config/database';

vi.mock('../../config/database');
vi.mock('../../index', () => ({
  getSocketService: vi.fn(() => null)
}));

describe('Stats Routes - GET /api/stats/leaderboard', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', statsRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a top-10 style leaderboard with W/D/L (Postgres-safe string numbers)', async () => {
    const dbAll = vi.fn(async (sql: string) => {
      // 1) Top users query
      if (sql.includes('GROUP BY p.user_id') && sql.includes('LIMIT 10')) {
        return [
          {
            userId: '123',
            username: 'alice',
            gamesPlayed: '2',
            totalScore: '30',
            bestScore: '20',
            averageScore: '15',
            lastPlayedAt: '2026-01-27T10:00:00.000Z'
          },
          {
            userId: '124',
            username: 'bob',
            gamesPlayed: '2',
            totalScore: '28',
            bestScore: '18',
            averageScore: '14',
            lastPlayedAt: '2026-01-27T09:00:00.000Z'
          }
        ];
      }

      // 2) W/D/L query (window functions)
      if (sql.includes('WITH ps AS') && sql.includes('maxCount')) {
        return [
          { userId: '123', wins: '2', draws: '0', losses: '0' },
          { userId: '124', wins: '0', draws: '0', losses: '2' }
        ];
      }

      // 3) Words found query
      if (sql.includes('p.words_found') && sql.includes('FROM players p') && sql.includes('p.user_id IN')) {
        return [
          { userId: '123', wordsFound: '[{"word":"A","points":1}]' },
          { userId: '123', wordsFound: '[]' },
          { userId: '124', wordsFound: '[]' },
          { userId: '124', wordsFound: '[{"word":"B","points":2},{"word":"C","points":3}]' }
        ];
      }

      return [];
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({
        all: dbAll
      })
    } as any);

    const res = await request(app).get('/api/stats/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(Array.isArray(res.body?.leaderboard)).toBe(true);

    const [first, second] = res.body.leaderboard;
    expect(first).toEqual(
      expect.objectContaining({
        rank: 1,
        userId: 123,
        username: 'alice',
        gamesPlayed: 2,
        wins: 2,
        draws: 0,
        losses: 0,
        totalScore: 30,
        bestScore: 20,
        averageScore: 15,
        totalWordsFound: 1
      })
    );

    expect(second).toEqual(
      expect.objectContaining({
        rank: 2,
        userId: 124,
        username: 'bob',
        gamesPlayed: 2,
        wins: 0,
        losses: 2,
        totalScore: 28,
        totalWordsFound: 2
      })
    );
  });
});
