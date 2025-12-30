import { io, Socket } from 'socket.io-client';

export interface SocketEvents {
  // Connection events
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;

  // Room events
  'room:created': (data: { room: any }) => void;
  'room:joined': (data: { room: any; user: any }) => void;
  'room:member_joined': (data: { 
    user: { id: number; username: string }; 
    room: { id: number; code: string; name: string; members: any[] };
    memberCount: number;
  }) => void;
  'room:left': (data: { room: any; user: any }) => void;
  'room:updated': (data: { room: any }) => void;
  'room:member_left': (data: { 
    user: { id: number; username: string }; 
    roomCode: string;
  }) => void;
  'room:ownership_transferred': (data: { 
    roomCode: string; 
    newCreator: { id: number; username: string }; 
  }) => void;

  // Game events
  'game:phase_changed': (data: { 
    gameId: number; 
    phase: 'letter_selection' | 'letter_placement'; 
    timer_end: number;
    current_turn?: number;
  }) => void;
  'letter:selected': (data: { 
    gameId: number; 
    playerId: number; 
    letter: string; 
    turn: number; 
  }) => void;
  'letter:placed': (data: { 
    gameId: number; 
    playerId: number; 
    letter: string; 
    x: number; 
    y: number; 
  }) => void;
  'game:ended': (data: { 
    gameId: number; 
    leaderboard: Array<{
      userId: number;
      username: string;
      score: number;
      words: any[];
    }>;
    finalScores: any;
  }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private isConnecting = false;
  private eventListeners = new Map<string, Function[]>();

  connect(token: string): Promise<Socket> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const checkConnection = () => {
          if (this.socket?.connected) {
            resolve(this.socket);
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
      
      this.socket = io(serverUrl, {
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
      });

      this.socket.on('connect', () => {
        console.log('🔗 Connected to server');
        this.isConnecting = false;
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        this.isConnecting = false;
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('💔 Disconnected from server:', reason);
        this.isConnecting = false;
      });

      // Re-register all event listeners
      this.eventListeners.forEach((listeners, event) => {
        listeners.forEach(listener => {
          this.socket?.on(event, listener as (...args: any[]) => void);
        });
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  emit(event: string, data?: any): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot emit:', event);
      return;
    }
    this.socket.emit(event, data);
  }

  // Join a room for real-time updates
  joinRoom(roomCode: string): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot join room:', roomCode);
      return;
    }
    console.log(`🚪 Joining Socket.IO room: ${roomCode}`);
    this.socket.emit('room:join', { roomCode });
  }

  // Leave a room
  leaveRoom(roomCode: string): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot leave room:', roomCode);
      return;
    }
    console.log(`🚪 Leaving Socket.IO room: ${roomCode}`);
    this.socket.emit('room:leave', { roomCode });
  }

  on<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    // Store listener for re-registration on reconnect
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);

    // Register on socket if connected
    if (this.socket) {
      this.socket.on(event, listener as any);
    }
  }

  off<K extends keyof SocketEvents>(event: K, listener?: SocketEvents[K]): void {
    // Remove from stored listeners
    const listeners = this.eventListeners.get(event);
    if (listeners && listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }

    // Remove from socket
    if (this.socket) {
      this.socket.off(event, listener as any);
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSocket(): Socket | null {
    return this.socket;
  }
}

// Singleton instance
export const socketService = new SocketService();
export default socketService;