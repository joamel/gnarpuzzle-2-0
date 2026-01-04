import { Migration } from '../migrations';

export const migration: Migration = {
  version: 3,
  name: 'create_games_table',
  up: `
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'starting',
      current_turn INTEGER DEFAULT NULL,
      turn_number INTEGER NOT NULL DEFAULT 0,
      board_state TEXT NOT NULL DEFAULT '[]',
      available_letters TEXT NOT NULL DEFAULT '[]',
      turn_started_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME DEFAULT NULL,
      
      CONSTRAINT state_valid CHECK (state IN ('starting', 'in_progress', 'finished', 'abandoned')),
      CONSTRAINT turn_number_positive CHECK (turn_number >= 0),
      
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (current_turn) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
    CREATE INDEX IF NOT EXISTS idx_games_state ON games(state);
    CREATE INDEX IF NOT EXISTS idx_games_current_turn ON games(current_turn);
    CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_games_created_at;
    DROP INDEX IF EXISTS idx_games_current_turn;
    DROP INDEX IF EXISTS idx_games_state;
    DROP INDEX IF EXISTS idx_games_room_id;
    DROP TABLE IF EXISTS games;
  `
};

export default migration;