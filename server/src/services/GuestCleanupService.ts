import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import { UserModel } from '../models';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

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

      const cutoffMs = Date.now() - this.INACTIVITY_MINUTES * 60 * 1000;

      const parseLastActiveMs = (value: unknown): number | null => {
        if (!value) return null;
        if (value instanceof Date) return value.getTime();

        const raw = String(value);
        // SQLite CURRENT_TIMESTAMP => "YYYY-MM-DD HH:MM:SS" (UTC). Make it ISO.
        const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z';
        const ms = Date.parse(normalized);
        return Number.isFinite(ms) ? ms : null;
      };

      const allGuests = (await db.all(
        `
        SELECT id, username, last_active
        FROM users
        WHERE password_hash IS NULL
        `
      )) as Array<{ id: number; username: string; last_active: unknown }>;

      const candidates = allGuests
        .filter((u) => {
          const lastActiveMs = parseLastActiveMs(u.last_active);
          return typeof lastActiveMs === 'number' && lastActiveMs < cutoffMs;
        })
        .map((u) => ({ id: u.id, username: u.username }));

      if (!candidates.length) {
        return { cleanedUsers: 0, checkedUsers: 0 };
      }

      let cleaned = 0;

      for (const user of candidates) {
        try {
          await db.run('BEGIN');

          const ensureSystemUserId = async (): Promise<number> => {
            const SYSTEM_USERNAME = 'gnar_system';
            const existing = await UserModel.findByUsername(SYSTEM_USERNAME);
            if (existing && (existing as any).password_hash) return existing.id;

            const randomPassword = crypto.randomBytes(24).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            if (!existing) {
              const created = await UserModel.createWithPassword(SYSTEM_USERNAME, passwordHash);
              return created.id;
            }

            await UserModel.setPasswordHash(existing.id, passwordHash);
            return existing.id;
          };

          const coerceBoolean = (value: unknown, defaultValue: boolean): boolean => {
            if (value === undefined || value === null) return defaultValue;
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            if (typeof value === 'string') {
              const v = value.trim().toLowerCase();
              if (v === 'true' || v === '1' || v === 'yes') return true;
              if (v === 'false' || v === '0' || v === 'no') return false;
            }
            return Boolean(value);
          };

          const shouldPreserveRoom = (settingsRaw: unknown): boolean => {
            if (!settingsRaw) return false;
            let settings: any = settingsRaw;
            try {
              if (typeof settingsRaw === 'string') settings = JSON.parse(settingsRaw);
            } catch {
              return false;
            }

            if (coerceBoolean(settings?.is_persistent, false)) return true;

            const requirePassword = coerceBoolean(settings?.require_password, false);
            const isPrivateRaw = settings?.is_private;
            const isPrivate =
              isPrivateRaw === undefined || isPrivateRaw === null
                ? requirePassword
                : coerceBoolean(isPrivateRaw, false);

            // Preserve public rooms
            return !isPrivate;
          };

          // Transfer or delete rooms owned by this guest, so we don't accidentally delete active rooms.
          const ownedRooms = (await db.all(
            'SELECT id, settings FROM rooms WHERE created_by = ?',
            user.id
          )) as Array<{ id: number; settings: unknown }>;

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

            const preserve = shouldPreserveRoom(room.settings);
            if (preserve) {
              const systemUserId = await ensureSystemUserId();
              const newOwnerId = nextOwner?.user_id ?? systemUserId;
              await db.run('UPDATE rooms SET created_by = ? WHERE id = ?', newOwnerId, room.id);
              continue;
            }

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
