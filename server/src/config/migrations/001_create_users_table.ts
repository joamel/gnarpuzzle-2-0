import { Migration } from '../migrations';

export const migration: Migration = {
  version: 1,
  name: 'create_users_table',
  up: `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      CONSTRAINT username_length CHECK (length(username) >= 2 AND length(username) <= 20)
    );

    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active);
  `,
  down: `
    DROP INDEX IF EXISTS idx_users_last_active;
    DROP INDEX IF EXISTS idx_users_username;
    DROP TABLE IF EXISTS users;
  `
};

export default migration;