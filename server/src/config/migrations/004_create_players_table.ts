import { Migration } from '../migrations';

export const migration: Migration = {
  version: 4,
  name: 'create_players_table',
  up: `
    CREATE TABLE players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      board_state TEXT NOT NULL DEFAULT '[]',
      words_found TEXT NOT NULL DEFAULT '[]',
      ready_to_start BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      CONSTRAINT position_positive CHECK (position >= 0),
      CONSTRAINT score_non_negative CHECK (score >= 0),
      
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      
      UNIQUE(game_id, user_id),
      UNIQUE(game_id, position)
    );

    CREATE INDEX idx_players_game_id ON players(game_id);
    CREATE INDEX idx_players_user_id ON players(user_id);
    CREATE INDEX idx_players_position ON players(game_id, position);
    CREATE INDEX idx_players_score ON players(score);
  `,
  down: `
    DROP INDEX IF EXISTS idx_players_score;
    DROP INDEX IF EXISTS idx_players_position;
    DROP INDEX IF EXISTS idx_players_user_id;
    DROP INDEX IF EXISTS idx_players_game_id;
    DROP TABLE IF EXISTS players;
  `
};

export default migration;