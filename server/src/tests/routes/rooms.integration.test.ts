import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { roomRoutes } from '../../routes/rooms';
import { RoomModel } from '../../models/RoomModel';
import { GameModel } from '../../models/GameModel';
import { AuthService } from '../../services/AuthService';
import { GameStateService } from '../../services/GameStateService';

// Mock dependencies
vi.mock('../../models/RoomModel');
vi.mock('../../services/AuthService');
const mockStartGame = vi.fn().mockResolvedValue({
  id: 1,
  room_id: 1,
  state: 'starting',
  current_phase: 'letter_selection',
  phase_timer_end: Date.now() + 10000
});
const mockHandlePlayerLeft = vi.fn().mockResolvedValue(undefined);
const mockSocketService = {
  emitToRoom: vi.fn(),
  broadcastToRoom: vi.fn(),
  joinPlayersToGame: vi.fn(),
  roomPlayerReadyStatus: new Map<string, Set<string>>(),
  io: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }
};

vi.mock('../../services/GameStateService', () => ({
  GameStateService: {
    getInstance: vi.fn(() => ({
      startGame: mockStartGame,
      handlePlayerLeft: mockHandlePlayerLeft
    }))
  }
}));

vi.mock('../../index', () => ({
  getSocketService: vi.fn(() => mockSocketService)
}));

vi.mock('../../models/GameModel');

const app = express();
app.use(express.json());
app.use('/api/rooms', roomRoutes);

describe('Room Routes - Start Game Integration', () => {
  const mockUser = { id: 123, username: 'testuser' };
  
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock AuthService.authenticateToken to add user to request
    vi.mocked(AuthService.authenticateToken).mockImplementation(async (req: any, res: any, next: any) => {
      req.user = mockUser;
      next();
    });
  });

  describe('POST /api/rooms/:id/start', () => {
    const mockRoom = {
      id: 1,
      code: 'TEST01',
      name: 'Test Room',
      created_by: 123,
      max_players: 6,
      board_size: 5,
      turn_duration: 15,
      status: 'waiting' as const,
      settings: {
        grid_size: 5,
        max_players: 6,
        letter_timer: 10,
        placement_timer: 15,
        is_private: false
      },
      created_at: '2025-01-01T00:00:00.000Z'
    };

    it('should start game successfully as room creator', async () => {
      const mockMembers = [
        { id: 123, username: 'testuser', created_at: '2025-01-01T00:00:00.000Z', last_active: '2025-01-01T00:00:00.000Z' },
        { id: 124, username: 'player2', created_at: '2025-01-01T00:00:00.000Z', last_active: '2025-01-01T00:00:00.000Z' }
      ];

      vi.mocked(RoomModel.findById).mockResolvedValueOnce(mockRoom);
      vi.mocked(RoomModel.getRoomMembers).mockResolvedValueOnce(mockMembers);
      vi.mocked(RoomModel.updateStatus).mockResolvedValueOnce(true);

      const response = await request(app)
        .post('/api/rooms/1/start');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Game started successfully');
      expect(response.body.game).toBeDefined();
    });

    it('should reject start game if not room creator', async () => {
      const notOwnerRoom = { ...mockRoom, created_by: 999 };
      vi.mocked(RoomModel.findById).mockResolvedValueOnce(notOwnerRoom);

      const response = await request(app)
        .post('/api/rooms/1/start');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Unauthorized');
      expect(response.body.message).toBe('Only room creator can start the game');
    });

    it('should reject start game with insufficient players', async () => {
      const mockMembersOne = [{ id: 123, username: 'testuser', created_at: '2025-01-01T00:00:00.000Z', last_active: '2025-01-01T00:00:00.000Z' }];

      vi.mocked(RoomModel.findById).mockResolvedValueOnce(mockRoom);
      vi.mocked(RoomModel.getRoomMembers).mockResolvedValueOnce(mockMembersOne);

      const response = await request(app)
        .post('/api/rooms/1/start');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient players');
      expect(response.body.message).toBe('At least 2 players required to start game (current: 1)');
    });

    it('should reject start game if room not in waiting status', async () => {
      const playingRoom = { ...mockRoom, status: 'playing' as const };
      vi.mocked(RoomModel.findById).mockResolvedValueOnce(playingRoom);

      const response = await request(app)
        .post('/api/rooms/1/start');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid room state');
      expect(response.body.message).toBe('Game can only be started from waiting state');
    });

    it('should handle room not found', async () => {
      vi.mocked(RoomModel.findById).mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/rooms/999/start');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Room not found');
      expect(response.body.message).toBe('Room does not exist');
    });

    it('should handle invalid room ID', async () => {
      const response = await request(app)
        .post('/api/rooms/invalid/start');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid room ID');
      expect(response.body.message).toBe('Room ID must be a valid number');
    });
  });

  describe('DELETE /api/rooms/:code/leave', () => {
    const room = {
      id: 1,
      code: 'TEST01',
      name: 'Test Room',
      created_by: 123,
      max_players: 6,
      board_size: 5,
      turn_duration: 15,
      status: 'playing' as const,
      settings: {
        grid_size: 5,
        max_players: 6,
        letter_timer: 10,
        placement_timer: 15,
        is_private: false
      },
      created_at: '2025-01-01T00:00:00.000Z'
    };

    it('should immediately remove player and invoke game handler on intentional leave', async () => {
      const readySet = new Set<string>(['123']);
      mockSocketService.roomPlayerReadyStatus.set(room.code, readySet);

      vi.mocked(RoomModel.findByCode).mockResolvedValueOnce(room as any);
      vi.mocked(GameModel.findByRoomId).mockResolvedValueOnce({
        id: 99,
        state: 'active',
        current_phase: 'letter_selection',
        current_turn: 123,
        phase_timer_end: Date.now() + 10000
      } as any);
      vi.mocked(RoomModel.removeMember).mockResolvedValueOnce(true);
      vi.mocked(RoomModel.getRoomMembers).mockResolvedValueOnce([]);
      vi.mocked(RoomModel.transferOwnership).mockResolvedValueOnce(true as any);

      const response = await request(app)
        .delete('/api/rooms/TEST01/leave')
        .send({ intentional: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockHandlePlayerLeft).toHaveBeenCalledWith(99, 123, true);
      expect(mockSocketService.io.to).toHaveBeenCalledWith('room:TEST01');
      expect(mockSocketService.roomPlayerReadyStatus.get(room.code)?.has('123')).toBe(false);
    });

    it('should return 404 when room is missing', async () => {
      vi.mocked(RoomModel.findByCode).mockResolvedValueOnce(null as any);

      const response = await request(app)
        .delete('/api/rooms/NOROOM/leave')
        .send({ intentional: true });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Room not found');
    });
  });
});