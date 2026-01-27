import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database');

// Make scoring deterministic and independent of the real dictionary.
vi.mock('../../services/WordValidationService', () => {
  const svc = {
    isReady: vi.fn(() => true),
    loadDictionary: vi.fn(async () => undefined),
    calculateGridScore: vi.fn((grid: any) => {
      const first = grid?.[0]?.[0]?.letter;
      const pts = first === 'L' ? 4 : first === 'W' ? 2 : 0;
      return {
        totalPoints: pts,
        words: pts > 0 ? [{ word: 'X', points: pts }] : [],
        completedRows: 0,
        completedCols: 0
      };
    })
  };

  return {
    WordValidationService: {
      getInstance: () => svc
    }
  };
});

import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';

describe('GameStateService - walkover scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (GameStateService as any).instance = undefined;
  });

  it('sets leaver score to 0 when game ends from walkover', async () => {
    const gameId = 99;
    const leavingUserId = 1;

    const gridLeaver = JSON.stringify([[{ x: 0, y: 0, letter: 'L' }]]);
    const gridWinner = JSON.stringify([[{ x: 0, y: 0, letter: 'W' }]]);

    const dbRun = vi.fn(async () => ({ changes: 1, lastInsertRowid: 0 }));

    const dbGet = vi.fn(async (sql: string, ...params: any[]) => {
      if (sql.includes('SELECT * FROM games WHERE id')) {
        return {
          id: gameId,
          room_id: 7,
          state: 'in_progress',
          current_phase: 'letter_placement',
          current_turn: leavingUserId,
        };
      }

      if (sql.includes('SELECT id, code, board_size FROM rooms')) {
        return { id: 7, code: 'TEST01', board_size: 5 };
      }

      if (sql.includes('SELECT code FROM rooms')) {
        return { code: 'TEST01' };
      }

      if (sql.includes('SELECT username FROM users')) {
        const userId = Number(params[0]);
        return { username: userId === leavingUserId ? 'leaver' : 'winner' };
      }

      if (sql.includes('SELECT final_score as finalScore')) {
        return { finalScore: 0, wordsFound: '[]' };
      }

      if (sql.includes('SELECT grid_state FROM players')) {
        const userId = Number(params[1]);
        return { grid_state: userId === leavingUserId ? gridLeaver : gridWinner };
      }

      return null;
    });

    const dbAll = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT user_id, position FROM players') && sql.includes('left_at IS NULL')) {
        // After leaver leaves, only the winner remains.
        return [{ user_id: 2, position: 1 }];
      }

      if (sql.includes('SELECT user_id, grid_state FROM players') && sql.includes('WHERE game_id = ?')) {
        // calculateAllPlayerScores should consider both players (including the leaver).
        return [
          { user_id: leavingUserId, grid_state: gridLeaver },
          { user_id: 2, grid_state: gridWinner }
        ];
      }

      if (sql.includes('SELECT p.user_id, u.username, p.final_score')) {
        // The service will broadcast leaderboard from DB rows; exact ordering isn't important for this test.
        return [
          { user_id: 2, username: 'winner', final_score: 2, grid_state: gridWinner, words_found: '[{"word":"X","points":2}]' },
          { user_id: leavingUserId, username: 'leaver', final_score: 0, grid_state: gridLeaver, words_found: '[]' }
        ];
      }

      return [];
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({ run: dbRun, get: dbGet, all: dbAll })
    } as any);

    const socketStub = {
      broadcastToRoom: vi.fn(),
      clearRoomReadyStatus: vi.fn(),
      emitToRoom: vi.fn()
    } as any;

    const svc = GameStateService.getInstance(socketStub);
    await svc.handlePlayerLeft(gameId, leavingUserId, true);

    // Ensure we did NOT delete leaver.
    const runSqls = (dbRun.mock.calls as any[]).map((c) => String(c?.[0] ?? ''));
    expect(runSqls.some((sql) => sql.includes('DELETE FROM players'))).toBe(false);

    // Leaver should be forced to 0 points at walkover end.
    const scoreUpdateCall = (dbRun.mock.calls as any[]).find((c) => {
      const sql = String(c?.[0] ?? '');
      return sql.includes('UPDATE players') && sql.includes('SET final_score = 0') && c?.[2] === gameId && c?.[3] === leavingUserId;
    });
    expect(scoreUpdateCall).toBeTruthy();

    // Broadcast should include a leaderboard with both players.
    const endedCalls = (socketStub.broadcastToRoom as any).mock.calls.filter((c: any[]) => c?.[1] === 'game:ended');
    expect(endedCalls.length).toBeGreaterThan(0);

    const payload = endedCalls[0]?.[2];
    expect(Array.isArray(payload?.leaderboard)).toBe(true);
    expect(payload.leaderboard.length).toBeGreaterThanOrEqual(2);
  });
});
