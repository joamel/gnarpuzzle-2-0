// Shared types för both client och server
export interface User {
  id: string;
  username: string;
  createdAt: Date;
  lastActive: Date;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  createdBy: string;
  createdAt: Date;
  settings: RoomSettings;
  players: Player[];
  game?: Game;
}

export interface RoomSettings {
  grid_size: number; // 4x4, 5x5, 6x6
  max_players: number;
  letter_timer: number; // seconds for letter selection
  placement_timer: number; // seconds for placement
  is_private: boolean;
  password?: string;
}

export interface Player {
  userId: string;
  username: string;
  ready: boolean;
  score: number;
  position: number;
}

export interface Game {
  id: string;
  roomId: string;
  state: GameState;
  currentTurn: number;
  board: GameBoard;
  players: GamePlayer[];
  createdAt: Date;
  endedAt?: Date;
}

export interface GameState {
  phase: 'waiting' | 'letter_selection' | 'letter_placement' | 'finished';
  phase_timer_end?: number; // timestamp when current phase ends
  current_letter?: string;
  turn_number: number;
}
  timeRemaining?: number;
}

export interface GameBoard {
  size: number;
  cells: BoardCell[][];
}

export interface BoardCell {
  letter?: string;
  playerId?: string;
  isLocked: boolean;
  multiplier?: 'double' | 'triple';
}

export interface GamePlayer extends Player {
  board: PlayerBoard;
  availableLetters: string[];
  wordsFormed: Word[];
}

export interface PlayerBoard {
  cells: PlayerBoardCell[][];
}

export interface PlayerBoardCell {
  letter?: string;
  isPlaced: boolean;
  fromMainBoard?: boolean;
}

export interface Word {
  text: string;
  points: number;
  cells: { row: number; col: number }[];
}

// Socket Events
export interface SocketEvents {
  // Room events
  'room:created': (room: Room) => void;
  'room:joined': (room: Room, user: User) => void;
  'room:left': (roomId: string, userId: string) => void;
  'room:updated': (room: Room) => void;

  // Game events
  'game:start': (game: Game) => void;
  'game:state': (gameState: GameState) => void;
  'turn:start': (playerId: string, letter: string) => void;
  'turn:timeout': () => void;
  'letter:selected': (letter: string, playerId: string) => void;
  'letter:placed': (position: { row: number; col: number }, playerId: string) => void;
  'board:updated': (board: GameBoard) => void;
  'game:end': (results: GameResults) => void;

  // System events
  'error': (error: { message: string; code?: string }) => void;
  'connect': () => void;
  'disconnect': () => void;
}

export interface GameResults {
  winner: GamePlayer;
  finalScores: { playerId: string; score: number; position: number }[];
  gameStats: {
    duration: number;
    totalWords: number;
    longestWord: string;
  };
}