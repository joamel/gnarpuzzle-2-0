import { Migration } from '../migrations';

export const migration: Migration = {
  version: 11,
  name: 'add_room_last_active_at',
  up: `
    ALTER TABLE rooms ADD COLUMN last_active_at DATETIME;

    UPDATE rooms
    SET last_active_at = COALESCE(last_active_at, created_at)
    WHERE last_active_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_rooms_last_active_at ON rooms(last_active_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_rooms_last_active_at;
    -- SQLite does not support DROP COLUMN; keep column.
  `
};

export default migration;
