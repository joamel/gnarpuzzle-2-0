import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';

vi.mock('../../config/database');

describe('GameStateService - confirmPlacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (GameStateService as any).instance = undefined;
  });

  it('rejects confirmPlacement when no placement has been recorded (placement_confirmed != 3)', async () => {
    const dbRun = vi.fn(async () => ({ changes: 0, lastInsertRowid: 0 }));

    const dbGet = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM games WHERE id')) {
        return {
          id: 99,
          current_phase: 'letter_placement',
          current_turn: 1,
        };
      }

      if (sql.includes('SELECT placement_confirmed, current_letter FROM players')) {
        return {
          placement_confirmed: 0,
          current_letter: 'L',
        };
      }

      return null;
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({ run: dbRun, all: vi.fn(), get: dbGet }),
    } as any);

    const socketStub = {
      broadcastToRoom: vi.fn(),
    } as any;

    const svc = GameStateService.getInstance(socketStub);

    await expect(svc.confirmPlacement(99, 1)).rejects.toThrow('No placed letter to confirm');

    // Ensure we did not mark the player as confirmed.
    const runSqls = (dbRun.mock.calls as any[]).map((c) => String(c?.[0] ?? ''));
    expect(runSqls.some((sql) => sql.includes('SET placement_confirmed = 1'))).toBe(false);
  });
});
