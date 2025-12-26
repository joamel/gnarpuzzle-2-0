import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { GameProvider } from '../../contexts/GameContext';
import RoomLobby from '../../components/RoomLobby';
import type { Room, Player } from '../../../../shared/types';

// Mock data
const mockPlayers: Player[] = [
  { 
    userId: '1', 
    username: 'player1',
    ready: false,
    score: 0,
    position: 0
  },
  { 
    userId: '2', 
    username: 'player2',
    ready: false,
    score: 0,
    position: 1
  }
];

const mockRoom: Room = {
  id: '1',
  code: 'TEST01',
  name: 'Test Room',
  createdBy: '1',
  createdAt: new Date(),
  settings: {
    grid_size: 4,
    max_players: 4,
    letter_timer: 30,
    placement_timer: 30,
    is_private: false
  },
  players: mockPlayers
};

// Mock the GameContext
const mockGameContext = {
  currentRoom: mockRoom,
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  isLoading: false,
  error: null
};

// Mock the useGame hook
vi.mock('../../contexts/GameContext', () => ({
  GameProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGame: () => mockGameContext
}));

// Mock the useAuth hook
vi.mock('../../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: '1', username: 'player1' },
    isAuthenticated: true
  })
}));

// Mock API and Socket services
vi.mock('../../services/apiService');
vi.mock('../../services/socketService');

const renderRoomLobby = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <GameProvider>
          <RoomLobby onStartGame={vi.fn()} />
        </GameProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('RoomLobby Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    renderRoomLobby();
    expect(screen.getByText('Test Room')).toBeInTheDocument();
  });

  it('should display room code', () => {
    renderRoomLobby();
    expect(screen.getByText('TEST01')).toBeInTheDocument();
  });

  it('should show player list', () => {
    renderRoomLobby();
    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
  });
});