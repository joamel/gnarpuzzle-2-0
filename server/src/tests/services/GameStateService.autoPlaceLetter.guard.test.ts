import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';

vi.mock('../../config/database');

describe('GameStateService - autoPlaceLetter safety guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (GameStateService as any).instance = undefined;
  });

  it('skips auto-placement when placement_confirmed=3 (placed but not confirmed)', async () => {
    const dbRun = vi.fn(async () => ({ changes: 0, lastInsertRowid: 0 }));

    const dbGet = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT * FROM players WHERE game_id')) {
        return {
          id: 1,
          game_id: 99,
          user_id: 123,
          current_letter: 'B',
          placement_confirmed: 3,
          grid_state: JSON.stringify([
            [
              { letter: 'A', x: 0, y: 0 },
              { letter: null, x: 1, y: 0 },
            ],
            [
              { letter: null, x: 0, y: 1 },
              { letter: null, x: 1, y: 1 },
            ],
          ]),
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

    await (svc as any).autoPlaceLetter(99, 123, 'B');

    // Guard should return early and never write.
    expect(dbRun).not.toHaveBeenCalled();
  });
});
