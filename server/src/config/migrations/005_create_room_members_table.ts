import { Migration } from '../migrations';

export const migration: Migration = {
  version: 5,
  name: 'create_room_members_table',
  up: `
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      
      UNIQUE(room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_joined_at ON room_members(joined_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_room_members_joined_at;
    DROP INDEX IF EXISTS idx_room_members_user_id;
    DROP INDEX IF EXISTS idx_room_members_room_id;
    DROP TABLE IF EXISTS room_members;
  `
};

export default migration;