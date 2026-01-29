import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';

vi.mock('../../config/database');

describe('GameStateService - placement timeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (GameStateService as any).instance = undefined;
  });

  it('auto-places for players with placement intent (placement_confirmed=2)', async () => {
    const dbRun = vi.fn(async () => ({ changes: 1, lastInsertRowid: 0 }));

    const dbAll = vi.fn(async (sql: string) => {
      if (
        sql.includes('SELECT * FROM players') &&
        sql.includes('placement_confirmed IN (0, 2)')
      ) {
        return [
          {
            id: 123,
            user_id: 1,
            game_id: 99,
            placement_confirmed: 2,
            current_letter: 'A',
            grid_state: JSON.stringify([
              [{ letter: null, x: 0, y: 0 }],
            ]),
          },
        ];
      }
      return [];
    });

    const dbGet = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM games WHERE id')) {
        return {
          id: 99,
          current_phase: 'letter_placement',
          current_turn: 1,
        };
      }
      return null;
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({ run: dbRun, all: dbAll, get: dbGet }),
    } as any);

    const socketStub = {
      broadcastToRoom: vi.fn(),
    } as any;

    const svc = GameStateService.getInstance(socketStub);

    const autoPlaceSpy = vi
      .spyOn(svc as any, 'autoPlaceLetter')
      .mockResolvedValue(undefined);

    const clearTimerSpy = vi
      .spyOn(svc as any, 'clearGameTimer')
      .mockImplementation(() => undefined);

    const advanceSpy = vi
      .spyOn(svc as any, 'advanceToNextTurn')
      .mockResolvedValue(undefined);

    await svc.handlePlacementTimeout(99);

    expect(clearTimerSpy).toHaveBeenCalledWith(99);
    expect(autoPlaceSpy).toHaveBeenCalledWith(99, 1, 'A');

    // Confirms the player batch update is attempted.
    const runSqls = (dbRun.mock.calls as any[]).map((c) => String(c?.[0] ?? ''));
    expect(runSqls.some((sql) => sql.includes('UPDATE players') && sql.includes('placement_confirmed = 1'))).toBe(true);

    expect(advanceSpy).toHaveBeenCalledWith(99);
  });
});
