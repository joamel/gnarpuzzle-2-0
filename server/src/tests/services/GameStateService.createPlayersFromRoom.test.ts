import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { GameStateService } from '../../services/GameStateService';
import { DatabaseManager } from '../../config/database';
import { SocketService } from '../../services/SocketService';

vi.mock('../../config/database');

const mockSocketService = {
  broadcastToRoom: vi.fn(),
  emitToGame: vi.fn(),
  emitToRoom: vi.fn(),
  emitToUser: vi.fn()
} as unknown as SocketService;

describe('GameStateService - createPlayersFromRoom', () => {
  let gameStateService: GameStateService;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    gameStateService = GameStateService.getInstance(mockSocketService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts ready_to_start as 1/0 (SQLite-safe binding)', async () => {
    const dbAll = vi.fn(async () => [
      { user_id: 10, joined_at: '2026-01-01T00:00:00.000Z' },
      { user_id: 11, joined_at: '2026-01-01T00:01:00.000Z' }
    ]);

    const dbRun = vi.fn(async (_sql: string, ...params: any[]) => {
      return { changes: 1, lastInsertRowid: 1, params } as any;
    });

    vi.mocked(DatabaseManager.getInstance).mockResolvedValue({
      getDatabase: () => ({
        all: dbAll,
        run: dbRun
      })
    } as any);

    await (gameStateService as any).createPlayersFromRoom(123, 456);

    const insertCalls = dbRun.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO players'));
    expect(insertCalls.length).toBe(2);

    for (const [, ...callParams] of insertCalls) {
      // Signature: run(sql, gameId, userId, position, score, board_state, words_found,
      //                ready_to_start, grid_state, current_letter, placement_confirmed, final_score)
      const readyToStart = callParams[6];
      expect(readyToStart).toBe(1);
    }
  });
});
