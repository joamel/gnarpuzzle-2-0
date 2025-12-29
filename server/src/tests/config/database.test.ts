import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseManager } from '../../config/database';

describe('Mock Database', () => {
  let dbManager: DatabaseManager;
  let db: any;

  beforeEach(async () => {
    dbManager = await DatabaseManager.getInstance();
    db = dbManager.getDatabase();
  });

  describe('User Operations', () => {
    it('should create users with sequential IDs', async () => {
      const result1 = await db.run('INSERT INTO users (username) VALUES (?)', 'user1');
      const result2 = await db.run('INSERT INTO users (username) VALUES (?)', 'user2');

      expect(result1.lastInsertRowid).toBe(1);
      expect(result2.lastInsertRowid).toBe(2);
      expect(result1.changes).toBe(1);
      expect(result2.changes).toBe(1);
    });

    it('should retrieve users by ID', async () => {
      const insertResult = await db.run('INSERT INTO users (username) VALUES (?)', 'testuser');
      const userId = insertResult.lastInsertRowid;

      const user = await db.get('SELECT * FROM users WHERE id = ?', userId);

      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
      expect(user.username).toBe('testuser');
      expect(user.created_at).toBeDefined();
      expect(user.last_active).toBeDefined();
    });

    it('should retrieve users by username', async () => {
      await db.run('INSERT INTO users (username) VALUES (?)', 'searchuser');

      const user = await db.get('SELECT * FROM users WHERE username = ?', 'searchuser');

      expect(user).toBeDefined();
      expect(user.username).toBe('searchuser');
    });

    it('should return null for non-existent users', async () => {
      const user = await db.get('SELECT * FROM users WHERE id = ?', 999);
      expect(user).toBeNull();

      const userByName = await db.get('SELECT * FROM users WHERE username = ?', 'nonexistent');
      expect(userByName).toBeNull();
    });
  });

  describe('Room Operations', () => {
    it('should create rooms with correct data', async () => {
      const roomData = [
        'ABC123',      // code
        'Test Room',   // name
        1,             // created_by
        4,             // max_players
        4,             // board_size
        30,            // turn_duration
        '{}'           // settings
      ];

      const result = await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', ...roomData);

      expect(result.lastInsertRowid).toBeDefined();
      expect(result.changes).toBe(1);

      const room = await db.get('SELECT * FROM rooms WHERE id = ?', result.lastInsertRowid);
      expect(room).toBeDefined();
      expect(room.code).toBe('ABC123');
      expect(room.name).toBe('Test Room');
      expect(room.max_players).toBe(4);
      expect(room.board_size).toBe(4);
    });

    it('should retrieve rooms by code', async () => {
      const roomData = ['XYZ789', 'Code Room', 1, 4, 4, 30, '{}'];
      await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', ...roomData);

      const room = await db.get('SELECT * FROM rooms WHERE code = ?', 'XYZ789');

      expect(room).toBeDefined();
      expect(room.code).toBe('XYZ789');
      expect(room.name).toBe('Code Room');
    });

    it('should return active rooms list', async () => {
      // Create multiple rooms
      await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', 'ROOM1', 'Room 1', 1, 4, 4, 30, '{}');
      await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', 'ROOM2', 'Room 2', 1, 6, 5, 45, '{}');

      const rooms = await db.all('SELECT r.*, COUNT(rm.user_id) as member_count FROM rooms r LEFT JOIN room_members rm ON r.id = rm.room_id GROUP BY r.id');

      // Mock database accumulates rooms from previous tests, so check for at least 2
      expect(rooms.length).toBeGreaterThanOrEqual(2);
      // Find our specific rooms
      const room1 = rooms.find(r => r.code === 'ROOM1');
      const room2 = rooms.find(r => r.code === 'ROOM2'); 
      expect(room1).toMatchObject({
        code: 'ROOM1',
        name: 'Room 1'
      });
      expect(room2).toMatchObject({
        code: 'ROOM2',
        name: 'Room 2'
      });
    });
  });

  describe('Room Member Operations', () => {
    beforeEach(async () => {
      // Create test user and room
      await db.run('INSERT INTO users (username) VALUES (?)', 'testuser');
      await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', 'TEST01', 'Test Room', 1, 4, 4, 30, '{}');
    });

    it('should add room members', async () => {
      const result = await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', 1, 1);

      expect(result.changes).toBe(1);
    });

    it('should check room member existence', async () => {
      await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', 1, 1);

      const exists = await db.get('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', 1, 1);
      const notExists = await db.get('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?', 1, 999);

      expect(exists).toBeTruthy(); // Mock returns data when member exists
      expect(notExists).toBeNull(); // Mock returns null when member doesn't exist
    });

    it('should count room members', async () => {
      await db.run('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)', 1, 1);

      const count = await db.get('SELECT COUNT(*) as count FROM room_members WHERE room_id = ?', 1);

      expect(count).toMatchObject({ count: 1 });
    });
  });

  describe('Database Consistency', () => {
    it('should maintain sequential ID generation', async () => {
      const userResult1 = await db.run('INSERT INTO users (username) VALUES (?)', 'user1');
      const roomResult1 = await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', 'ROOM1', 'Room 1', 1, 4, 4, 30, '{}');
      const userResult2 = await db.run('INSERT INTO users (username) VALUES (?)', 'user2');
      const roomResult2 = await db.run('INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) VALUES (?, ?, ?, ?, ?, ?, ?)', 'ROOM2', 'Room 2', 2, 4, 4, 30, '{}');

      // Mock database maintains global counter, so IDs continue from previous tests
      expect(userResult1.lastInsertRowid).toBeGreaterThan(0);
      expect(roomResult1.lastInsertRowid).toBeGreaterThan(0);
      expect(userResult2.lastInsertRowid).toBeGreaterThan(userResult1.lastInsertRowid);
      expect(roomResult2.lastInsertRowid).toBeGreaterThan(roomResult1.lastInsertRowid);
    });

    it('should handle UPDATE queries', async () => {
      await db.run('INSERT INTO users (username) VALUES (?)', 'updateuser');

      const result = await db.run('UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?', 1);

      expect(result.changes).toBe(1);
    });
  });
});