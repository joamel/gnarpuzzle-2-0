import { describe, it, expect, vi, afterEach } from 'vitest';
import { RoomCleanupService } from '../../services/RoomCleanupService';
import { RoomModel } from '../../models';

describe('RoomCleanupService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does cleanup an empty non-persistent public room when old', async () => {
    vi.spyOn(RoomModel, 'getMemberCount').mockResolvedValue(0);

    const service = new RoomCleanupService();
    const room = {
      id: 123,
      code: 'PUB123',
      name: 'Custom Public Room',
      created_at: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      settings: JSON.stringify({
        grid_size: 4,
        max_players: 4,
        require_password: false
        // is_private intentionally omitted (older rows)
      })
    };

    const shouldCleanup = await (service as any).shouldCleanupRoom(room);
    expect(shouldCleanup).toBe(true);
  });

  it('does cleanup an empty private room when old (is_private missing but require_password=true)', async () => {
    vi.spyOn(RoomModel, 'getMemberCount').mockResolvedValue(0);

    const service = new RoomCleanupService();
    const room = {
      id: 124,
      code: 'PRV123',
      name: 'Privat',
      created_at: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
      settings: JSON.stringify({
        grid_size: 5,
        max_players: 6,
        require_password: true
        // is_private intentionally omitted (older rows)
      })
    };

    const shouldCleanup = await (service as any).shouldCleanupRoom(room);
    expect(shouldCleanup).toBe(true);
  });

  it('does not cleanup persistent rooms', async () => {
    vi.spyOn(RoomModel, 'getMemberCount').mockResolvedValue(0);

    const service = new RoomCleanupService();
    const room = {
      id: 125,
      code: 'SYS123',
      name: 'Klassiskt 5×5',
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      settings: JSON.stringify({
        is_private: true,
        require_password: true,
        is_persistent: true
      })
    };

    const shouldCleanup = await (service as any).shouldCleanupRoom(room);
    expect(shouldCleanup).toBe(false);
  });

  it('does not cleanup seeded standard rooms even if settings are missing', async () => {
    vi.spyOn(RoomModel, 'getMemberCount').mockResolvedValue(0);

    const service = new RoomCleanupService();
    const room = {
      id: 126,
      code: 'STD999',
      name: 'Klassiskt 5×5',
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      settings: null
    };

    const shouldCleanup = await (service as any).shouldCleanupRoom(room);
    expect(shouldCleanup).toBe(false);
  });
});
