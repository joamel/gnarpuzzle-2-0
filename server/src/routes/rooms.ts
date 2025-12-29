import express from 'express';
import { RoomModel } from '../models';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { getSocketService } from '../index';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/rooms
 * Get list of active rooms
 * Optional authentication - shows more info if authenticated
 */
router.get('/', AuthService.optionalAuth, async (_req, res) => {
  try {
    const rooms = await RoomModel.getActiveRooms();
    
    // Mobile-optimized response - minimal payload
    const mobileOptimizedRooms = rooms.map(room => ({
      id: room.id,
      code: room.code,
      name: room.name,
      member_count: room.member_count,
      max_players: room.max_players,
      status: room.status,
      board_size: room.board_size,
      turn_duration: room.turn_duration,
      created_at: room.created_at
    }));

    res.status(200).json({
      success: true,
      rooms: mobileOptimizedRooms,
      total: mobileOptimizedRooms.length
    });

  } catch (error) {
    logger.error('Get rooms error:', error);
    res.status(500).json({
      error: 'Unable to fetch rooms',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/rooms
 * Create a new room
 * Requires authentication
 */
router.post('/', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { name, max_players, board_size, turn_duration } = req.body;

    // Validation
    if (!name || name.length < 2 || name.length > 30) {
      res.status(400).json({
        error: 'Invalid room name',
        message: 'Room name must be between 2 and 30 characters'
      });
      return;
    }

    if (max_players && (max_players < 2 || max_players > 6)) {
      res.status(400).json({
        error: 'Invalid max_players',
        message: 'Max players must be between 2 and 6'
      });
      return;
    }

    if (board_size && ![4, 5, 6].includes(board_size)) {
      res.status(400).json({
        error: 'Invalid board_size',
        message: 'Board size must be 4, 5, or 6'
      });
      return;
    }

    if (turn_duration && (turn_duration < 10 || turn_duration > 60)) {
      res.status(400).json({
        error: 'Invalid turn_duration',
        message: 'Turn duration must be between 10 and 60 seconds'
      });
      return;
    }

    const room = await RoomModel.create({
      name,
      created_by: authReq.user!.id,
      settings: {
        max_players,
        grid_size: board_size,
        placement_timer: turn_duration,
        letter_timer: 10,
        is_private: false
      }
    });

    logger.info(`Room created: ${room.code} by ${authReq.user!.username}`);

    // Get room members for response (creator is already added by RoomModel.create)
    const members = await RoomModel.getRoomMembers(room.id);

    // Emit room created event via Socket.IO
    const socketService = getSocketService();
    if (socketService) {
      // Join creator to the Socket.IO room
      socketService.joinRoom(authReq.user!.id.toString(), room.code);
      
      // Emit to lobby about new room
      socketService.emitToRoom('lobby', 'room:created', {
        roomCode: room.code,
        roomName: room.name,
        memberCount: members.length,
        maxPlayers: room.max_players,
        createdBy: {
          id: authReq.user!.id,
          username: authReq.user!.username
        }
      });
    }

    res.status(201).json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        max_players: room.max_players,
        board_size: room.board_size,
        turn_duration: room.turn_duration,
        status: room.status,
        created_at: room.created_at,
        createdBy: authReq.user!.id,
        members: members
      }
    });

  } catch (error) {
    logger.error('Create room error:', error);
    res.status(500).json({
      error: 'Unable to create room',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/rooms/:code
 * Get room details by code
 * Optional authentication
 */
router.get('/:code', AuthService.optionalAuth, async (req, res) => {
  try {
    const { code } = req.params;
    
    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      res.status(400).json({
        error: 'Invalid room code',
        message: 'Room code must be 6 alphanumeric characters'
      });
      return;
    }

    const room = await RoomModel.findByCode(code);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'No room found with that code'
      });
      return;
    }

    const members = await RoomModel.getRoomMembers(room.id);

    res.status(200).json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        max_players: room.max_players,
        board_size: room.board_size,
        turn_duration: room.turn_duration,
        status: room.status,
        member_count: members.length,
        members: members.map(member => ({
          id: member.id,
          username: member.username
        })),
        created_at: room.created_at
      }
    });

  } catch (error) {
    logger.error('Get room error:', error);
    res.status(500).json({
      error: 'Unable to fetch room',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/rooms/:code/join
 * Join a room
 * Requires authentication
 */
router.post('/:code/join', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.params;

    if (!code || !/^[A-Z0-9]{6}$/.test(code)) {
      res.status(400).json({
        error: 'Invalid room code',
        message: 'Room code must be 6 alphanumeric characters'
      });
      return;
    }

    const room = await RoomModel.findByCode(code);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'No room found with that code'
      });
      return;
    }

    if (room.status !== 'waiting') {
      res.status(400).json({
        error: 'Room not available',
        message: 'Room is not accepting new members'
      });
      return;
    }

    // Check if user is already in room
    const isAlreadyMember = await RoomModel.isUserInRoom(room.id, authReq.user!.id);
    if (isAlreadyMember) {
      // User is already in room - return success with room data
      console.log(`✅ User ${authReq.user!.username} already member of room ${room.code}`);
      
      // Get room with updated member list
      const updatedRoom = await RoomModel.findByCode(code);
      if (!updatedRoom) {
        res.status(404).json({ error: 'Room not found after join' });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Already a member of this room',
        room: updatedRoom
      });
      return;
    }

    // Check room capacity
    const memberCount = await RoomModel.getMemberCount(room.id);
    if (memberCount >= room.max_players) {
      res.status(400).json({
        error: 'Room full',
        message: 'This room has reached its maximum capacity'
      });
      return;
    }

    const success = await RoomModel.addMember(room.id, authReq.user!.id);
    if (!success) {
      res.status(500).json({
        error: 'Failed to join room',
        message: 'Unable to add you to the room'
      });
      return;
    }

    // Get updated room with members  
    const members = await RoomModel.getRoomMembers(room.id);

    logger.info(`User ${authReq.user!.username} joined room ${code}`);

    // Emit room joined event via Socket.IO
    const socketService = getSocketService();
    if (socketService) {
      // Join the user to the Socket.IO room
      socketService.joinRoom(authReq.user!.id.toString(), code);
      
      // Emit to all room members about the new member
      socketService.emitToRoom(code, 'room:member_joined', {
        user: {
          id: authReq.user!.id,
          username: authReq.user!.username
        },
        room: {
          id: room.id,
          code: code,
          name: room.name,
          members: members
        },
        memberCount: members.length
      });
    }

    res.status(200).json({
      success: true,
      message: 'Successfully joined room',
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        max_players: room.max_players,
        board_size: room.board_size,
        turn_duration: room.turn_duration,
        status: room.status,
        created_at: room.created_at,
        createdBy: room.created_by,
        members: members
      }
    });

  } catch (error) {
    logger.error('Join room error:', error);
    res.status(500).json({
      error: 'Unable to join room',
      message: 'Internal server error'
    });
  }
});

/**
 * DELETE /api/rooms/:code/leave
 * Leave a room
 * Requires authentication
 */
router.delete('/:code/leave', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.params;

    const room = await RoomModel.findByCode(code);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'No room found with that code'
      });
      return;
    }

    const success = await RoomModel.removeMember(room.id, authReq.user!.id);
    if (!success) {
      res.status(400).json({
        error: 'Not in room',
        message: 'You are not a member of this room'
      });
      return;
    }

    logger.info(`User ${authReq.user!.username} left room ${code}`);

    res.status(200).json({
      success: true,
      message: 'Successfully left room'
    });

  } catch (error) {
    logger.error('Leave room error:', error);
    res.status(500).json({
      error: 'Unable to leave room',
      message: 'Internal server error'
    });
  }
});

export { router as roomRoutes };