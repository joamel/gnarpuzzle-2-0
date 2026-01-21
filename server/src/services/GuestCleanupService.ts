import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import { UserModel } from '../models';

export class GuestCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private readonly CLEANUP_INTERVAL_MS: number;
  private readonly INACTIVITY_MINUTES: number;

  constructor(options?: { cleanupIntervalMs?: number; inactivityMinutes?: number }) {
    const envInactivity = Number(process.env.GUEST_INACTIVITY_MINUTES);
    const envInterval = Number(process.env.GUEST_CLEANUP_INTERVAL_MS);

    this.INACTIVITY_MINUTES =
      options?.inactivityMinutes ??
      (Number.isFinite(envInactivity) && envInactivity > 0 ? envInactivity : 60);

    this.CLEANUP_INTERVAL_MS =
      options?.cleanupIntervalMs ??
      (Number.isFinite(envInterval) && envInterval > 0 ? envInterval : 5 * 60 * 1000);
  }

  public start(): void {
    if (this.isRunning) {
      logger.warn('Guest cleanup service already running');
      return;
    }

    this.isRunning = true;

    logger.info('Starting guest cleanup service', {
      service: 'gnarpuzzle-server',
      cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
      inactivityMinutes: this.INACTIVITY_MINUTES
    });

    void this.runOnce();

    this.cleanupInterval = setInterval(() => {
      void this.runOnce();
    }, this.CLEANUP_INTERVAL_MS);
  }

  public stop(): void {
    if (!this.isRunning) return;

    logger.info('Stopping guest cleanup service');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isRunning = false;
  }

  /**
   * Executes one cleanup pass.
   * Deletes guest/legacy users (users without password_hash) that have been inactive for INACTIVITY_MINUTES.
   */
  public async runOnce(): Promise<{ cleanedUsers: number; checkedUsers: number }> {
    try {
      const dbManager = await DatabaseManager.getInstance();
      const db = dbManager.getDatabase();

      const candidates = (await db.all(
        `
        SELECT id, username
        FROM users
        WHERE password_hash IS NULL
          AND last_active < datetime('now', '-' || ? || ' minutes')
        `,
        this.INACTIVITY_MINUTES
      )) as Array<{ id: number; username: string }>;

      if (!candidates.length) {
        return { cleanedUsers: 0, checkedUsers: 0 };
      }

      let cleaned = 0;

      for (const user of candidates) {
        try {
          await db.run('BEGIN');

          // Transfer or delete rooms owned by this guest, so we don't accidentally delete active rooms.
          const ownedRooms = (await db.all(
            'SELECT id FROM rooms WHERE created_by = ?',
            user.id
          )) as Array<{ id: number }>;

          for (const room of ownedRooms) {
            const nextOwner = (await db.get(
              `
              SELECT user_id
              FROM room_members
              WHERE room_id = ? AND user_id != ?
              ORDER BY joined_at ASC
              LIMIT 1
              `,
              room.id,
              user.id
            )) as { user_id: number } | null;

            if (nextOwner?.user_id) {
              await db.run('UPDATE rooms SET created_by = ? WHERE id = ?', nextOwner.user_id, room.id);
            } else {
              await db.run('DELETE FROM rooms WHERE id = ?', room.id);
            }
          }

          const deleted = await UserModel.delete(user.id);
          if (deleted) {
            cleaned++;
            logger.info('Deleted inactive guest user', {
              service: 'gnarpuzzle-server',
              userId: user.id,
              username: user.username,
              inactivityMinutes: this.INACTIVITY_MINUTES
            });
          }

          await db.run('COMMIT');
        } catch (err) {
          try {
            await (await DatabaseManager.getInstance()).getDatabase().run('ROLLBACK');
          } catch {
            // ignore
          }

          logger.error('Failed to cleanup inactive guest user', {
            service: 'gnarpuzzle-server',
            userId: user.id,
            username: user.username,
            error: (err as Error)?.message
          });
        }
      }

      return { cleanedUsers: cleaned, checkedUsers: candidates.length };
    } catch (error) {
      logger.error('Guest cleanup service error:', {
        service: 'gnarpuzzle-server',
        error: (error as Error).message,
        stack: (error as Error).stack
      });

      return { cleanedUsers: 0, checkedUsers: 0 };
    }
  }

  public getStatus(): { isRunning: boolean; cleanupIntervalMs: number; inactivityMinutes: number } {
    return {
      isRunning: this.isRunning,
      cleanupIntervalMs: this.CLEANUP_INTERVAL_MS,
      inactivityMinutes: this.INACTIVITY_MINUTES
    };
  }
}
