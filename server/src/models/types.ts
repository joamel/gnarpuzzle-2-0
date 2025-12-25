export interface User {
  id: number;
  username: string;
  created_at: string;
  last_active: string;
}

export interface Room {
  id: number;
  code: string;
  name: string;
  created_by: number;
  max_players: number;
  board_size: number;
  turn_duration: number;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  created_at: string;
}

export interface Game {
  id: number;
  room_id: number;
  state: 'starting' | 'in_progress' | 'finished' | 'abandoned';
  current_turn: number | null;
  turn_number: number;
  board_state: any[]; // JSON array
  available_letters: string[]; // JSON array
  turn_started_at: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface Player {
  id: number;
  game_id: number;
  user_id: number;
  position: number;
  score: number;
  board_state: any[]; // JSON array
  words_found: string[]; // JSON array
  ready_to_start: boolean;
  joined_at: string;
}

export interface RoomMember {
  id: number;
  room_id: number;
  user_id: number;
  joined_at: string;
}

// Extended interfaces for joined data
export interface RoomWithMembers extends Room {
  members: User[];
  member_count: number;
}

export interface GameWithPlayers extends Game {
  players: (Player & User)[];
}

export interface PlayerWithUser extends Player {
  user: User;
}