import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { GameStateService } from './GameStateService';
import { AuthService } from './AuthService';

// Types for Socket.IO events
export interface RoomEventData {
  roomCode: string;
  roomName?: string;
  memberCount?: number;
  members?: Array<{
    id: number;
    username: string;
    role: string;
    joinedAt: string;
  }>;
  settings?: any;
}

export interface GameEventData {
  gameId: number;
  roomCode: string;
  gameState?: string;
  currentTurn?: number;
  players?: Array<{
    id: number;
    username: string;
    position: number;
    connected: boolean;
  }>;
  board?: any;
  timer?: {
    timeLeft: number;
    action: string;
  };
}

export interface PlayerEventData {
  playerId: number;
  username: string;
  action: string;
  letter?: string;
  position?: { x: number; y: number };
  points?: number;
}

export class SocketService {
  private io: SocketServer;
  private connectedUsers: Map<string, { userId?: number; username?: string; roomCode?: string }> = new Map();
  private gameStateService: GameStateService;
  private roomPlayerReadyStatus: Map<string, Set<number>> = new Map(); // Maps roomCode -> Set of ready userIds

  constructor(io: SocketServer) {
    this.io = io;
    this.gameStateService = GameStateService.getInstance(this);
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', async (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      // Auto-authenticate using token from auth
      const token = socket.handshake.auth.token;
      if (token) {
        await this.handleAuthentication(socket, { token });
      } else {
        // Initialize anonymous user data
        this.connectedUsers.set(socket.id, {});
      }

      // Authentication
      socket.on('authenticate', (data: { token: string }) => {
        this.handleAuthentication(socket, data);
      });

      // Room events
      socket.on('room:join', (data: { roomCode: string }) => {
        this.handleRoomJoin(socket, data);
      });

      socket.on('room:leave', (data: { roomCode: string }) => {
        this.handleRoomLeave(socket, data);
      });

      // Player ready status
      socket.on('player:set_ready', (data: { roomCode: string; isReady: boolean }) => {
        this.handlePlayerSetReady(socket, data);
      });

      // Game events
      socket.on('game:join', (data: { gameId: number }) => {
        this.handleGameJoin(socket, data);
      });

      socket.on('game:ready', (data: { gameId: number }) => {
        this.handleGameReady(socket, data);
      });

      socket.on('game:start', (data: { gameId: number }) => {
        this.handleGameStart(socket, data);
      });

      // New game logic events
      socket.on('letter:select', (data: { gameId: number; letter: string }) => {
        this.handleLetterSelect(socket, data);
      });

      socket.on('letter:place', (data: { gameId: number; x: number; y: number }) => {
        this.handleLetterPlace(socket, data);
      });

      socket.on('letter:confirm', (data: { gameId: number }) => {
        this.handleLetterConfirm(socket, data);
      });

      socket.on('game:action', (data: PlayerEventData) => {
        this.handleGameAction(socket, data);
      });

      // Disconnect handling
      socket.on('disconnect', () => {
        this.handleDisconnect(socket).catch(err => {
          logger.error('Error in disconnect handler:', err);
        });
      });

      // Mobile-specific events
      socket.on('mobile:heartbeat', () => {
        this.handleMobileHeartbeat(socket);
      });

      socket.on('mobile:background', () => {
        this.handleMobileBackground(socket);
      });

      socket.on('mobile:foreground', () => {
        this.handleMobileForeground(socket);
      });
    });
  }

  private async handleAuthentication(socket: Socket, data: { token: string }): Promise<void> {
    try {
      // Validate JWT token
      const decoded = AuthService.verifyToken(data.token);
      if (!decoded) {
        socket.emit('authentication_error', {
          error: 'Invalid token'
        });
        logger.warn(`Authentication failed: Invalid token for socket: ${socket.id}`, {
          service: 'gnarpuzzle-server'
        });
        return;
      }

      console.log('JWT decoded payload:', decoded);

      const userData = {
        userId: decoded.userId,
        username: decoded.username
      };

      // Validate required fields
      if (!userData.userId || !userData.username) {
        socket.emit('authentication_error', {
          error: 'Invalid user data in token'
        });
        logger.warn(`Authentication failed for socket: ${socket.id}`, {
          error: 'username is not defined',
          service: 'gnarpuzzle-server'
        });
        return;
      }

      this.connectedUsers.set(socket.id, userData);

      // Auto-join to lobby for room updates
      socket.join('lobby');

      socket.emit('authenticated', {
        success: true,
        user: userData
      });

      logger.info(`User authenticated: ${userData.username} (${userData.userId})`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id,
        userId: userData.userId,
        username: userData.username
      });
    } catch (error) {
      socket.emit('authentication:error', {
        error: 'Invalid token'
      });
      logger.warn(`Authentication failed for socket: ${socket.id}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleRoomJoin(socket: Socket, data: { roomCode: string }): Promise<void> {
    const { roomCode } = data;
    const userData = this.connectedUsers.get(socket.id);

    console.log(`🚪 handleRoomJoin called: roomCode=${roomCode}, userId=${userData?.userId}, username=${userData?.username}`);

    if (!userData?.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      // Join socket room for real-time updates
      await socket.join(`room:${roomCode}`);
      
      // Update user data
      this.connectedUsers.set(socket.id, { ...userData, roomCode });
      
      // Get room info from database
      const { RoomModel } = await import('../models');
      const room = await RoomModel.findByCode(roomCode);
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }

      // Add user to room_members table (if not already there)
      const isMember = await RoomModel.isMember(room.id, userData.userId);
      if (!isMember) {
        await RoomModel.addMember(room.id, userData.userId);
        logger.info(`User ${userData.username} added to room_members for room ${roomCode}`);
      }

      // NOW get members (after adding the user)
      const members = await RoomModel.getRoomMembers(room.id);

      // Notify others in the room
      socket.to(`room:${roomCode}`).emit('room:member_joined', {
        user: {
          id: userData.userId,
          username: userData.username
        },
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          members: members.map(m => ({
            userId: String(m.id),
            username: m.username,
            role: m.id === room.created_by ? 'owner' : 'member'
          }))
        },
        memberCount: members.length,
        roomCode,
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String)
      });
      
      console.log('📢 Broadcasting room:member_joined to other players:', {
        newJoiner: userData.username,
        roomCode,
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String)
      });

      // Send room data to joining user
      socket.emit('room:joined', {
        success: true,
        roomCode,
        room: {
          id: room.id,
          code: room.code,
          name: room.name,
          members: members.map(m => ({
            userId: String(m.id),
            username: m.username,
            role: m.id === room.created_by ? 'owner' : 'member'
          }))
        },
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String)
      });
      
      console.log('✅ Emitting room:joined event with readyPlayers:', {
        roomCode,
        userId: userData.userId,
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String)
      });

      logger.info(`User joined Socket.IO room: ${userData.username} -> room:${roomCode}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        roomCode,
        memberCount: members.length
      });
    } catch (error) {
      socket.emit('room:join_error', {
        error: 'Failed to join room',
        roomCode
      });
      logger.error(`Room join failed: ${roomCode}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleRoomLeave(socket: Socket, data: { roomCode: string }): Promise<void> {
    const { roomCode } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      // Leave socket room
      await socket.leave(`room:${roomCode}`);
      
      // Update user data
      this.connectedUsers.set(socket.id, { ...userData, roomCode: undefined });

      // Remove from ready status
      const readySet = this.roomPlayerReadyStatus.get(roomCode);
      if (readySet) {
        readySet.delete(userData.userId);
      }

      // Notify others in the room
      socket.to(`room:${roomCode}`).emit('room:member_left', {
        user: {
          id: userData.userId,
          username: userData.username
        },
        roomCode
      });

      socket.emit('room:left', {
        success: true,
        roomCode
      });

      logger.info(`User left room: ${userData.username} <- ${roomCode}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        roomCode
      });
    } catch (error) {
      socket.emit('room:leave_error', {
        error: 'Failed to leave room',
        roomCode
      });
      logger.error(`Room leave failed: ${roomCode}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message,
        userId: userData.userId
      });
    }
  }

  private async handlePlayerSetReady(socket: Socket, data: { roomCode: string; isReady: boolean }): Promise<void> {
    const { roomCode, isReady } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      // Store ready status in memory
      if (!this.roomPlayerReadyStatus.has(roomCode)) {
        this.roomPlayerReadyStatus.set(roomCode, new Set());
      }
      
      const readySet = this.roomPlayerReadyStatus.get(roomCode)!;
      if (isReady) {
        readySet.add(userData.userId);
      } else {
        readySet.delete(userData.userId);
      }
      
      console.log('🔵 Player ready status updated:', {
        roomCode,
        userId: userData.userId,
        username: userData.username,
        isReady,
        totalReady: Array.from(readySet)
      });

      // Broadcast ready status to all players in the room (including sender)
      this.io.to(`room:${roomCode}`).emit('player:ready_changed', {
        userId: String(userData.userId),
        username: userData.username,
        isReady,
        roomCode
      });

      logger.info(`Player ready status changed: ${userData.username} -> ${isReady}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        roomCode,
        isReady
      });
    } catch (error) {
      logger.error(`Player ready status failed: ${roomCode}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleGameJoin(socket: Socket, data: { gameId: number }): Promise<void> {
    const { gameId } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      // Join game socket room
      await socket.join(`game:${gameId}`);

      // TODO: Add player to game in database
      // TODO: Get game state

      socket.emit('game:joined', {
        success: true,
        gameId
      });

      // Notify other players
      socket.to(`game:${gameId}`).emit('game:player_joined', {
        player: {
          id: userData.userId,
          username: userData.username
        },
        gameId
      });

      logger.info(`User joined game: ${userData.username} -> Game ${gameId}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId
      });
    } catch (error) {
      socket.emit('game:join_error', {
        error: 'Failed to join game',
        gameId
      });
      logger.error(`Game join failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleGameReady(socket: Socket, data: { gameId: number }): Promise<void> {
    const { gameId } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      // TODO: Mark player as ready in database
      // TODO: Check if all players are ready

      // Notify other players
      this.io.to(`game:${gameId}`).emit('game:player_ready', {
        player: {
          id: userData.userId,
          username: userData.username
        },
        gameId
      });

      logger.info(`Player ready: ${userData.username} in Game ${gameId}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId
      });
    } catch (error) {
      logger.error(`Game ready failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleGameStart(socket: Socket, data: { gameId: number }): Promise<void> {
    const { gameId } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      await this.gameStateService.startGame(gameId);
      
      logger.info(`Game started: ${gameId} by ${userData.username}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId
      });
    } catch (error) {
      socket.emit('game:start_error', {
        error: (error as Error).message
      });
      logger.error(`Game start failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleLetterSelect(socket: Socket, data: { gameId: number; letter: string }): Promise<void> {
    const { gameId, letter } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      await this.gameStateService.selectLetter(gameId, userData.userId, letter);
      
      logger.info(`Letter selected: ${letter} by ${userData.username} in game ${gameId}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId,
        letter
      });
    } catch (error) {
      socket.emit('letter:select_error', {
        error: (error as Error).message
      });
      logger.error(`Letter select failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleLetterPlace(socket: Socket, data: { gameId: number; x: number; y: number }): Promise<void> {
    const { gameId, x, y } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      await this.gameStateService.placeLetter(gameId, userData.userId, x, y);
      
      logger.info(`Letter placed: (${x}, ${y}) by ${userData.username} in game ${gameId}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId,
        position: { x, y }
      });
    } catch (error) {
      socket.emit('letter:place_error', {
        error: (error as Error).message
      });
      logger.error(`Letter place failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleLetterConfirm(socket: Socket, data: { gameId: number }): Promise<void> {
    const { gameId } = data;
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      await this.gameStateService.confirmPlacement(gameId, userData.userId);
      
      logger.info(`Letter confirmed by ${userData.username} in game ${gameId}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        gameId
      });
    } catch (error) {
      socket.emit('letter:confirm_error', {
        error: (error as Error).message
      });
      logger.error(`Letter confirm failed: ${gameId}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleGameAction(socket: Socket, data: PlayerEventData): Promise<void> {
    const userData = this.connectedUsers.get(socket.id);

    if (!userData?.userId) {
      return;
    }

    try {
      // TODO: Validate and process game action
      // TODO: Update game state in database

      // Broadcast action to all players in game
      // Note: gameId would need to be determined from playerId or passed in data
      const gameRoom = `game:${data.playerId}`; // This would need proper game ID resolution
      
      this.io.to(gameRoom).emit('game:action_performed', {
        ...data,
        timestamp: new Date().toISOString()
      });

      logger.info(`Game action: ${userData.username} performed ${data.action}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        action: data.action,
        playerId: data.playerId
      });
    } catch (error) {
      socket.emit('game:action_error', {
        error: 'Action failed',
        action: data.action
      });
      logger.error(`Game action failed: ${data.action}`, {
        service: 'gnarpuzzle-server',
        error: (error as Error).message
      });
    }
  }

  private async handleDisconnect(socket: Socket): Promise<void> {
    const userData = this.connectedUsers.get(socket.id);
    
    if (userData) {
      // If user was in a room, automatically remove them
      if (userData.roomCode && userData.userId) {
        try {
          const RoomModel = (await import('../models/RoomModel')).RoomModel;
          const GameModel = (await import('../models/GameModel')).GameModel;
          const room = await RoomModel.findByCode(userData.roomCode);
          
          if (room) {
            const isCreator = room.created_by === userData.userId;
            
            // Ensure room has a valid ID
            if (!room.id || typeof room.id !== 'number') {
              logger.error('Room found but has invalid ID, cannot process disconnect');
              return;
            }
            
            const roomId = room.id as number; // Force cast since we validated it exists

            // Check if there's an active game - handle player leaving mid-game
            const activeGame = await GameModel.findByRoomId(roomId);
            if (activeGame && activeGame.state !== 'finished') {
              logger.info(`Player ${userData.username} (${userData.userId}) disconnected from active game ${activeGame.id}`);
              const { GameStateService } = await import('./GameStateService');
              const gameStateService = GameStateService.getInstance(this);
              await gameStateService.handlePlayerLeft(activeGame.id, userData.userId);
            }
            
            // Notify room BEFORE removing user (while socket is still connected to room)
            socket.to(`room:${userData.roomCode}`).emit('room:member_left', {
              user: {
                id: userData.userId,
                username: userData.username
              },
              roomCode: userData.roomCode,
              wasCreator: isCreator
            });
            
            // Remove user from room
            const removed = await RoomModel.removeMember(roomId!, userData.userId);
            
            if (removed) {
              // If the creator left, transfer ownership to next member
              if (isCreator) {
                const remainingMembers = await RoomModel.getRoomMembers(roomId!);
                if (remainingMembers.length > 0) {
                  const newCreator = remainingMembers[0];
                  await RoomModel.transferOwnership(roomId!, newCreator.id);
                  
                  // Notify room about new creator
                  socket.to(`room:${userData.roomCode}`).emit('room:ownership_transferred', {
                    newCreator: {
                      id: newCreator.id,
                      username: newCreator.username
                    },
                    roomCode: userData.roomCode,
                    previousCreator: userData.username
                  });
                  
                  logger.info(`Auto-transfer ownership of room ${userData.roomCode} from ${userData.username} to ${newCreator.username}`);
                }
              }
              
              // Emit updated room data to remaining members
              const updatedRoom = await RoomModel.findByCode(userData.roomCode);
              if (updatedRoom) {
                socket.to(`room:${userData.roomCode}`).emit('room:updated', {
                  room: updatedRoom
                });
              }
              
              logger.info(`Auto-removed disconnected user ${userData.username} from room ${userData.roomCode}`);
            }
          }
        } catch (error) {
          logger.error('Error during disconnect cleanup:', error);
        }
      }

      logger.info(`Client disconnected: ${userData.username || 'Anonymous'}`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id,
        userId: userData.userId
      });
    }

    this.connectedUsers.delete(socket.id);
  }

  private handleMobileHeartbeat(socket: Socket): void {
    // Mobile clients send periodic heartbeats
    socket.emit('mobile:heartbeat_ack', {
      timestamp: new Date().toISOString()
    });
  }

  private handleMobileBackground(socket: Socket): void {
    // Mobile app went to background
    const userData = this.connectedUsers.get(socket.id);
    if (userData) {
      logger.info(`Mobile app backgrounded: ${userData.username}`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id
      });
    }
  }

  private handleMobileForeground(socket: Socket): void {
    // Mobile app came to foreground
    const userData = this.connectedUsers.get(socket.id);
    if (userData) {
      logger.info(`Mobile app foregrounded: ${userData.username}`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id
      });
    }
  }

  // Public methods for emitting events from other services

  public emitToRoom(roomCode: string, event: string, data: any): void {
    const roomName = `room:${roomCode}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    const socketCount = room ? room.size : 0;
    
    logger.info(`📡 emitToRoom: Sending ${event} to ${roomName} (${socketCount} sockets in room)`, {
      service: 'gnarpuzzle-server',
      roomCode,
      event,
      socketCount,
      socketIds: room ? Array.from(room) : []
    });
    
    this.io.to(roomName).emit(event, data);
  }

  public emitToGame(gameId: number, event: string, data: any): void {
    this.io.to(`game:${gameId}`).emit(event, data);
  }

  public broadcastToRoom(room: string, event: string, data: any): void {
    console.log(`📡 SocketService.broadcastToRoom: room=${room}, event=${event}, data=`, data);
    this.io.to(room).emit(event, data);
    console.log(`✅ Socket event broadcasted to room ${room}`);
  }

  public emitToUser(socketId: string, event: string, data: any): void {
    this.io.to(socketId).emit(event, data);
  }

  public joinRoom(userId: string, roomCode: string): void {
    // Find socket by user ID and join room
    logger.info(`🚪 joinRoom called: userId=${userId}, roomCode=${roomCode}`, {
      service: 'gnarpuzzle-server'
    });
    
    let found = false;
    for (const [socketId, userData] of this.connectedUsers.entries()) {
      logger.info(`   Checking socket ${socketId}: userId=${userData.userId}`, {
        service: 'gnarpuzzle-server'
      });
      
      if (userData.userId?.toString() === userId) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.join(`room:${roomCode}`);
          this.connectedUsers.set(socketId, { ...userData, roomCode });
          found = true;
          logger.info(`✅ User ${userData.username} joined Socket.IO room room:${roomCode}`, {
            service: 'gnarpuzzle-server',
            userId: userData.userId,
            socketId,
            roomCode
          });
        } else {
          logger.warn(`⚠️ Socket not found for socketId ${socketId}`, {
            service: 'gnarpuzzle-server'
          });
        }
        break;
      }
    }
    
    if (!found) {
      logger.warn(`⚠️ Could not find socket for userId ${userId} to join room ${roomCode}`, {
        service: 'gnarpuzzle-server',
        connectedUsers: Array.from(this.connectedUsers.entries()).map(([sid, data]) => ({
          socketId: sid,
          userId: data.userId,
          username: data.username
        }))
      });
    }
  }

  public joinPlayersToGame(roomCode: string, gameId: number): void {
    logger.info(`🎮 Joining all players in room ${roomCode} to game:${gameId}`, {
      service: 'gnarpuzzle-server'
    });

    // Find all sockets in the room and join them to the game
    const roomName = `room:${roomCode}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    
    if (!room) {
      logger.warn(`⚠️ Room ${roomName} not found in socket adapter`, {
        service: 'gnarpuzzle-server'
      });
      return;
    }

    let joinedCount = 0;
    for (const socketId of room) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.join(`game:${gameId}`);
        joinedCount++;
        const userData = this.connectedUsers.get(socketId);
        logger.info(`✅ Joined ${userData?.username || 'unknown'} to game:${gameId}`, {
          service: 'gnarpuzzle-server',
          socketId,
          gameId
        });
      }
    }

    logger.info(`🎮 Joined ${joinedCount} players to game:${gameId}`, {
      service: 'gnarpuzzle-server',
      gameId,
      roomCode
    });
  }

  public getRoomMemberCount(roomCode: string): number {
    const room = this.io.sockets.adapter.rooms.get(`room:${roomCode}`);
    return room ? room.size : 0;
  }

  public getGamePlayerCount(gameId: number): number {
    const room = this.io.sockets.adapter.rooms.get(`game:${gameId}`);
    return room ? room.size : 0;
  }
}