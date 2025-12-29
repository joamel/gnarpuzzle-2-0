import { Migration } from '../migrations';

export const migration: Migration = {
  version: 6,
  name: 'enhance_game_logic_schema',
  up: `
    -- Add settings column to rooms table for configuration
    ALTER TABLE rooms ADD COLUMN settings TEXT DEFAULT '{"grid_size": 5, "max_players": 6, "letter_timer": 10, "placement_timer": 15, "is_private": false}';
    
    -- Enhance games table for game state management  
    ALTER TABLE games ADD COLUMN current_phase TEXT DEFAULT 'waiting';
    ALTER TABLE games ADD COLUMN phase_timer_end INTEGER DEFAULT NULL;
    ALTER TABLE games ADD COLUMN letter_pool TEXT DEFAULT '[]';
    ALTER TABLE games ADD COLUMN current_letter TEXT DEFAULT NULL;
    
    -- Enhance players table for enhanced game state
    ALTER TABLE players ADD COLUMN current_letter TEXT DEFAULT NULL;
    ALTER TABLE players ADD COLUMN grid_state TEXT DEFAULT '[]';
    ALTER TABLE players ADD COLUMN placement_confirmed BOOLEAN DEFAULT 0;
    ALTER TABLE players ADD COLUMN final_score INTEGER DEFAULT 0;
  `,
  down: `
    -- Remove added columns from players table
    ALTER TABLE players DROP COLUMN current_letter;
    ALTER TABLE players DROP COLUMN grid_state;
    ALTER TABLE players DROP COLUMN placement_confirmed;
    ALTER TABLE players DROP COLUMN final_score;
    
    -- Remove added columns from games table
    ALTER TABLE games DROP COLUMN current_phase;
    ALTER TABLE games DROP COLUMN phase_timer_end;
    ALTER TABLE games DROP COLUMN letter_pool;
    ALTER TABLE games DROP COLUMN current_letter;
    
    -- Remove settings column from rooms table
    ALTER TABLE rooms DROP COLUMN settings;
  `
};

export default migration;