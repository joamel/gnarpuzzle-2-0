import { Migration } from '../migrations';

export const migration: Migration = {
  version: 9,
  name: 'fix_phase_timer_end_bigint',
  up: `
    -- Postgres compatibility: epoch milliseconds don't fit in INT4.
    -- Use add/copy/drop/rename so it also works on modern SQLite.
    ALTER TABLE games ADD COLUMN phase_timer_end_tmp BIGINT DEFAULT NULL;
    UPDATE games SET phase_timer_end_tmp = phase_timer_end WHERE phase_timer_end IS NOT NULL;
    ALTER TABLE games DROP COLUMN phase_timer_end;
    ALTER TABLE games RENAME COLUMN phase_timer_end_tmp TO phase_timer_end;
  `,
  down: `
    -- Best-effort rollback to INTEGER.
    ALTER TABLE games ADD COLUMN phase_timer_end_tmp INTEGER DEFAULT NULL;
    UPDATE games SET phase_timer_end_tmp = phase_timer_end WHERE phase_timer_end IS NOT NULL;
    ALTER TABLE games DROP COLUMN phase_timer_end;
    ALTER TABLE games RENAME COLUMN phase_timer_end_tmp TO phase_timer_end;
  `,
};

export default migration;
