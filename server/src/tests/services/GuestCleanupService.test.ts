import { describe, it, expect } from 'vitest';
import { DatabaseManager } from '../../config/database';
import { AuthService } from '../../services/AuthService';
import { GuestCleanupService } from '../../services/GuestCleanupService';
import { UserModel } from '../../models';

describe('GuestCleanupService', () => {
  it('should delete inactive guest user and transfer owned room to another member', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const guestUsername = `guest_owner_${suffix}`;
    const memberUsername = `member_${suffix}`;
    const roomCode = `R${suffix}`.slice(0, 6).toUpperCase();

    // Create guest owner
    let guestUser: any = null;
    const guestRes = {
      status: (_code: number) => guestRes,
      json: (payload: any) => {
        guestUser = payload.user;
      }
    };
    await AuthService.loginOrRegister({ body: { username: guestUsername } } as any, guestRes as any);
    expect(typeof guestUser?.id).toBe('number');

    // Create another user (also guest/legacy is fine for this test)
    let memberUser: any = null;
    const memberRes = {
      status: (_code: number) => memberRes,
      json: (payload: any) => {
        memberUser = payload.user;
      }
    };
    await AuthService.loginOrRegister({ body: { username: memberUsername } } as any, memberRes as any);
    expect(typeof memberUser?.id).toBe('number');

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Create a room owned by the guest
    const roomInsert = await db.run(
      'INSERT INTO rooms (code, name, created_by) VALUES (?, ?, ?)',
      roomCode,
      `Room ${suffix}`,
      guestUser.id
    );
    const roomId = roomInsert.lastInsertRowid as number;

    // Add both users as members (owner + one member)
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', roomId, guestUser.id);
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', roomId, memberUser.id);

    // Make guest inactive enough to be cleaned
    await db.run(
      "UPDATE users SET last_active = datetime('now', '-120 minutes') WHERE id = ?",
      guestUser.id
    );

    const service = new GuestCleanupService({ inactivityMinutes: 60, cleanupIntervalMs: 999999 });
    const result = await service.runOnce();

    expect(result.checkedUsers).toBeGreaterThanOrEqual(1);
    expect(result.cleanedUsers).toBeGreaterThanOrEqual(1);

    // Guest should be deleted
    const deletedGuest = await UserModel.findById(guestUser.id);
    expect(deletedGuest).toBeNull();

    // Room should still exist and ownership should be transferred
    const room = await db.get('SELECT * FROM rooms WHERE id = ?', roomId);
    expect(room).toBeTruthy();
    expect(room.created_by).toBe(memberUser.id);
  });

  it('should delete rooms that have no remaining members when guest owner is cleaned', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const guestUsername = `guest_solo_${suffix}`;
    const roomCode = `S${suffix}`.slice(0, 6).toUpperCase();

    let guestUser: any = null;
    const guestRes = {
      status: (_code: number) => guestRes,
      json: (payload: any) => {
        guestUser = payload.user;
      }
    };
    await AuthService.loginOrRegister({ body: { username: guestUsername } } as any, guestRes as any);
    expect(typeof guestUser?.id).toBe('number');

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const privateSettings = JSON.stringify({
      grid_size: 5,
      max_players: 6,
      is_private: true,
      require_password: true
    });

    const roomInsert = await db.run(
      'INSERT INTO rooms (code, name, created_by, settings) VALUES (?, ?, ?, ?)',
      roomCode,
      `Solo ${suffix}`,
      guestUser.id,
      privateSettings
    );
    const roomId = roomInsert.lastInsertRowid as number;

    // Only the guest is a member
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', roomId, guestUser.id);

    await db.run(
      "UPDATE users SET last_active = datetime('now', '-120 minutes') WHERE id = ?",
      guestUser.id
    );

    const service = new GuestCleanupService({ inactivityMinutes: 60, cleanupIntervalMs: 999999 });
    const result = await service.runOnce();

    expect(result.cleanedUsers).toBeGreaterThanOrEqual(1);

    const deletedGuest = await UserModel.findById(guestUser.id);
    expect(deletedGuest).toBeNull();

    const room = await db.get('SELECT * FROM rooms WHERE id = ?', roomId);
    expect(room).toBeNull();
  });

  it('should not delete persistent rooms when guest owner is cleaned (transfer to system user)', async () => {
    const suffix = Math.random().toString(36).slice(2, 8);
    const guestUsername = `guest_persist_${suffix}`;
    const roomCode = `P${suffix}`.slice(0, 6).toUpperCase();

    let guestUser: any = null;
    const guestRes = {
      status: (_code: number) => guestRes,
      json: (payload: any) => {
        guestUser = payload.user;
      }
    };
    await AuthService.loginOrRegister({ body: { username: guestUsername } } as any, guestRes as any);
    expect(typeof guestUser?.id).toBe('number');

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const settings = JSON.stringify({
      grid_size: 5,
      max_players: 6,
      is_private: false,
      require_password: false,
      is_persistent: true
    });

    const roomInsert = await db.run(
      'INSERT INTO rooms (code, name, created_by, settings) VALUES (?, ?, ?, ?)',
      roomCode,
      `Persistent ${suffix}`,
      guestUser.id,
      settings
    );
    const roomId = roomInsert.lastInsertRowid as number;

    // Guest is the only member (or none) - this should NOT delete the room due to persistence.
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', roomId, guestUser.id);

    await db.run(
      "UPDATE users SET last_active = datetime('now', '-120 minutes') WHERE id = ?",
      guestUser.id
    );

    const service = new GuestCleanupService({ inactivityMinutes: 60, cleanupIntervalMs: 999999 });
    const result = await service.runOnce();

    expect(result.cleanedUsers).toBeGreaterThanOrEqual(1);

    const deletedGuest = await UserModel.findById(guestUser.id);
    expect(deletedGuest).toBeNull();

    const room = await db.get('SELECT id, created_by, settings FROM rooms WHERE id = ?', roomId);
    expect(room).toBeTruthy();

    const systemUser = await UserModel.findByUsername('gnar_system');
    expect(systemUser).toBeTruthy();
    expect(room.created_by).toBe(systemUser!.id);
  });
});
