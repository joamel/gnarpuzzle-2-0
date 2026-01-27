import { Migration } from '../migrations';

export const migration: Migration = {
  version: 10,
  name: 'add_left_at_to_players',
  up: `
    ALTER TABLE players ADD COLUMN left_at DATETIME DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_players_left_at ON players(left_at);
  `,
  down: `
    DROP INDEX IF EXISTS idx_players_left_at;
    ALTER TABLE players DROP COLUMN left_at;
  `
};

export default migration;
