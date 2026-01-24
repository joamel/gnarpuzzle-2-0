import express from 'express';
import { RoomModel, GameModel } from '../models';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { getSocketService } from '../index';
import { logger, roomLogger } from '../utils/logger';
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
      created_at: room.created_at,
      settings: room.settings // Include settings so client knows if password is required
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
    const { name, max_players, board_size, turn_duration, letter_timer, placement_timer, require_password } = req.body;

    roomLogger.debug('Create room request', {
      requirePassword: require_password,
      requirePasswordType: typeof require_password
    });

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

    if (letter_timer && (letter_timer < 5 || letter_timer > 60)) {
      res.status(400).json({
        error: 'Invalid letter_timer',
        message: 'Letter timer must be between 5 and 60 seconds'
      });
      return;
    }

    if (placement_timer && (placement_timer < 10 || placement_timer > 60)) {
      res.status(400).json({
        error: 'Invalid placement_timer',
        message: 'Placement timer must be between 10 and 60 seconds'
      });
      return;
    }

    // Rate limit / guardrail: prevent users from creating multiple active rooms.
    // The app expects a user to be in at most one room at a time.
    const existingRooms = await RoomModel.getUserRooms(authReq.user!.id);
    const activeRooms = existingRooms.filter(r => r.status === 'waiting' || r.status === 'playing');
    if (activeRooms.length > 0) {
      const room0 = activeRooms[0];
      res.status(429).json({
        error: 'Room creation limited',
        message: `Du har redan ett aktivt rum (${room0.code}). Lämna rummet innan du skapar ett nytt.`,
        activeRoom: { code: room0.code, name: room0.name, status: room0.status }
      });
      return;
    }

    const room = await RoomModel.create({
      name,
      created_by: authReq.user!.id,
      settings: {
        max_players,
        grid_size: board_size,
        placement_timer: placement_timer || turn_duration || 30,
        letter_timer: letter_timer || 20,
        is_private: false,
        require_password: require_password || false
      }
    });

    roomLogger.debug('Room created settings', {
      roomCode: room.code,
      requirePasswordSent: require_password,
      requirePasswordSentType: typeof require_password,
      requirePasswordStored: room.settings?.require_password,
      requirePasswordStoredType: typeof room.settings?.require_password,
      settings: room.settings
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
        settings: room.settings, // Include room settings
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

    // Get ready status for each member
    const socketService = getSocketService();
    const readyStatusMap = socketService ? (socketService as any).roomPlayerReadyStatus?.get(code) : null;

    const playersWithReady = members.map(member => ({
      userId: member.id,
      username: member.username,
      ready: readyStatusMap ? readyStatusMap.has(member.id) : false
    }));

    res.status(200).json({
      success: true,
      room: {
        id: room.id,
        code: room.code,
        name: room.name,
        max_players: room.max_players,
        board_size: room.board_size,
        turn_duration: room.turn_duration,
        settings: room.settings, // Include room settings
        status: room.status,
        member_count: members.length,
        createdBy: room.created_by, // Include owner information
        members: members.map(member => ({
          id: member.id,
          username: member.username
        })),
        players: playersWithReady, // Include players with ready status
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
    const { password } = req.body;

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

    // Debug logging for password check
    roomLogger.debug('Join room password check', {
      roomCode: code,
      settings: room.settings,
      requirePasswordValue: room.settings?.require_password,
      requirePasswordType: typeof room.settings?.require_password,
      requirePasswordStrictTrue: room.settings?.require_password === true,
      passwordProvided: Boolean(password)
    });

    // Check if user is already in THIS room (before password check)
    // Existing members should always be able to rejoin without password
    const isAlreadyMember = await RoomModel.isUserInRoom(room.id, authReq.user!.id);
    roomLogger.debug('Join room membership check', {
      roomCode: code,
      roomId: room.id,
      userId: authReq.user!.id,
      isAlreadyMember
    });
    
    if (isAlreadyMember) {
      // User is already in room - return success with room data
      roomLogger.info('User already member of room', {
        roomCode: room.code,
        roomId: room.id,
        userId: authReq.user!.id,
        username: authReq.user!.username
      });
      
      // Get current member list
      const members = await RoomModel.getRoomMembers(room.id);

      // Best-effort: emit an authoritative membership snapshot so the owner UI can resync
      // even if it previously missed a join/leave/kick event.
      const socketService = getSocketService();
      if (socketService) {
        try {
          socketService.ensureRoomSocketsForMembers(code, members.map((m: any) => String(m.id || m.userId)));
          socketService.reconcileRoomReadyStatus(code, members.map((m: any) => String(m.id || m.userId)));
          const readyPlayers = Array.from(socketService.getRoomReadyPlayers(code));

          const payload = {
            roomCode: code,
            members: members.map(m => ({ id: m.id, username: m.username })),
            createdBy: room.created_by,
            memberCount: members.length,
            readyPlayers,
            reason: 'already_member'
          };

          socketService.emitToRoom(code, 'room:members_updated', payload);
          (socketService as any).emitToUserId?.(room.created_by, 'room:members_updated', payload);
        } catch {
          // best-effort
        }
      }

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
          settings: room.settings, // Include room settings
          status: room.status,
          created_at: room.created_at,
          createdBy: room.created_by,
          members: members
        }
      });
      return;
    }

    // Check if room requires password - ONLY if explicitly set to true
    // This check comes AFTER existing member check
    if (room.settings?.require_password === true && !password) {
      res.status(403).json({
        error: 'Password required',
        message: 'This room requires a password to join'
      });
      return;
    }

    // If password provided and room requires one, verify it matches the room code
    if (room.settings?.require_password === true && password) {
      // The password is the room code itself
      if (password !== room.code) {
        res.status(403).json({
          error: 'Invalid password',
          message: 'The password you entered is incorrect'
        });
        return;
      }
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

    // Remove user from any OTHER rooms they might be in (can only be in one room at a time)
    const previousRooms = await RoomModel.getUserRooms(authReq.user!.id);
    if (previousRooms.length > 0) {
      logger.info(`User ${authReq.user!.username} is in ${previousRooms.length} other room(s), removing them first`, {
        userId: authReq.user!.id,
        previousRoomCodes: previousRooms.map(r => r.code)
      });
      
      const { getSocketService } = await import('../index');
      const socketService = getSocketService();
      const { GameStateService } = await import('../services/GameStateService');
      const gameStateService = socketService ? GameStateService.getInstance(socketService as any) : null;
      const { GameModel } = await import('../models');
      
      for (const prevRoom of previousRooms) {
        // If the user is leaving an active game by joining another room, treat it as an intentional leave
        // so the old game doesn't keep running with a "ghost" player.
        try {
          const activeGame = await GameModel.findByRoomId(prevRoom.id);
          if (activeGame && activeGame.state !== 'finished' && gameStateService) {
            await gameStateService.handlePlayerLeft(activeGame.id, authReq.user!.id, true);
          }
        } catch (e) {
          logger.warn('Failed to handle active game leave while switching rooms', {
            prevRoomCode: prevRoom.code,
            userId: authReq.user!.id,
            error: (e as Error).message
          });
        }

        await RoomModel.removeMember(prevRoom.id, authReq.user!.id);
        
        // Notify the old room that user left
        if (socketService) {
          // Clear any ready-state for this user in the old room
          try {
            (socketService as any).roomPlayerReadyStatus?.get(prevRoom.code)?.delete(authReq.user!.id);
            (socketService as any).io?.to(`room:${prevRoom.code}`)?.emit('player:ready_changed', {
              userId: String(authReq.user!.id),
              username: authReq.user!.username,
              isReady: false,
              roomCode: prevRoom.code
            });
          } catch {
            // best-effort
          }

          socketService.emitToRoom(prevRoom.code, 'room:member_left', {
            roomId: prevRoom.id,
            roomCode: prevRoom.code,
            userId: authReq.user!.id,
            username: authReq.user!.username,
            reason: 'joined_another_room'
          });
        }
      }
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

    logger.info(`Attempting to add user ${authReq.user!.id} (${authReq.user!.username}) to room ${room.id} (${code})`);
    
    const success = await RoomModel.addMember(room.id, authReq.user!.id);
    if (!success) {
      logger.error(`Failed to add member to room`, {
        roomId: room.id,
        roomCode: code,
        userId: authReq.user!.id,
        username: authReq.user!.username
      });
      res.status(500).json({
        error: 'Failed to join room',
        message: 'Unable to add you to the room. Please try again.'
      });
      return;
    }

    logger.info(`Successfully added user ${authReq.user!.username} to room ${code}`);

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

      // Ensure all currently-connected members are joined to the Socket.IO room
      // so broadcasts reach everyone even after reconnects.
      socketService.ensureRoomSocketsForMembers(code, members.map((m: any) => String(m.id || m.userId)));

      // Reconcile ready state to current membership and include it in the snapshot.
      socketService.reconcileRoomReadyStatus(code, members.map((m: any) => String(m.id || m.userId)));
      const readyPlayers = Array.from(socketService.getRoomReadyPlayers(code));
      
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
        memberCount: members.length,
        roomCode: code,
        readyPlayers
      });

      // Also emit an authoritative snapshot for resync (and send directly to owner).
      try {
        const payload = {
          roomCode: code,
          members: members.map(m => ({ id: m.id, username: m.username })),
          createdBy: room.created_by,
          memberCount: members.length,
          readyPlayers,
          reason: 'joined'
        };
        socketService.emitToRoom(code, 'room:members_updated', payload);
        (socketService as any).emitToUserId?.(room.created_by, 'room:members_updated', payload);
      } catch {
        // best-effort
      }
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
        settings: room.settings, // Include room settings
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
 * Body: { intentional?: boolean } - if true, immediately remove player without grace period
 */
router.delete('/:code/leave', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.params;
    const { intentional = false } = req.body || {};

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

    // Check if there's an active game - handle player leaving mid-game
    const activeGame = await GameModel.findByRoomId(room.id);
    if (activeGame && activeGame.state !== 'finished') {
      logger.info(`Player ${authReq.user!.username} (${userId}) leaving active game ${activeGame.id} (intentional: ${intentional})`);
      const socketService = getSocketService();
      if (socketService) {
        const { GameStateService } = await import('../services/GameStateService');
        const gameStateService = GameStateService.getInstance(socketService);
        await gameStateService.handlePlayerLeft(activeGame.id, userId, intentional);
      }
    }

    const success = await RoomModel.removeMember(room.id, userId);
    if (!success) {
      res.status(400).json({
        error: 'Not in room',
        message: 'You are not a member of this room'
      });
      return;
    }

    // Remove ready status from Socket service and notify others
    const socketService = getSocketService();
    if (socketService) {
      // roomPlayerReadyStatus is a Set<number>
      (socketService as any).roomPlayerReadyStatus?.get(code)?.delete(userId);
      
      // Notify others that player left
      (socketService as any).io?.to(`room:${code}`)?.emit('room:member_left', {
        user: {
          id: userId,
          username: authReq.user!.username
        },
        roomCode: code
      });
      
      // Also emit ready changed to false
      (socketService as any).io?.to(`room:${code}`)?.emit('player:ready_changed', {
        userId: String(userId),
        username: authReq.user!.username,
        isReady: false,
        roomCode: code
      });
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

/**
 * POST /api/rooms/:code/kick
 * Kick a member from a room (lobby-only)
 * Requires authentication and room ownership
 * Body: { userId: number }
 */
router.post('/:code/kick', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { code } = req.params;
    const { userId: rawUserId } = req.body || {};

    const targetUserId = Number(rawUserId);
    if (!Number.isFinite(targetUserId)) {
      res.status(400).json({
        error: 'Invalid userId',
        message: 'userId must be a number'
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

    // Owner-only
    if (room.created_by !== authReq.user!.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only the room owner can kick members'
      });
      return;
    }

    // Lobby-only (not during game)
    if (room.status !== 'waiting') {
      res.status(400).json({
        error: 'Game in progress',
        message: 'Cannot kick members after the game has started'
      });
      return;
    }

    // Cannot kick self / owner
    if (targetUserId === authReq.user!.id || targetUserId === room.created_by) {
      res.status(400).json({
        error: 'Invalid target',
        message: 'You cannot kick the room owner'
      });
      return;
    }

    // Ensure target is actually a member
    const isTargetMember = await RoomModel.isMember(room.id, targetUserId);
    if (!isTargetMember) {
      res.status(400).json({
        error: 'Not in room',
        message: 'Target user is not a member of this room'
      });
      return;
    }

    const success = await RoomModel.removeMember(room.id, targetUserId);
    if (!success) {
      res.status(500).json({
        error: 'Kick failed',
        message: 'Unable to remove user from the room'
      });
      return;
    }

    const socketService = getSocketService();
    if (socketService) {
      try {
        // Best-effort: look up the kicked user's username for notifications
        let targetUsername: string | undefined;
        try {
          const dbManager = await DatabaseManager.getInstance();
          const db = dbManager.getDatabase();
          const row = await db.get('SELECT username FROM users WHERE id = ?', targetUserId) as { username?: string } | undefined;
          targetUsername = row?.username;
        } catch {
          // ignore
        }

        // Clear ready status
        (socketService as any).roomPlayerReadyStatus?.get(code)?.delete(targetUserId);
        const readyPlayers = Array.from((socketService as any).roomPlayerReadyStatus?.get(code) || []).map(String);

        // Notify the kicked user
        (socketService as any).emitToUserId?.(targetUserId, 'room:kicked', {
          roomCode: code,
          kickedBy: {
            id: authReq.user!.id,
            username: authReq.user!.username
          }
        });
        (socketService as any).leaveRoomForUserId?.(targetUserId, code);

        // Notify the room
        (socketService as any).io?.to(`room:${code}`)?.emit('room:member_left', {
          user: {
            id: targetUserId,
            username: targetUsername
          },
          roomCode: code,
          reason: 'kicked',
          kickedBy: {
            id: authReq.user!.id,
            username: authReq.user!.username
          }
        });

        (socketService as any).io?.to(`room:${code}`)?.emit('player:ready_changed', {
          userId: String(targetUserId),
          isReady: false,
          roomCode: code,
          readyPlayers
        });

        // Emit authoritative membership snapshot (and ensure owner receives it even
        // if their socket isn't currently joined to room:<code>).
        try {
          const members = await RoomModel.getRoomMembers(room.id);
          (socketService as any).ensureRoomSocketsForMembers?.(code, members.map((m: any) => String(m.id || m.userId)));
          (socketService as any).reconcileRoomReadyStatus?.(code, members.map((m: any) => String(m.id || m.userId)));
          const readyPlayers2 = Array.from((socketService as any).getRoomReadyPlayers?.(code) || readyPlayers);

          const payload = {
            roomCode: code,
            members: members.map(m => ({ id: m.id, username: m.username })),
            createdBy: room.created_by,
            memberCount: members.length,
            readyPlayers: readyPlayers2,
            reason: 'kicked'
          };

          (socketService as any).emitToRoom?.(code, 'room:members_updated', payload);
          (socketService as any).emitToUserId?.(room.created_by, 'room:members_updated', payload);
        } catch {
          // best-effort
        }
      } catch (e) {
        // best-effort
      }
    }

    res.status(200).json({
      success: true,
      message: 'Member kicked'
    });
  } catch (error) {
    logger.error('Kick member error:', error);
    res.status(500).json({
      error: 'Unable to kick member',
      message: 'Internal server error'
    });
  }
});

/**
 * PUT /api/rooms/:id/settings
 * Update room settings (only room owner can do this)
 * Requires authentication
 */
router.put('/:id/settings', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const roomId = parseInt(req.params.id);
    const { max_players, grid_size, letter_timer, placement_timer } = req.body;

    if (!roomId || isNaN(roomId)) {
      res.status(400).json({
        error: 'Invalid room ID',
        message: 'Room ID must be a valid number'
      });
      return;
    }

    const room = await RoomModel.findById(roomId);
    if (!room) {
      res.status(404).json({
        error: 'Room not found',
        message: 'No room found with that ID'
      });
      return;
    }

    // Check if user is the room owner
    if (room.created_by !== authReq.user!.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only the room owner can change settings'
      });
      return;
    }

    // Check if game has already started
    if (room.status !== 'waiting') {
      res.status(400).json({
        error: 'Game in progress',
        message: 'Cannot change settings after game has started'
      });
      return;
    }

    // Validate settings
    if (max_players !== undefined && (max_players < 2 || max_players > 6)) {
      res.status(400).json({
        error: 'Invalid max_players',
        message: 'Max players must be between 2 and 6'
      });
      return;
    }

    if (grid_size !== undefined && ![4, 5, 6].includes(grid_size)) {
      res.status(400).json({
        error: 'Invalid grid_size',
        message: 'Grid size must be 4, 5, or 6'
      });
      return;
    }

    if (letter_timer !== undefined && (letter_timer < 5 || letter_timer > 60)) {
      res.status(400).json({
        error: 'Invalid letter_timer',
        message: 'Letter timer must be between 5 and 60 seconds'
      });
      return;
    }

    if (placement_timer !== undefined && (placement_timer < 10 || placement_timer > 60)) {
      res.status(400).json({
        error: 'Invalid placement_timer',
        message: 'Placement timer must be between 10 and 60 seconds'
      });
      return;
    }

    // Update settings
    const updatedSettings = {
      ...room.settings,
      ...(max_players !== undefined && { max_players }),
      ...(grid_size !== undefined && { grid_size }),
      ...(letter_timer !== undefined && { letter_timer }),
      ...(placement_timer !== undefined && { placement_timer })
    };

    const db = (await DatabaseManager.getInstance()).getDatabase();
    
    // Update both the settings JSON and the top-level columns for API compatibility
    await db.run(
      'UPDATE rooms SET settings = ?, board_size = ?, max_players = ? WHERE id = ?',
      [
        JSON.stringify(updatedSettings), 
        grid_size || room.board_size,
        max_players || room.max_players,
        roomId
      ]
    );

    logger.info(`Room ${room.code} settings updated by ${authReq.user!.username}`);

    // Notify room members about settings change
    const socketService = getSocketService();
    if (socketService) {
      // Get updated room data
      const updatedRoom = await RoomModel.findByCode(room.code);
      
      // Notify users in the room with updated room data
      socketService.emitToRoom(room.code, 'room:updated', {
        room: updatedRoom
      });
      
      // Notify all lobby users so HomePage can update room cards
      socketService.broadcastToRoom('lobby', 'room:updated', {
        room: updatedRoom
      });
    }

    res.status(200).json({
      success: true,
      message: 'Settings updated successfully',
      settings: updatedSettings
    });

  } catch (error) {
    logger.error('Update room settings error:', error);
    res.status(500).json({
      error: 'Unable to update settings',
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

    // Check if user is room creator OR if room is public (allow any member to start)
    // For public rooms without an "active" owner, any member can start
    const isRoomCreator = String(room.created_by) === String(authReq.user!.id);
    
    // Check if this is a public standard room (created_by is a seed user like GnarMaster)
    const isPublicStandardRoom = [1, 2, 3, 4, 5, 6].includes(room.created_by);
    const canStartRoom = isRoomCreator || isPublicStandardRoom;
    
    if (!canStartRoom) {
      logger.info(`Start game denied: User ${authReq.user!.id} (${authReq.user!.username}) tried to start room ${roomId} owned by ${room.created_by}`, {
        requestingUser: authReq.user!.id,
        roomOwner: room.created_by,
        roomId: roomId,
        isRoomCreator,
        isPublicStandardRoom
      });
      res.status(403).json({
        error: 'Unauthorized',
        message: 'Only room creator can start the game'
      });
      return;
    }

    logger.info(`Start game authorized: User ${authReq.user!.username} (${authReq.user!.id}) starting room ${roomId}`, {
      roomOwner: room.created_by,
      requestingUser: authReq.user!.id,
      isRoomCreator,
      isPublicStandardRoom
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

    // Ensure all connected sockets for members are in the room before we rely on it
    // for game start broadcasts and joining players to game rooms.
    socketService.ensureRoomSocketsForMembers(room.code, members.map(m => String(m.id)));

    // Enforce readiness server-side (client expects all non-owner players ready).
    socketService.reconcileRoomReadyStatus(room.code, members.map(m => String(m.id)));
    const readyPlayers = socketService.getRoomReadyPlayers(room.code);
    const nonOwnerIds = members
      .filter(m => m.id !== room.created_by)
      .map(m => String(m.id));
    const allNonOwnersReady = nonOwnerIds.length === 0 || nonOwnerIds.every(id => readyPlayers.has(id));
    if (!allNonOwnersReady) {
      res.status(400).json({
        error: 'Players not ready',
        message: 'All non-owner players must be ready to start the game'
      });
      return;
    }
    
    // Create game using GameStateService
    const game = await gameStateService.startGame(roomId);

    // Update room status to playing
    await RoomModel.updateStatus(roomId, 'playing');

    // Join all room members to the game socket room for real-time updates
    socketService.joinPlayersToGame(room.code, game.id);

    // Ready is lobby-only; clear it now that the match has started.
    socketService.clearRoomReadyStatus(room.code);

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
    const debugId = `start_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.error('Start game error:', { debugId, error });

    const includeDetails = process.env.DEBUG_API_ERRORS === 'true';
    res.status(500).json({
      error: 'Unable to start game',
      message: 'Internal server error',
      debugId,
      ...(includeDetails ? { details: error instanceof Error ? error.message : String(error) } : null)
    });
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