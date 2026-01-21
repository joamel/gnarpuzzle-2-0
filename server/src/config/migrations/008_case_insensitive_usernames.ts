import { Migration } from '../migrations';

export const migration: Migration = {
  version: 8,
  name: 'case_insensitive_usernames',
  up: `
    -- Enforce case-insensitive uniqueness for usernames.
    -- This prevents creating both 'Joakim' and 'joakim'.
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_users_username_nocase
      ON users(username COLLATE NOCASE);
  `,
  down: `
    DROP INDEX IF EXISTS uidx_users_username_nocase;
  `
};

export default migration;
