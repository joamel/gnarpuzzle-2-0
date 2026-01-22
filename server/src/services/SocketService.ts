import { Server as SocketServer, Socket } from 'socket.io';
import { authLogger, gameLogger, logger, socketLogger } from '../utils/logger';
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
  
  // Grace period for disconnects - give users time to reconnect before removing from game
  private disconnectTimers: Map<number, NodeJS.Timeout> = new Map(); // userId -> timeout
  private readonly DISCONNECT_GRACE_PERIOD_MS = 90 * 1000; // 90 seconds (1.5 minutes)
  
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
      const previousUserData = this.connectedUsers.get(socket.id);

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

      authLogger.debug('JWT decoded payload', { userId: decoded.userId, username: decoded.username });

      const userData = {
        userId: decoded.userId,
        username: decoded.username
      };

      // If this socket previously had a different authenticated user, ensure we leave
      // all prior rooms to avoid receiving events for the old identity.
      if (previousUserData?.userId && previousUserData.userId !== userData.userId) {
        try {
          for (const roomName of socket.rooms) {
            if (roomName === socket.id || roomName === 'lobby') {
              continue;
            }
            socket.leave(roomName);
          }

          logger.info('Socket re-authenticated as a different user; left previous rooms', {
            service: 'gnarpuzzle-server',
            socketId: socket.id,
            previousUserId: previousUserData.userId,
            newUserId: userData.userId
          });
        } catch (leaveError) {
          logger.warn('Failed to leave previous rooms during re-authentication', {
            service: 'gnarpuzzle-server',
            socketId: socket.id,
            error: (leaveError as Error).message
          });
        }
      }

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

      // If this user had a disconnect timer (they're reconnecting), cancel it
      const disconnectTimer = this.disconnectTimers.get(userData.userId);
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        this.disconnectTimers.delete(userData.userId);
        logger.info(`Player ${userData.username} (${userData.userId}) reconnected - cancelled disconnect timer`, {
          service: 'gnarpuzzle-server',
          socketId: socket.id
        });
      }

      // Auto-join to lobby for room updates
      socket.join('lobby');

      // If the user is already a member of one (or more) rooms in the DB,
      // make sure this socket is joined to those Socket.IO rooms as well.
      // This prevents "invisible" players after reconnects.
      try {
        const { RoomModel } = await import('../models');
        const userRooms = await RoomModel.getUserRooms(userData.userId);

        for (const room of userRooms) {
          socket.join(`room:${room.code}`);
        }

        // Track one roomCode for convenience (the app intends 0-1 rooms per user)
        if (userRooms.length > 0) {
          this.connectedUsers.set(socket.id, { ...userData, roomCode: userRooms[0].code });
        }

        if (userRooms.length > 1) {
          logger.warn(`User ${userData.username} is member of multiple rooms; joined all socket rooms`, {
            service: 'gnarpuzzle-server',
            userId: userData.userId,
            roomCodes: userRooms.map(r => r.code)
          });
        }
      } catch (roomJoinError) {
        logger.warn('Failed to auto-join authenticated socket to existing rooms', {
          service: 'gnarpuzzle-server',
          userId: userData.userId,
          error: (roomJoinError as Error).message
        });
      }

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

    socketLogger.debug('handleRoomJoin called', {
      roomCode,
      userId: userData?.userId,
      username: userData?.username,
    });

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

      // Ensure all connected sockets for current members are actually in the Socket.IO room.
      // This prevents missing broadcasts after reconnects.
      this.ensureRoomSocketsForMembers(roomCode, members.map(m => String(m.id)));

      // Remove any stale ready entries for users no longer in the room.
      this.reconcileRoomReadyStatus(roomCode, members.map(m => String(m.id)));

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

      socketLogger.debug('Broadcasting room:member_joined to other players', {
        newJoiner: userData.username,
        roomCode,
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String),
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

      socketLogger.debug('Emitting room:joined event with readyPlayers', {
        roomCode,
        userId: userData.userId,
        readyPlayers: Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String),
      });

      // If room has an active game, sync game state to the reconnecting player
      try {
        const { GameModel } = await import('../models');
        const activeGame = await GameModel.findByRoomId(room.id);
        
        if (activeGame && activeGame.state !== 'finished') {
          gameLogger.debug('Room has active game; syncing state to reconnecting player', {
            roomCode,
            gameId: activeGame.id,
            userId: userData.userId,
            username: userData.username,
          });
          
          // Get all players in the game
          const { PlayerModel } = await import('../models');
          const playersData = await PlayerModel.getGamePlayers(activeGame.id);
          
          // Find the reconnecting player
          const reconnectingPlayer = playersData.find(p => p.user_id === userData.userId);
          
          if (reconnectingPlayer) {
            // Join the player to the game socket room
            await socket.join(`game:${activeGame.id}`);
            
            // Map players with complete game data
            const mappedPlayers = playersData.map((p: any) => {
              let parsedGrid;
              try {
                if (typeof p.grid_state === 'string') {
                  parsedGrid = JSON.parse(p.grid_state || '[[]]');
                } else if (p.grid_state && Array.isArray(p.grid_state)) {
                  parsedGrid = p.grid_state;
                } else {
                  parsedGrid = Array(5).fill(null).map((_, y) => 
                    Array(5).fill(null).map((_, x) => ({
                      letter: null,
                      x: x,
                      y: y
                    }))
                  );
                }
              } catch (parseError) {
                parsedGrid = Array(5).fill(null).map((_, y) => 
                  Array(5).fill(null).map((_, x) => ({
                    letter: null,
                    x: x,
                    y: y
                  }))
                );
              }
              
              return {
                id: p.id,
                userId: p.user_id,
                gameId: activeGame.id,
                position: p.position,
                username: p.username,
                grid: parsedGrid,
                currentLetter: p.current_letter || undefined,
                placementConfirmed: p.placement_confirmed === 1,
                finalScore: p.final_score || 0,
                connected: true
              };
            });
            
            // Emit game:started event with full game state including players
            socket.emit('game:started', {
              gameId: activeGame.id,
              roomId: room.id,
              phase: activeGame.current_phase || 'letter_selection',
              currentTurn: activeGame.current_turn,
              timer_end: activeGame.phase_timer_end,
              players: mappedPlayers
            });

            gameLogger.debug('Synced game state to reconnecting player', {
              userId: userData.userId,
              username: userData.username,
              gameId: activeGame.id,
              players: mappedPlayers.length,
            });
          }
        }
      } catch (gameSyncError) {
        logger.error(`Failed to sync game state for reconnecting player ${userData.username}:`, {
          error: (gameSyncError as Error).message
        });
        // Don't fail the room join if game sync fails
      }

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
      
      socketLogger.debug('Player ready status updated', {
        roomCode,
        userId: userData.userId,
        username: userData.username,
        isReady,
        totalReady: Array.from(readySet),
      });

      // Broadcast ready status to all players in the room (including sender)
      this.io.to(`room:${roomCode}`).emit('player:ready_changed', {
        userId: String(userData.userId),
        username: userData.username,
        isReady,
        roomCode,
        readyPlayers: Array.from(readySet).map(String)
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
    
    if (userData && userData.userId) {
      const userId = userData.userId;
      
      // If user was in a room with an active game, give them time to reconnect
      if (userData.roomCode) {
        try {
          const RoomModel = (await import('../models/RoomModel')).RoomModel;
          const GameModel = (await import('../models/GameModel')).GameModel;
          const room = await RoomModel.findByCode(userData.roomCode);
          
          if (room && room.id) {
            const roomId = room.id as number;
            const activeGame = await GameModel.findByRoomId(roomId);
            
            // If there's an active game, set a grace period timer
            if (activeGame && activeGame.state !== 'finished') {
              logger.info(`Player ${userData.username} (${userId}) disconnected from active game ${activeGame.id} - starting ${this.DISCONNECT_GRACE_PERIOD_MS/1000} s grace period`);
              
              // Clear any existing timer for this user
              const existingTimer = this.disconnectTimers.get(userId);
              if (existingTimer) {
                clearTimeout(existingTimer);
              }
              
              // Set new timer for grace period
              const timer = setTimeout(async () => {
                logger.info(`Grace period expired for player ${userData.username} (${userId}) - removing from game ${activeGame.id}`);
                
                // Check if user has reconnected in the meantime
                const stillDisconnected = !Array.from(this.connectedUsers.values())
                  .some(u => u.userId === userId);
                
                if (stillDisconnected) {
                  // User still disconnected after grace period - remove from game
                  const { GameStateService } = await import('./GameStateService');
                  const gameStateService = GameStateService.getInstance(this);
                  await gameStateService.handlePlayerLeft(activeGame.id, userId);
                  
                  // Also remove from room
                  const removed = await RoomModel.removeMember(roomId, userId);
                  if (removed) {
                    await this.notifyRoomOfMemberLeaving(userData.roomCode!, userId, userData.username!, room.created_by === userId);
                  }
                } else {
                  logger.info(`Player ${userData.username} (${userId}) reconnected within grace period - not removing from game`);
                }
                
                // Cleanup timer
                this.disconnectTimers.delete(userId);
              }, this.DISCONNECT_GRACE_PERIOD_MS);
              
              this.disconnectTimers.set(userId, timer);
              
              // Don't remove user immediately - they have grace period
              // Just log the disconnect and remove from connectedUsers map
              this.connectedUsers.delete(socket.id);
              
              logger.info(`Client disconnected (grace period active): ${userData.username}`, {
                service: 'gnarpuzzle-server',
                socketId: socket.id,
                userId: userData.userId,
                gracePeriodSeconds: this.DISCONNECT_GRACE_PERIOD_MS / 1000
              });
              
              return;
            } else {
              // No active game (or game already finished) - remove immediately
              logger.info(`Player ${userData.username} (${userId}) disconnected from room ${userData.roomCode} (no active game) - removing immediately`);
              
              const removed = await RoomModel.removeMember(roomId, userId);
              if (removed) {
                await this.notifyRoomOfMemberLeaving(userData.roomCode, userId, userData.username!, room.created_by === userId);
              }

              // We've handled removal + notifications; don't fall through to legacy cleanup.
              this.connectedUsers.delete(socket.id);
              logger.info(`Client disconnected (removed immediately): ${userData.username}`, {
                service: 'gnarpuzzle-server',
                socketId: socket.id,
                userId: userData.userId
              });
              return;
            }
          }
        } catch (error) {
          logger.error('Error checking for active game during disconnect:', error);
        }
      }
      
      // No active game or not in room - handle disconnect immediately (old behavior)
      if (userData.roomCode && userData.userId) {
        try {
          const RoomModel = (await import('../models/RoomModel')).RoomModel;
          const room = await RoomModel.findByCode(userData.roomCode);
          
          if (room) {
            const isCreator = room.created_by === userData.userId;
            
            // Ensure room has a valid ID
            if (!room.id || typeof room.id !== 'number') {
              logger.error('Room found but has invalid ID, cannot process disconnect');
              return;
            }
            
            const roomId = room.id as number;
            
            // Notify room BEFORE removing user
            socket.to(`room:${userData.roomCode}`).emit('room:member_left', {
              user: {
                id: userData.userId,
                username: userData.username
              },
              roomCode: userData.roomCode,
              wasCreator: isCreator
            });
            
            // Remove user from room
            const removed = await RoomModel.removeMember(roomId, userData.userId);
            
            if (removed) {
              // If the creator left, transfer ownership to next member
              if (isCreator) {
                const remainingMembers = await RoomModel.getRoomMembers(roomId);
                if (remainingMembers.length > 0) {
                  const newCreator = remainingMembers[0];
                  await RoomModel.transferOwnership(roomId, newCreator.id);
                  
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

  /**
   * Helper to notify room members when someone leaves
   */
  private async notifyRoomOfMemberLeaving(roomCode: string, userId: number, username: string, wasCreator: boolean): Promise<void> {
    try {
      const RoomModel = (await import('../models/RoomModel')).RoomModel;
      
      // Notify room of member leaving
      this.io.to(`room:${roomCode}`).emit('room:member_left', {
        user: {
          id: userId,
          username: username
        },
        roomCode: roomCode,
        wasCreator: wasCreator
      });
      
      // Handle creator transfer if needed
      if (wasCreator) {
        const room = await RoomModel.findByCode(roomCode);
        if (room && room.id) {
          const remainingMembers = await RoomModel.getRoomMembers(room.id as number);
          if (remainingMembers.length > 0) {
            const newCreator = remainingMembers[0];
            await RoomModel.transferOwnership(room.id as number, newCreator.id);
            
            this.io.to(`room:${roomCode}`).emit('room:ownership_transferred', {
              newCreator: {
                id: newCreator.id,
                username: newCreator.username
              },
              roomCode: roomCode,
              previousCreator: username
            });
            
            logger.info(`Auto-transfer ownership of room ${roomCode} from ${username} to ${newCreator.username}`);
          }
        }
      }
      
      // Emit updated room data
      const updatedRoom = await RoomModel.findByCode(roomCode);
      if (updatedRoom) {
        this.io.to(`room:${roomCode}`).emit('room:updated', {
          room: updatedRoom
        });
      }
      
      logger.info(`Notified room ${roomCode} of member ${username} leaving`);
    } catch (error) {
      logger.error(`Error notifying room ${roomCode} of member leaving:`, error);
    }
  }

  // Public methods for emitting events from other services

  public emitToRoom(roomCode: string, event: string, data: any): void {
    const roomName = `room:${roomCode}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    const socketCount = room ? room.size : 0;

    socketLogger.debug('emitToRoom', {
      roomCode,
      event,
      socketCount,
      socketIds: room ? Array.from(room) : [],
    });
    
    this.io.to(roomName).emit(event, data);
  }

  public emitToGame(gameId: number, event: string, data: any): void {
    this.io.to(`game:${gameId}`).emit(event, data);
  }

  public broadcastToRoom(room: string, event: string, data: any): void {
    socketLogger.debug('broadcastToRoom', { room, event });
    this.io.to(room).emit(event, data);
    socketLogger.debug('Socket event broadcasted', { room, event });
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

  public ensureRoomSocketsForMembers(roomCode: string, memberIds: Iterable<string>): void {
    for (const memberId of memberIds) {
      this.joinRoom(String(memberId), roomCode);
    }
  }

  public getRoomReadyPlayers(roomCode: string): Set<string> {
    return new Set(Array.from(this.roomPlayerReadyStatus.get(roomCode) || []).map(String));
  }

  public reconcileRoomReadyStatus(roomCode: string, memberIds: Iterable<string>): void {
    const readySet = this.roomPlayerReadyStatus.get(roomCode);
    if (!readySet) {
      return;
    }

    const memberIdSet = new Set<number>();
    for (const id of memberIds) {
      const numericId = Number(id);
      if (!Number.isNaN(numericId)) {
        memberIdSet.add(numericId);
      }
    }

    for (const readyUserId of Array.from(readySet)) {
      if (!memberIdSet.has(readyUserId)) {
        readySet.delete(readyUserId);
      }
    }
  }

  public clearRoomReadyStatus(roomCode: string): void {
    this.roomPlayerReadyStatus.delete(roomCode);
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