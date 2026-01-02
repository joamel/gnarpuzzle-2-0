import express from 'express';
import { RoomModel } from '../models';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { getSocketService } from '../index';
import { logger } from '../utils/logger';
import { DatabaseManager } from '../config/database';

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
        placement_timer: turn_duration || 15, // Increased from 15 to 30 seconds
        letter_timer: 10,  // Increased from 10 to 20 seconds
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
        createdBy: room.created_by, // Include owner information
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

    // Allow joining rooms in 'waiting' or 'playing' status
    if (room.status !== 'waiting' && room.status !== 'playing') {
      logger.info(`Join room rejected: Room ${code} has status '${room.status}', must be 'waiting' or 'playing'`, {
        roomId: room.id,
        roomCode: code,
        currentStatus: room.status,
        userId: authReq.user!.id,
        username: authReq.user!.username
      });
      res.status(400).json({
        error: 'Room not available',
        message: `Room is not accepting new members (current status: ${room.status})`
      });
      return;
    }

    // Check if user is already in room
    const isAlreadyMember = await RoomModel.isUserInRoom(room.id, authReq.user!.id);
    if (isAlreadyMember) {
      // User is already in room - return success with room data
      console.log(`✅ User ${authReq.user!.username} already member of room ${room.code}`);
      
      // Get current member list
      const members = await RoomModel.getRoomMembers(room.id);

      res.status(200).json({
        success: true,
        message: 'Already a member of this room',
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
      return;
    }

    // Check room capacity
    const memberCount = await RoomModel.getMemberCount(room.id);
    if (memberCount >= room.max_players) {
      logger.info(`Join room rejected: Room ${code} is full`, {
        roomId: room.id,
        roomCode: code,
        currentMembers: memberCount,
        maxPlayers: room.max_players,
        userId: authReq.user!.id,
        username: authReq.user!.username
      });
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

    // Check if room needs a new owner (orphaned room)
    const roomMembers = await RoomModel.getRoomMembers(room.id);
    const currentOwnerExists = roomMembers.some(member => member.id === room.created_by);
    
    logger.info(`Room ownership check for ${code}:`, {
      roomId: room.id,
      currentOwner: room.created_by,
      members: roomMembers.map(m => ({ id: m.id, username: m.username })),
      currentOwnerExists
    });
    
    if (!currentOwnerExists && roomMembers.length > 0) {
      // Room is orphaned - make the first member (likely the one who just joined) the new owner
      const newOwner = roomMembers[0];
      await RoomModel.transferOwnership(room.id, newOwner.id);
      logger.info(`Assigned ownership of orphaned room ${code} to ${newOwner.username}`, {
        newOwnerId: newOwner.id,
        newOwnerUsername: newOwner.username
      });
      
      // Update local room object to reflect new ownership
      room.created_by = newOwner.id;
    }

    // Get updated member list (use the room object which has correct ownership)
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
        createdBy: room.created_by, // This will have the correct ownership after transfer
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

    const userId = authReq.user!.id;
    const isCreator = room.created_by === userId;

    const success = await RoomModel.removeMember(room.id, userId);
    if (!success) {
      res.status(400).json({
        error: 'Not in room',
        message: 'You are not a member of this room'
      });
      return;
    }

    // If the creator left, transfer ownership to next member
    if (isCreator) {
      const remainingMembers = await RoomModel.getRoomMembers(room.id);
      if (remainingMembers.length > 0) {
        const newCreator = remainingMembers[0];
        await RoomModel.transferOwnership(room.id, newCreator.id);
        logger.info(`Ownership of room ${code} transferred from ${authReq.user!.username} to ${newCreator.username}`);
      }
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

// Start game endpoint
router.post('/:id/start', AuthService.authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const roomId = parseInt(req.params.id);

  if (!roomId || isNaN(roomId)) {
    res.status(400).json({
      error: 'Invalid room ID',
      message: 'Room ID must be a valid number'
    });
    return;
  }

  try {
    const room = await RoomModel.findById(roomId);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'Room does not exist'
      });
      return;
    }

    // Check if user is room creator (fix type coercion)
    if (String(room.created_by) !== String(authReq.user!.id)) {
      logger.info(`Start game denied: User ${authReq.user!.id} (${authReq.user!.username}) tried to start room ${roomId} owned by ${room.created_by}`, {
        requestingUser: authReq.user!.id,
        roomOwner: room.created_by,
        roomId: roomId
      });
      res.status(403).json({
        error: 'Unauthorized',
        message: 'Only room creator can start the game'
      });
      return;
    }

    logger.info(`Start game authorized: User ${authReq.user!.username} (${authReq.user!.id}) starting room ${roomId}`, {
      roomOwner: room.created_by,
      requestingUser: authReq.user!.id
    });

    // Check if room is in correct state to start
    if (room.status !== 'waiting') {
      res.status(400).json({
        error: 'Invalid room state',
        message: 'Game can only be started from waiting state'
      });
      return;
    }

    // Get room members to check minimum players
    const members = await RoomModel.getRoomMembers(roomId);
    
    logger.info(`Start game - checking members for room ${roomId}:`, {
      memberCount: members.length,
      members: members.map(m => ({ id: m.id, username: m.username }))
    });
    
    if (members.length < 2) {
      logger.warn(`Start game rejected - insufficient players:`, {
        roomId,
        memberCount: members.length,
        requiredMinimum: 2
      });
      res.status(400).json({
        error: 'Insufficient players',
        message: `At least 2 players required to start game (current: ${members.length})`
      });
      return;
    }

    // Use GameStateService for consistent game creation logic
    const { GameStateService } = await import('../services/GameStateService');
    const { getSocketService } = await import('../index');
    const socketService = getSocketService();
    
    if (!socketService) {
      throw new Error('Socket service not available');
    }
    
    const gameStateService = GameStateService.getInstance(socketService);
    
    // Create game using GameStateService
    const game = await gameStateService.startGame(roomId);

    // Update room status to playing
    await RoomModel.updateStatus(roomId, 'playing');

    // Notify all room members that the game has started
    socketService.broadcastToRoom(`room:${room.code}`, 'game:started', {
      gameId: game.id,
      roomId: roomId,
      phase: game.current_phase,
      currentTurn: game.current_turn,
      timer_end: game.phase_timer_end,
      message: 'Game has started!'
    });

    logger.info(`Game started for room ${roomId} by user ${authReq.user!.username}`, {
      gameId: game.id,
      roomId: roomId,
      playerCount: members.length,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Game started successfully',
      game: {
        id: game.id,
        room_id: roomId,
        phase: game.current_phase,
        timer_end: game.phase_timer_end
      }
    });

  } catch (error) {
    logger.error('Start game error:', error);
    res.status(500).json({
      error: 'Unable to start game',
      message: 'Internal server error'
    });
  }
});

// Debug endpoint to see room members
router.get('/:code/debug', AuthService.authenticateToken, async (req, res) => {
  const { code } = req.params;

  try {
    const room = await RoomModel.findByCode(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const members = await RoomModel.getRoomMembers(room.id);
    const memberCount = await RoomModel.getMemberCount(room.id);
    
    // Also query raw data from room_members table
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    const rawMembers = await db.all(`SELECT * FROM room_members WHERE room_id = ?`, room.id);
    
    res.json({
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        status: room.status,
        created_by: room.created_by
      },
      members,
      memberCount,
      rawMembers,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Debug room error:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// Reset room to waiting status (for testing/debugging)
router.post('/:code/reset', AuthService.authenticateToken, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { code } = req.params;

  try {
    const room = await RoomModel.findByCode(code);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'No room found with that code'
      });
      return;
    }

    // Only room owner can reset
    if (room.created_by !== authReq.user!.id) {
      res.status(403).json({
        error: 'Unauthorized',
        message: 'Only room creator can reset the room'
      });
      return;
    }

    // Reset room status to waiting
    await RoomModel.updateStatus(room.id, 'waiting');

    logger.info(`Room ${code} reset to waiting status by ${authReq.user!.username}`);

    res.status(200).json({
      success: true,
      message: 'Room reset to waiting status'
    });

  } catch (error) {
    logger.error('Reset room error:', error);
    res.status(500).json({
      error: 'Unable to reset room',
      message: 'Internal server error'
    });
  }
});

export { router as roomRoutes };