import { logger } from '../utils/logger';
import { RoomModel } from '../models';

export class RoomCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (more frequent for empty rooms)
  private readonly ROOM_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for inactive rooms (used for pre-filtering)
  private readonly EMPTY_ROOM_TIMEOUT_MS =
    (Number(process.env.ROOM_EMPTY_CLEANUP_MINUTES ?? 60) || 60) * 60 * 1000; // default: 60 minutes
  private isRunning = false;

  private readonly STANDARD_ROOM_NAMES = new Set([
    'Snabbspel 4×4',
    'Klassiskt 5×5',
    'Utmaning 6×6',
  ]);

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
      // If the room predates the settings column (NULL settings), fall back to name-based
      // protection for the seeded standard rooms.
      if (!room.settings) {
        if (this.STANDARD_ROOM_NAMES.has(String(room.name ?? ''))) {
          logger.debug(`Room ${room.code} looks like a seeded standard room - skipping cleanup`);
          return false;
        }
        // Without settings we can't detect persistence flags; treat it as normal.
        // Only delete if it's empty and truly inactive.
      }

      const settings = room.settings
        ? (typeof room.settings === 'string' ? JSON.parse(room.settings) : room.settings)
        : null;

      // Permanently keep certain rooms (e.g. seeded public rooms)
      const isPersistent = this.coerceBoolean((settings as any)?.is_persistent, false);
      if (isPersistent) {
        logger.debug(`Persistent room ${room.code} is permanent - skipping cleanup`);
        return false;
      }

      // Only clean up empty rooms for now. We don't have reliable, server-authoritative
      // connection tracking in RoomModel.getConnectedMemberCount yet.
      const memberCount = await RoomModel.getMemberCount(room.id);
      if (memberCount !== 0) {
        return false;
      }

      const lastActive = room.last_active_at ?? room.created_at;
      const lastActiveAt = lastActive ? new Date(lastActive) : new Date(room.created_at);
      const now = new Date();
      const inactiveMs = now.getTime() - lastActiveAt.getTime();

      if (inactiveMs > this.EMPTY_ROOM_TIMEOUT_MS) {
        logger.debug(
          `Empty room ${room.code} ready for cleanup (${Math.round(inactiveMs / 60000)} minutes since last activity)`
        );
        return true;
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