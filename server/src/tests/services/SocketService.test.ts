import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SocketService } from '../../services/SocketService';
import { Server as SocketServer } from 'socket.io';

describe('SocketService', () => {
  let mockIo: any;
  let socketService: SocketService;

  beforeEach(() => {
    // Mock Socket.IO server
    mockIo = {
      on: vi.fn(),
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      sockets: {
        adapter: {
          rooms: new Map()
        },
        sockets: new Map()
      }
    };

    socketService = new SocketService(mockIo as SocketServer);
  });

  describe('joinPlayersToGame', () => {
    it('should join all players in a room to the game socket room', () => {
      const roomCode = 'TEST01';
      const gameId = 123;
      const roomName = `room:${roomCode}`;

      // Mock socket IDs in the room
      const socket1Id = 'socket-1';
      const socket2Id = 'socket-2';
      
      const mockSocket1 = {
        id: socket1Id,
        join: vi.fn()
      };
      
      const mockSocket2 = {
        id: socket2Id,
        join: vi.fn()
      };

      // Setup room with sockets
      mockIo.sockets.adapter.rooms.set(roomName, new Set([socket1Id, socket2Id]));
      mockIo.sockets.sockets.set(socket1Id, mockSocket1);
      mockIo.sockets.sockets.set(socket2Id, mockSocket2);

      // Execute
      socketService.joinPlayersToGame(roomCode, gameId);

      // Verify both sockets joined the game room
      expect(mockSocket1.join).toHaveBeenCalledWith(`game:${gameId}`);
      expect(mockSocket2.join).toHaveBeenCalledWith(`game:${gameId}`);
    });

    it('should handle non-existent room gracefully', () => {
      const roomCode = 'NONEXISTENT';
      const gameId = 456;

      // Execute - should not throw
      expect(() => {
        socketService.joinPlayersToGame(roomCode, gameId);
      }).not.toThrow();
    });

    it('should skip sockets that no longer exist', () => {
      const roomCode = 'TEST02';
      const gameId = 789;
      const roomName = `room:${roomCode}`;

      // Mock socket IDs in room but only one exists in sockets map
      const socket1Id = 'socket-1';
      const socket2Id = 'socket-2'; // This one doesn't exist

      const mockSocket1 = {
        id: socket1Id,
        join: vi.fn()
      };

      mockIo.sockets.adapter.rooms.set(roomName, new Set([socket1Id, socket2Id]));
      mockIo.sockets.sockets.set(socket1Id, mockSocket1);
      // socket2 deliberately not added

      // Execute
      socketService.joinPlayersToGame(roomCode, gameId);

      // Verify only existing socket joined
      expect(mockSocket1.join).toHaveBeenCalledWith(`game:${gameId}`);
    });
  });

  describe('broadcastToRoom', () => {
    it('should broadcast event to specified room', () => {
      const room = 'game:123';
      const event = 'test:event';
      const data = { message: 'Hello' };

      mockIo.to = vi.fn().mockReturnThis();
      mockIo.emit = vi.fn();

      socketService.broadcastToRoom(room, event, data);

      expect(mockIo.to).toHaveBeenCalledWith(room);
      expect(mockIo.emit).toHaveBeenCalledWith(event, data);
    });
  });
});
