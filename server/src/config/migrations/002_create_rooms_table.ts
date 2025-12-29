import { Migration } from '../migrations';

export const migration: Migration = {
  version: 2,
  name: 'create_rooms_table',
  up: `
    CREATE TABLE rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      max_players INTEGER NOT NULL DEFAULT 4,
      board_size INTEGER NOT NULL DEFAULT 5,
      turn_duration INTEGER NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      CONSTRAINT room_name_length CHECK (length(name) >= 2 AND length(name) <= 30),
      CONSTRAINT max_players_range CHECK (max_players >= 2 AND max_players <= 6),
      CONSTRAINT board_size_valid CHECK (board_size IN (4, 5, 6)),
      CONSTRAINT turn_duration_range CHECK (turn_duration >= 10 AND turn_duration <= 60),
      CONSTRAINT status_valid CHECK (status IN ('waiting', 'playing', 'finished', 'abandoned')),
      
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_rooms_code ON rooms(code);
    CREATE INDEX idx_rooms_status ON rooms(status);
    CREATE INDEX idx_rooms_created_by ON rooms(created_by);
    CREATE INDEX idx_rooms_created_at ON rooms(created_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_rooms_created_at;
    DROP INDEX IF EXISTS idx_rooms_created_by;
    DROP INDEX IF EXISTS idx_rooms_status;
    DROP INDEX IF EXISTS idx_rooms_code;
    DROP TABLE IF EXISTS rooms;
  `
};

export default migration;