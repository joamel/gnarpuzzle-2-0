import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';

vi.mock('../../config/database');

describe('GameStateService - walkover/leaver persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset singleton between tests.
    (GameStateService as any).instance = undefined;
  });

  it('marks player as left instead of deleting, so stats can count walkovers', async () => {
    const dbRun = vi.fn(async () => ({ changes: 1, lastInsertRowid: 0 }));
    const dbAll = vi.fn(async (sql: string) => {
      // Remaining players query should exclude left players.
      if (sql.includes('SELECT user_id, position FROM players') && sql.includes('left_at IS NULL')) {
        return [{ user_id: 2, position: 1 }];
      }
      return [];
    });

    const dbGet = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM games WHERE id')) {
        return {
          id: 99,
          room_id: 7,
          state: 'in_progress',
          current_phase: 'letter_placement',
          current_turn: 1,
        };
      }

      if (sql.includes('SELECT code FROM rooms')) {
        return { code: 'TEST01' };
      }

      if (sql.includes('SELECT username FROM users')) {
        return { username: 'winner' };
      }

      if (sql.includes('SELECT final_score as finalScore')) {
        return { finalScore: 0, wordsFound: '[]' };
      }

      return null;
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({ run: dbRun, all: dbAll, get: dbGet })
    } as any);

    const socketStub = {
      broadcastToRoom: vi.fn(),
    } as any;

    const svc = GameStateService.getInstance(socketStub);
    await svc.handlePlayerLeft(99, 1, true);

    const runSqls = (dbRun.mock.calls as any[]).map((c) => String(c?.[0] ?? ''));
    expect(runSqls.some((sql) => sql.includes('DELETE FROM players'))).toBe(false);
    expect(runSqls.some((sql) => sql.includes('UPDATE players') && sql.includes('left_at'))).toBe(true);

    const allSqls = (dbAll.mock.calls as any[]).map((c) => String(c?.[0] ?? ''));
    expect(allSqls.some((sql) => sql.includes('SELECT user_id, position') && sql.includes('left_at IS NULL'))).toBe(true);
  });
});
