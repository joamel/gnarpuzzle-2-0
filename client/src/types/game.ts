// Game types
export interface GridCell {
  letter: string | null;
  x: number;
  y: number;
}

export type GamePhase = 'letter_selection' | 'letter_placement' | 'finished';

export interface GameState {
  id: number;
  roomId: number;
  phase: GamePhase;
  currentTurn: number;
  currentLetter?: string;
  phaseTimerEnd?: number;
  status: 'waiting' | 'starting' | 'active' | 'completed';
}

export interface Player {
  id: number;
  userId: number;
  gameId: number;
  position: number;
  username: string;
  grid: GridCell[][];
  currentLetter?: string;
  placementConfirmed: boolean;
  finalScore: number;
  connected: boolean;
}

export interface Room {
  id: number;
  code: string;
  name: string;
  settings: RoomSettings;
  createdBy: number;
  members: RoomMember[];
  currentGame?: GameState;
  createdAt: string;
}

export interface RoomMember {
  userId: number;
  username: string;
  role: 'owner' | 'member';
  joinedAt: string;
}

export interface RoomSettings {
  grid_size: number;
  max_players: number;
  letter_timer: number;
  placement_timer: number;
  private: boolean;
}

// Auth types
export interface User {
  id: number;
  username: string;
  createdAt: string;
  lastActive: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Word validation types
export interface ValidWord {
  word: string;
  points: number;
  startX: number;
  startY: number;
  direction: 'horizontal' | 'vertical';
  isComplete: boolean;
  letters: Array<{ letter: string; x: number; y: number }>;
}

export interface GridScore {
  totalPoints: number;
  words: ValidWord[];
  completedRows: number;
  completedCols: number;
  completeLines: number;
}

// UI types
export interface GameTimer {
  endTime: number;
  remainingSeconds: number;
  isWarning: boolean; // Last 5 seconds
}

export interface Leaderboard {
  userId: number;
  username: string;
  score: number;
  words: ValidWord[];
  rank: number;
}

// Socket event types
export interface SocketGameEvents {
  gamePhaseChanged: {
    gameId: number;
    phase: GamePhase;
    timer_end: number;
    current_turn?: number;
  };
  letterSelected: {
    gameId: number;
    playerId: number;
    letter: string;
    turn: number;
  };
  letterPlaced: {
    gameId: number;
    playerId: number;
    letter: string;
    x: number;
    y: number;
  };
  gameEnded: {
    gameId: number;
    leaderboard: Leaderboard[];
    finalScores: { [userId: number]: GridScore };
  };
}

export interface SocketRoomEvents {
  roomCreated: { room: Room };
  roomJoined: { room: Room; user: User };
  roomLeft: { room: Room; user: User };
  roomUpdated: { room: Room };
}