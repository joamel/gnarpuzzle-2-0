import { Server as SocketServer, Socket } from 'socket.io';
import { logger } from '../index';
import { GameStateService } from './GameStateService';

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

  constructor(io: SocketServer) {
    this.io = io;
    this.gameStateService = GameStateService.getInstance(this);
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      // Initialize user data
      this.connectedUsers.set(socket.id, {});

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
        this.handleDisconnect(socket);
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

  private async handleAuthentication(socket: Socket, _data: { token: string }): Promise<void> {
    try {
      // TODO: Validate JWT token and get user info
      // For now, mock authentication
      const userId = 1; // From JWT payload
      const username = 'TestUser'; // From JWT payload

      const userData = { userId, username };
      this.connectedUsers.set(socket.id, userData);

      socket.emit('authenticated', {
        success: true,
        user: userData
      });

      logger.info(`User authenticated: ${username} (${userId})`, {
        service: 'gnarpuzzle-server',
        socketId: socket.id,
        userId,
        username
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

    if (!userData?.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    try {
      // Join socket room for real-time updates
      await socket.join(`room:${roomCode}`);
      
      // Update user data
      this.connectedUsers.set(socket.id, { ...userData, roomCode });

      // TODO: Add user to room in database
      // TODO: Get updated room data

      // Notify others in the room
      socket.to(`room:${roomCode}`).emit('room:member_joined', {
        user: {
          id: userData.userId,
          username: userData.username
        },
        roomCode
      });

      // Send room data to joining user
      socket.emit('room:joined', {
        success: true,
        roomCode,
        // TODO: Include room details, members, etc.
      });

      logger.info(`User joined room: ${userData.username} -> ${roomCode}`, {
        service: 'gnarpuzzle-server',
        userId: userData.userId,
        roomCode
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
      logger.error(`Room leave failed: ${roomCode}`, {
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

  private handleDisconnect(socket: Socket): void {
    const userData = this.connectedUsers.get(socket.id);
    
    if (userData) {
      // Notify room/game of disconnection
      if (userData.roomCode) {
        socket.to(`room:${userData.roomCode}`).emit('room:member_disconnected', {
          user: {
            id: userData.userId,
            username: userData.username
          },
          roomCode: userData.roomCode
        });
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
    this.io.to(`room:${roomCode}`).emit(event, data);
  }

  public emitToGame(gameId: number, event: string, data: any): void {
    this.io.to(`game:${gameId}`).emit(event, data);
  }

  public broadcastToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  public emitToUser(socketId: string, event: string, data: any): void {
    this.io.to(socketId).emit(event, data);
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