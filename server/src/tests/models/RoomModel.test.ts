import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomModel } from '../../models/RoomModel';

// Mock database module with factory function
vi.mock('../../config/database', () => {
  const mockDb = {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(),
    query: vi.fn()
  };
  
  return {
    DatabaseManager: {
      getInstance: vi.fn().mockResolvedValue({
        getDatabase: vi.fn().mockReturnValue(mockDb)
      })
    },
    db: mockDb
  };
});

// Get the mock db reference
let mockDb: any;

describe('RoomModel', () => {
  beforeEach(async () => {
    // Get fresh mock reference
    const { DatabaseManager } = await import('../../config/database');
    const dbManager = await DatabaseManager.getInstance();
    mockDb = dbManager.getDatabase();
    
    // Reset all mock implementations
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('should create a room and auto-join creator', async () => {
      // Mock database responses
      mockDb.get.mockResolvedValueOnce(null); // Room code doesn't exist
      mockDb.run.mockResolvedValueOnce({ lastInsertRowid: 1, changes: 1 }); // Room created
      mockDb.get.mockResolvedValueOnce({ // Room found by ID
        id: 1,
        code: 'TEST01',
        name: 'Test Room',
        created_by: 123,
        max_players: 4,
        board_size: 4,
        status: 'waiting'
      });
      mockDb.run.mockResolvedValueOnce({ lastInsertRowid: 2, changes: 1 }); // Member added
      mockDb.get.mockResolvedValueOnce({ count: 1 }); // Member count

      const roomData = {
        name: 'Test Room',
        created_by: 123,
        max_players: 4,
        board_size: 4
      };

      const result = await RoomModel.create(roomData);

      // Verify room creation
      expect(result).toBeDefined();
      expect(result.name).toBe('Test Room');
      expect(result.created_by).toBe(123);

      // Verify auto-join was called
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO room_members'),
        1, 123
      );
    });

    it('should generate unique room codes', async () => {
      // Mock first code exists, second doesn't
      mockDb.get
        .mockResolvedValueOnce({ id: 1 }) // First code exists
        .mockResolvedValueOnce(null) // Second code doesn't exist
        .mockResolvedValueOnce({ id: 2, code: 'TEST02' }); // Return created room

      mockDb.run.mockResolvedValue({ lastInsertRowid: 2, changes: 1 });
      mockDb.get.mockResolvedValueOnce({ count: 1 }); // Member count

      const roomData = {
        name: 'Test Room',
        created_by: 123
      };

      await RoomModel.create(roomData);

      // Should check for code collision and generate new one
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM rooms WHERE code = ?'),
        expect.any(String)
      );
    });
  });

  describe('addMember', () => {
    it('should add member successfully', async () => {
      mockDb.run.mockResolvedValueOnce({ lastInsertRowid: 1, changes: 1 });

      const result = await RoomModel.addMember(1, 123);

      expect(result).toBe(true);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO room_members'),
        1, 123
      );
    });

    it('should handle duplicate member (unique constraint)', async () => {
      mockDb.run.mockRejectedValueOnce(new Error('UNIQUE constraint failed'));

      const result = await RoomModel.addMember(1, 123);

      expect(result).toBe(false);
    });

    it('should return false when no changes made', async () => {
      mockDb.run.mockResolvedValueOnce({ lastInsertRowid: 0, changes: 0 });

      const result = await RoomModel.addMember(1, 123);

      expect(result).toBe(false);
    });
  });

  describe('isUserInRoom', () => {
    it('should return true when user is in room', async () => {
      mockDb.get.mockResolvedValueOnce({ '1': 1 });

      const result = await RoomModel.isUserInRoom(1, 123);

      expect(result).toBe(true);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT 1 FROM room_members'),
        1, 123
      );
    });

    it('should return false when user is not in room', async () => {
      mockDb.get.mockResolvedValueOnce(null);

      const result = await RoomModel.isUserInRoom(1, 123);

      expect(result).toBe(false);
    });
  });

  describe('getRoomMembers', () => {
    it('should return list of room members', async () => {
      const mockMembers = [
        { id: 1, username: 'Player1' },
        { id: 2, username: 'Player2' }
      ];
      mockDb.all.mockResolvedValueOnce(mockMembers);

      const result = await RoomModel.getRoomMembers(1);

      expect(result).toEqual(mockMembers);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT u.*'),
        1
      );
    });

    it('should return empty array when no members', async () => {
      mockDb.all.mockResolvedValueOnce([]);

      const result = await RoomModel.getRoomMembers(1);

      expect(result).toEqual([]);
    });
  });

  describe('getMemberCount', () => {
    it('should return correct member count', async () => {
      mockDb.get.mockResolvedValueOnce({ count: 3 });

      const result = await RoomModel.getMemberCount(1);

      expect(result).toBe(3);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        1
      );
    });

    it('should return 0 when no members', async () => {
      mockDb.get.mockResolvedValueOnce({ count: 0 });

      const result = await RoomModel.getMemberCount(1);

      expect(result).toBe(0);
    });
  });

  describe('findByCode', () => {
    it('should find room by code with members', async () => {
      const mockRoom = {
        id: 1,
        code: 'TEST01',
        name: 'Test Room',
        status: 'waiting'
      };
      const mockMembers = [{ id: 1, username: 'Player1' }];

      mockDb.get.mockResolvedValueOnce(mockRoom);
      mockDb.all.mockResolvedValueOnce(mockMembers);

      const result = await RoomModel.findByCode('TEST01');

      expect(result).toEqual({
        ...mockRoom,
        members: mockMembers
      });
    });

    it('should return null when room not found', async () => {
      mockDb.get.mockResolvedValueOnce(null);

      const result = await RoomModel.findByCode('NOTFOUND');

      expect(result).toBeNull();
    });
  });

  describe('getActiveRooms', () => {
    it('should return active rooms with member counts', async () => {
      const mockRooms = [
        { id: 1, name: 'Room 1', status: 'waiting' },
        { id: 2, name: 'Room 2', status: 'in_game' }
      ];

      mockDb.all.mockResolvedValueOnce(mockRooms);

      const result = await RoomModel.getActiveRooms();

      expect(result).toEqual(mockRooms);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        expect.arrayContaining(['waiting', 'in_game'])
      );
    });
  });
});