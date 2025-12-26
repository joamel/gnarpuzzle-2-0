import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import RoomLobby from '../../components/RoomLobby';

// Mock the GameContext
const mockGameContext = {
  currentRoom: {
    id: 1,
    name: 'Test Room',
    code: 'TEST01',
    max_players: 4,
    board_size: 4,
    turn_duration: 30,
    member_count: 2,
    created_by: 1,
    status: 'waiting',
    members: [
      { userId: 1, username: 'player1', isHost: true },
      { userId: 2, username: 'player2', isHost: false }
    ]
  },
  startGame: vi.fn(),
  leaveRoom: vi.fn(),
  isLoading: false,
  error: null
};

// Mock the useGame hook
vi.mock('../../contexts/GameContext', () => ({
  useGame: () => mockGameContext
}));

// Mock the useAuth hook
vi.mock('../../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: 1, username: 'player1' },
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
        <RoomLobby onStartGame={vi.fn()} />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('RoomLobby Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display room information correctly', () => {
    renderRoomLobby();

    expect(screen.getByText('Test Room')).toBeInTheDocument();
    expect(screen.getByText('TEST01')).toBeInTheDocument();
    expect(screen.getByText('4×4')).toBeInTheDocument(); // Board size
    expect(screen.getByText('4')).toBeInTheDocument(); // Max players
    expect(screen.getByText('30s')).toBeInTheDocument(); // Turn duration
  });

  it('should display player list correctly', () => {
    renderRoomLobby();

    expect(screen.getByText('player1')).toBeInTheDocument();
    expect(screen.getByText('player2')).toBeInTheDocument();
    expect(screen.getByText('Spelare (2/4)')).toBeInTheDocument();
  });

  it('should show empty slots for remaining players', () => {
    renderRoomLobby();

    const emptySlots = screen.getAllByText('Väntar på spelare...');
    expect(emptySlots).toHaveLength(2); // 4 max - 2 current = 2 empty
  });

  it('should enable start game button when conditions are met', () => {
    renderRoomLobby();

    const startButton = screen.getByText(/starta spel/i);
    expect(startButton).not.toBeDisabled();
  });

  it('should disable start game button with insufficient players', () => {
    const singlePlayerRoom = {
      ...mockRoom,
      member_count: 1
    };
    
    const singlePlayer = [
      { id: 1, username: 'player1', isHost: true }
    ];

    render(
      <BrowserRouter>
        <AuthProvider>
          <GameProvider>
            <RoomLobby 
              currentRoom={singlePlayerRoom}
              playerList={singlePlayer}
              onStartGame={vi.fn()}
              onLeaveRoom={vi.fn()}
            />
          </GameProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    const startButton = screen.getByText(/starta spel/i);
    expect(startButton).toBeDisabled();
  });

  it('should handle room code copying', async () => {
    // Mock clipboard API
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined)
    };
    Object.assign(navigator, { clipboard: mockClipboard });

    renderRoomLobby();

    const copyButton = screen.getByLabelText(/kopiera rumskod/i);
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith('TEST01');
    });
  });

  it('should handle start game action', () => {
    const mockStartGame = vi.fn();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <GameProvider>
            <RoomLobby 
              currentRoom={mockRoom}
              playerList={mockPlayers}
              onStartGame={mockStartGame}
              onLeaveRoom={vi.fn()}
            />
          </GameProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    const startButton = screen.getByText(/starta spel/i);
    fireEvent.click(startButton);

    expect(mockStartGame).toHaveBeenCalled();
  });

  it('should handle leave room action', () => {
    const mockLeaveRoom = vi.fn();
    
    render(
      <BrowserRouter>
        <AuthProvider>
          <GameProvider>
            <RoomLobby 
              currentRoom={mockRoom}
              playerList={mockPlayers}
              onStartGame={vi.fn()}
              onLeaveRoom={mockLeaveRoom}
            />
          </GameProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    const leaveButton = screen.getByText(/lämna rum/i);
    fireEvent.click(leaveButton);

    expect(mockLeaveRoom).toHaveBeenCalled();
  });
});

describe('RoomLobby Edge Cases', () => {
  it('should handle missing room data gracefully', () => {
    const incompleteRoom = {
      id: 1,
      name: 'Incomplete Room',
      code: 'INC123'
      // Missing max_players, board_size, etc.
    };

    render(
      <BrowserRouter>
        <AuthProvider>
          <GameProvider>
            <RoomLobby 
              currentRoom={incompleteRoom as any}
              playerList={[]}
              onStartGame={vi.fn()}
              onLeaveRoom={vi.fn()}
            />
          </GameProvider>
        </AuthProvider>
      </BrowserRouter>
    );

    // Should use fallback values
    expect(screen.getByText('4×4')).toBeInTheDocument(); // Default board size
    expect(screen.getByText('Spelare (0/4)')).toBeInTheDocument(); // Default max players
  });
});