import { Migration } from '../migrations';

export const migration: Migration = {
  version: 7,
  name: 'add_password_hash_to_users',
  up: `
    ALTER TABLE users ADD COLUMN password_hash TEXT;

    CREATE INDEX IF NOT EXISTS idx_users_password_hash ON users(password_hash);
  `,
  down: `
    DROP INDEX IF EXISTS idx_users_password_hash;
    -- Note: SQLite does not support DROP COLUMN easily; keeping column on down.
  `
};

export default migration;
