import { logger } from '../utils/logger';
import { RoomModel } from '../models';

export class RoomCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (more frequent for empty rooms)
  private readonly ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for inactive rooms
  private readonly EMPTY_ROOM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for empty rooms
  private isRunning = false;

  private coerceBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null) return defaultValue;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
      if (v === 'false' || v === '0' || v === 'no') return false;
    }
    return Boolean(value);
  }

  /**
   * Start the room cleanup service
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Room cleanup service already running');
      return;
    }

    logger.info('Starting room cleanup service', {
      service: 'gnarpuzzle-server',
      cleanupInterval: this.CLEANUP_INTERVAL_MS,
      roomTimeout: this.ROOM_TIMEOUT_MS
    });

    this.isRunning = true;
    
    // Run initial cleanup
    this.performCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the room cleanup service
   */
  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping room cleanup service');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.isRunning = false;
  }

  /**
   * Perform cleanup of inactive rooms
   */
  private async performCleanup(): Promise<void> {
    try {
      logger.debug('Running room cleanup check');

      // Get all rooms that might need cleanup
      const rooms = await RoomModel.getInactiveRooms(this.ROOM_TIMEOUT_MS);
      
      if (rooms.length === 0) {
        logger.debug('No rooms require cleanup');
        return;
      }

      logger.info(`Found ${rooms.length} rooms for potential cleanup`);

      let cleanedCount = 0;
      let errorCount = 0;

      for (const room of rooms) {
        try {
          const shouldCleanup = await this.shouldCleanupRoom(room);
          
          if (shouldCleanup) {
            await this.cleanupRoom(room);
            cleanedCount++;
            
            logger.info(`Cleaned up room: ${room.code}`, {
              service: 'gnarpuzzle-server',
              roomCode: room.code,
              roomName: room.name,
              createdAt: room.created_at
            });
          }
        } catch (error) {
          errorCount++;
          logger.error(`Failed to cleanup room ${room.code}:`, {
            service: 'gnarpuzzle-server',
            roomCode: room.code,
            error: (error as Error).message
          });
        }
      }

      if (cleanedCount > 0 || errorCount > 0) {
        logger.info(`Room cleanup completed`, {
          service: 'gnarpuzzle-server',
          cleanedRooms: cleanedCount,
          errors: errorCount,
          totalChecked: rooms.length
        });
      }

    } catch (error) {
      logger.error('Room cleanup service error:', {
        service: 'gnarpuzzle-server',
        error: (error as Error).message,
        stack: (error as Error).stack
      });
    }
  }

  /**
   * Determine if a room should be cleaned up
   */
  private async shouldCleanupRoom(room: any): Promise<boolean> {
    try {
      // If the room predates the settings column (NULL settings), be conservative:
      // don't auto-delete it. These include seeded standard rooms in some upgraded DBs.
      if (!room.settings) {
        logger.debug(`Room ${room.code} has no settings - skipping cleanup`);
        return false;
      }

      const settings = typeof room.settings === 'string' ? JSON.parse(room.settings) : room.settings;

      // Permanently keep certain rooms (e.g. seeded public rooms)
      const isPersistent = this.coerceBoolean((settings as any)?.is_persistent, false);
      if (isPersistent) {
        logger.debug(`Persistent room ${room.code} is permanent - skipping cleanup`);
        return false;
      }

      // NEVER cleanup public rooms.
      // Be robust: some DBs/older records may store booleans as 0/1 or strings, or omit is_private entirely.
      // If is_private is missing, treat the room as public unless it requires a password.
      const requirePassword = this.coerceBoolean((settings as any)?.require_password, false);
      const isPrivateRaw = (settings as any)?.is_private;
      const isPrivate =
        isPrivateRaw === undefined || isPrivateRaw === null
          ? requirePassword
          : this.coerceBoolean(isPrivateRaw, false);

      if (!isPrivate) {
        logger.debug(`Public room ${room.code} is permanent - skipping cleanup`);
        return false;
      }

      // Check if room is empty (no members) - delete faster
      const memberCount = await RoomModel.getMemberCount(room.id);
      if (memberCount === 0) {
        const createdAt = new Date(room.created_at);
        const now = new Date();
        const timeSinceCreation = now.getTime() - createdAt.getTime();
        
        // Delete empty rooms after 5 minutes instead of 10
        if (timeSinceCreation > this.EMPTY_ROOM_TIMEOUT_MS) {
          logger.debug(`Empty room ${room.code} ready for cleanup (${Math.round(timeSinceCreation / 60000)} minutes old)`);
          return true;
        }
        return false;
      }

      // Check if room has been inactive for too long (for rooms with members)
      const createdAt = new Date(room.created_at);
      const now = new Date();
      const timeSinceCreation = now.getTime() - createdAt.getTime();
      
      if (timeSinceCreation > this.ROOM_TIMEOUT_MS) {
        logger.debug(`Room ${room.code} inactive for ${Math.round(timeSinceCreation / 60000)} minutes`);
        
        // Check if all members are disconnected
        const connectedMembers = await RoomModel.getConnectedMemberCount(room.id);
        if (connectedMembers === 0) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`Error checking room ${room.code} for cleanup:`, error);
      return false;
    }
  }

  /**
   * Clean up a specific room
   */
  private async cleanupRoom(room: any): Promise<void> {
    try {
      // 1. End any active games in the room
      await this.endRoomGames(room.id);

      // 2. Remove all members from the room
      await RoomModel.removeAllMembers(room.id);

      // 3. Mark room as closed/deleted
      await RoomModel.markAsDeleted(room.id);

      // 4. TODO: Emit Socket.IO event about room closure
      // const socketService = getSocketService();
      // if (socketService) {
      //   socketService.emitToRoom(room.code, 'room:closed', {
      //     roomCode: room.code,
      //     reason: 'inactivity',
      //     timestamp: new Date().toISOString()
      //   });
      // }

    } catch (error) {
      throw new Error(`Failed to cleanup room ${room.code}: ${(error as Error).message}`);
    }
  }

  /**
   * End all active games in a room
   */
  private async endRoomGames(roomId: number): Promise<void> {
    try {
      // TODO: Implement game ending logic
      // This would involve:
      // 1. Finding all active games in the room
      // 2. Marking them as ended/abandoned
      // 3. Cleaning up game state
      // 4. Notifying players via Socket.IO
      
      logger.debug(`Ended games for room ${roomId}`);
    } catch (error) {
      logger.error(`Failed to end games for room ${roomId}:`, error);
      // Don't throw - room cleanup should continue even if game cleanup fails
    }
  }

  /**
   * Get cleanup service status
   */
  public getStatus(): {
    isRunning: boolean;
    cleanupInterval: number;
    roomTimeout: number;
    nextCleanup?: string;
  } {
    return {
      isRunning: this.isRunning,
      cleanupInterval: this.CLEANUP_INTERVAL_MS,
      roomTimeout: this.ROOM_TIMEOUT_MS,
      nextCleanup: this.cleanupInterval ? 
        new Date(Date.now() + this.CLEANUP_INTERVAL_MS).toISOString() : 
        undefined
    };
  }

  /**
   * Manually trigger cleanup (for testing/admin purposes)
   */
  public async manualCleanup(): Promise<{
    success: boolean;
    message: string;
    cleanedRooms?: number;
    errors?: number;
  }> {
    try {
      await this.performCleanup();
      return {
        success: true,
        message: 'Manual cleanup completed successfully'
      };
    } catch (error) {
      logger.error('Manual cleanup failed:', error);
      return {
        success: false,
        message: `Manual cleanup failed: ${(error as Error).message}`
      };
    }
  }
}