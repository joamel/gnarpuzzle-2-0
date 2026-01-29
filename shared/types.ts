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
  // Additional properties for API responses
  member_count?: number;
  max_players?: number;
  board_size?: number;
}

export interface RoomSettings {
  grid_size: number; // 4x4, 5x5, 6x6
  max_players: number;
  letter_timer: number; // seconds for letter selection
  placement_timer: number; // seconds for placement
  is_private: boolean;
  require_password?: boolean;
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
  // Connection events
  'connect': () => void;
  'disconnect': (reason: string) => void;
  'connect_error': (error: Error) => void;

  // Room events
  'room:created': (data: { room: any }) => void;
  'room:joined': (data: { 
    success: boolean;
    room: any; 
    user: any;
    roomCode: string;
    readyPlayers?: string[];
  }) => void;
  'room:member_joined': (data: { 
    user: { id: number; username: string }; 
    room: { id: number; code: string; name: string; members: any[] };
    memberCount: number;
    readyPlayers?: string[];
  }) => void;
  'room:left': (data: { room: any; user: any }) => void;
  'room:updated': (data: { room: any }) => void;
  'room:member_left': (data: { 
    user: { id: number; username?: string }; 
    roomCode: string;
    reason?: string;
    kickedBy?: { id: number; username: string };
  }) => void;
  'room:members_updated': (data: {
    roomCode: string;
    members: Array<{ id: number; username: string }>;
    createdBy: number;
    memberCount: number;
    readyPlayers?: string[];
    reason?: string;
  }) => void;
  'room:kicked': (data: {
    roomCode: string;
    kickedBy?: { id: number; username: string };
  }) => void;
  'room:ownership_transferred': (data: { 
    roomCode: string; 
    newCreator: { id: number; username: string }; 
  }) => void;
  'room:settings_updated': (data: { roomCode: string; settings: any }) => void;

  // Ready status events
  'player:ready_changed': (data: {
    userId: string;
    username: string;
    isReady: boolean;
    roomCode: string;
    readyPlayers?: string[];
  }) => void;

  // Stats events
  'stats:online': (data: {
    total: number;
    authenticated: number;
    anonymous: number;
    updatedAt: string;
  }) => void;

  // Game events
  'game:started': (data: {
    gameId: number;
    roomId: number;
    phase: 'letter_selection' | 'letter_placement';
    timer_end?: number;
    message: string;
  }) => void;
  'game:phase_changed': (data: { 
    gameId: number; 
    phase: 'letter_selection' | 'letter_placement'; 
    timer_end: number;
    current_turn?: number;
  }) => void;
  'letter:selected': (data: { 
    gameId: number; 
    playerId: number; 
    letter: string; 
    turn: number; 
  }) => void;
  'letter:placed': (data: { 
    gameId: number; 
    playerId: number; 
    letter: string; 
    x: number; 
    y: number; 
  }) => void;
  'turn:skipped': (data: {
    gameId: number;
    skippedPlayerId: number;
    nextPlayerId: number;
  }) => void;
  'game:ended': (data: { 
    gameId: number; 
    leaderboard: Array<{
      userId: number;
      username: string;
      score: number;
      words: any[];
    }>;
    finalScores: any;
    reason?: string;
    message?: string;
  }) => void;
  'game:player_left': (data: {
    gameId: number;
    leftUserId: number;
    remainingPlayers: number;
    newCurrentTurn?: number;
  }) => void;

  // Time sync
  'time:pong': (data: { clientTime: number; serverTime: number }) => void;

  // System events
  'error': (error: { message: string; code?: string }) => void;
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