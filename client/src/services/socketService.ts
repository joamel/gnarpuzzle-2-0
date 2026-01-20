import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '../../../shared/types';

class SocketService {
  private socket: Socket | null = null;
  private isConnecting = false;
  private eventListeners = new Map<string, Function[]>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRoomJoins: string[] = [];
  private activeRoomCodes: Set<string> = new Set();

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
      // In production, VITE_SERVER_URL is empty and Socket.IO will use the current domain
      // In development, VITE_SERVER_URL points to localhost:3001
      const serverUrl = import.meta.env.VITE_SERVER_URL || (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3001');
      
      this.socket = io(serverUrl || undefined, {
        auth: { token },
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 20000,
      });

      this.socket.on('connect', () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0; // Reset on successful connection

        // Re-join rooms we consider "active". Socket.IO reconnect does not
        // guarantee the server will treat us as re-joined for app-level state,
        // so we explicitly re-emit room:join to receive fresh snapshots.
        if (this.activeRoomCodes.size > 0) {
          Array.from(this.activeRoomCodes).forEach(roomCode => {
            this.socket?.emit('room:join', { roomCode });
          });
        }
        
        // Process any pending room joins
        if (this.pendingRoomJoins.length > 0) {
          const pending = [...this.pendingRoomJoins];
          this.pendingRoomJoins = [];
          pending.forEach(roomCode => {
            this.socket?.emit('room:join', { roomCode });
          });
        }
        
        resolve(this.socket!);
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
        this.isConnecting = false;
        this.handleReconnection();
        reject(error);
      });

      this.socket.on('disconnect', (reason) => {
        this.isConnecting = false;
        if (reason !== 'io client disconnect') {
          this.handleReconnection();
        }
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
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Reset any remembered room intent so a new login session
    // doesn't accidentally rejoin old rooms.
    this.pendingRoomJoins = [];
    this.activeRoomCodes.clear();

    // Clear all event listeners to prevent memory leaks
    this.eventListeners.clear();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  // Cleanup method to be called on component unmount
  cleanup(): void {
    this.disconnect();
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
    this.activeRoomCodes.add(roomCode);
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected yet, queueing room join:', roomCode);
      // Queue the join to be processed when socket connects
      if (!this.pendingRoomJoins.includes(roomCode)) {
        this.pendingRoomJoins.push(roomCode);
        console.log(`📝 Room join queued. Pending joins:`, this.pendingRoomJoins);
      }
      return;
    }
    console.log(`🚪 Joining Socket.IO room: ${roomCode}`);
    this.socket.emit('room:join', { roomCode });
    console.log(`✅ room:join event emitted to socket`);
  }

  // Leave a room
  leaveRoom(roomCode: string): void {
    this.activeRoomCodes.delete(roomCode);
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot leave room:', roomCode);
      return;
    }
    console.log(`🚪 Leaving Socket.IO room: ${roomCode}`);
    this.socket.emit('room:leave', { roomCode });
  }

  // Join a game for real-time updates
  joinGame(gameId: number): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot join game:', gameId);
      return;
    }
    console.log(`🎮 Joining Socket.IO game: ${gameId}`);
    this.socket.emit('game:join', { gameId });
  }

  // Set player ready status
  setPlayerReady(roomCode: string, isReady: boolean): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ Socket not connected, cannot set ready status');
      return;
    }
    console.log(`✅ Setting ready status: ${isReady} for room: ${roomCode}`);
    this.socket.emit('player:set_ready', { roomCode, isReady });
  }

  on<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    // Store listener for re-registration on reconnect
    const eventStr = event as string;
    if (!this.eventListeners.has(eventStr)) {
      this.eventListeners.set(eventStr, []);
    }
    this.eventListeners.get(eventStr)!.push(listener);

    // Register on socket if connected
    if (this.socket) {
      this.socket.on(eventStr, listener as any);
    }
  }

  off<K extends keyof SocketEvents>(event: K, listener?: SocketEvents[K]): void {
    // Remove from stored listeners
    const eventStr = event as string;
    const listeners = this.eventListeners.get(eventStr);
    if (listeners && listener) {
      const index = listeners.indexOf(listener as any);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
      
      // Clean up empty listener arrays
      if (listeners.length === 0) {
        this.eventListeners.delete(eventStr);
      }
    }

    // Remove from socket
    if (this.socket) {
      this.socket.off(eventStr, listener as any);
    }
  }

  private handleReconnection(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      return; // Already attempting to reconnect
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s

    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.socket?.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
        console.log('🔄 Retrying connection...');
        // Note: Would need to store token for auto-reconnection
      }
    }, delay);
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