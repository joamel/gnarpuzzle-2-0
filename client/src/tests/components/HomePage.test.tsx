import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HomePage from '@/pages/HomePage';
import type { Room } from '../../../../shared/types';

// Mock data
const mockUser = { id: 123, username: 'testuser' };

const mockRoom: Room = {
  id: '1',
  code: 'TEST01',
  name: 'Test Room',
  createdBy: '123',
  createdAt: new Date(),
  settings: {
    grid_size: 4,
    max_players: 4,
    letter_timer: 30,
    placement_timer: 30,
    is_private: false
  },
  players: [
    { userId: '123', username: 'testuser', ready: false, score: 0, position: 0 }
  ]
};

// Mock the contexts
const mockAuthContext = {
  user: mockUser,
  login: vi.fn(),
  logout: vi.fn(),
  isAuthenticated: true
};

const mockGameContext = {
  currentRoom: null,
  createRoom: vi.fn().mockResolvedValue({ success: true, room: mockRoom }),
  joinRoom: vi.fn().mockResolvedValue({ success: true, room: mockRoom }),
  leaveRoom: vi.fn(),
  startGame: vi.fn(),
  isLoading: false,
  error: null,
  currentGame: null,
  gamePhase: null,
  gameTimer: null,
  selectedLetter: null,
  placementPosition: null,
  currentPlayer: null,
  selectLetter: vi.fn(),
  placeLetter: vi.fn(),
  confirmPlacement: vi.fn(),
  leaderboard: null
};

// Mock the navigate function
const mockNavigate = vi.fn();

// Mock the useGame hook
vi.mock('../../contexts/GameContext', () => ({
  GameProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGame: () => mockGameContext
}));

// Mock the useAuth hook
vi.mock('../../contexts/AuthContext', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => mockAuthContext
}));

// Mock react-router-dom
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    BrowserRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>
  };
});

// Mock API service
vi.mock('../../services/apiService', () => ({
  apiService: {
    getRoomByCode: vi.fn()
  }
}));

const renderHomePage = () => {
  return render(
    <BrowserRouter>
      <HomePage />
    </BrowserRouter>
  );
};

describe('HomePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should render welcome message and main buttons', () => {
    renderHomePage();
    
    expect(screen.getByText('Välkommen till GnarPuzzle 2.0!')).toBeDefined();
    expect(screen.getByText('🎯 Skapa rum')).toBeDefined();
    expect(screen.getByText('🔗 Gå med i rum')).toBeDefined();
  });

  it('should display username when authenticated', () => {
    renderHomePage();
    
    expect(screen.getByText('Inloggad som: testuser')).toBeDefined();
  });

  it('should open create room modal when Skapa rum is clicked', async () => {
    renderHomePage();
    
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    expect(screen.getByText('Skapa nytt rum')).toBeDefined();
    expect(screen.getByPlaceholderText('Rumnamn')).toBeDefined();
    expect(screen.getByText('Skapa rum')).toBeDefined();
  });

  it('should open join room modal when Gå med i rum is clicked', () => {
    renderHomePage();
    
    const joinButton = screen.getByText('🔗 Gå med i rum');
    fireEvent.click(joinButton);
    
    expect(screen.getByText('Gå med i rum')).toBeDefined();
    expect(screen.getByPlaceholderText('Rumkod (6 tecken)')).toBeDefined();
    expect(screen.getByText('Gå med')).toBeDefined();
  });

  it('should handle successful room creation', async () => {
    vi.useFakeTimers();
    
    renderHomePage();
    
    // Open create modal
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    // Fill in room name
    const roomNameInput = screen.getByPlaceholderText('Rumnamn');
    fireEvent.change(roomNameInput, { target: { value: 'Test Room' } });
    
    // Submit form
    const createSubmitButton = screen.getByText('Skapa rum');
    fireEvent.click(createSubmitButton);
    
    await waitFor(() => {
      expect(mockGameContext.createRoom).toHaveBeenCalledWith({ name: 'Test Room' });
    });

    // Fast-forward timer for navigation delay
    vi.advanceTimersByTime(100);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/lobby');
    });
    
    vi.useRealTimers();
  });

  it('should handle room creation with loading state', async () => {
    // Mock loading state
    const loadingGameContext = { ...mockGameContext, isLoading: true };
    vi.mocked(vi.doMock('../../contexts/GameContext', () => ({
      useGame: () => loadingGameContext
    })));
    
    renderHomePage();
    
    // Open modal and try to create room
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    const roomNameInput = screen.getByPlaceholderText('Rumnamn');
    fireEvent.change(roomNameInput, { target: { value: 'Test Room' } });
    
    const createSubmitButton = screen.getByText('Skapa rum');
    expect(createSubmitButton.getAttribute('disabled')).toBe('');
  });

  it('should handle successful room joining', async () => {
    vi.useFakeTimers();
    
    renderHomePage();
    
    // Open join modal
    const joinButton = screen.getByText('🔗 Gå med i rum');
    fireEvent.click(joinButton);
    
    // Fill in room code
    const roomCodeInput = screen.getByPlaceholderText('Rumkod (6 tecken)');
    fireEvent.change(roomCodeInput, { target: { value: 'TEST01' } });
    
    // Submit form
    const joinSubmitButton = screen.getByText('Gå med');
    fireEvent.click(joinSubmitButton);
    
    await waitFor(() => {
      expect(mockGameContext.joinRoom).toHaveBeenCalledWith('TEST01');
    });
    
    // Fast-forward timer for navigation delay
    vi.advanceTimersByTime(100);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/lobby');
    });
    
    vi.useRealTimers();
  });

  it('should handle room creation error', async () => {
    const errorGameContext = {
      ...mockGameContext,
      createRoom: vi.fn().mockResolvedValue({ success: false, error: 'Failed to create room' })
    };
    
    vi.mocked(vi.doMock('../../contexts/GameContext', () => ({
      useGame: () => errorGameContext
    })));
    
    renderHomePage();
    
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    const roomNameInput = screen.getByPlaceholderText('Rumnamn');
    fireEvent.change(roomNameInput, { target: { value: 'Test Room' } });
    
    const createSubmitButton = screen.getByText('Skapa rum');
    fireEvent.click(createSubmitButton);
    
    await waitFor(() => {
      expect(errorGameContext.createRoom).toHaveBeenCalledWith({ name: 'Test Room' });
    });
    
    // Should not navigate on error
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should handle room join error', async () => {
    const errorGameContext = {
      ...mockGameContext,
      joinRoom: vi.fn().mockResolvedValue({ success: false, error: 'Room not found' })
    };
    
    vi.mocked(vi.doMock('../../contexts/GameContext', () => ({
      useGame: () => errorGameContext
    })));
    
    renderHomePage();
    
    const joinButton = screen.getByText('🔗 Gå med i rum');
    fireEvent.click(joinButton);
    
    const roomCodeInput = screen.getByPlaceholderText('Rumkod (6 tecken)');
    fireEvent.change(roomCodeInput, { target: { value: 'INVALID' } });
    
    const joinSubmitButton = screen.getByText('Gå med');
    fireEvent.click(joinSubmitButton);
    
    await waitFor(() => {
      expect(errorGameContext.joinRoom).toHaveBeenCalledWith('INVALID');
    });
    
    // Should not navigate on error
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('should close modals when Avbryt is clicked', () => {
    renderHomePage();
    
    // Test create modal
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    expect(screen.getByText('Skapa nytt rum')).toBeDefined();
    
    const cancelButton = screen.getByText('Avbryt');
    fireEvent.click(cancelButton);
    
    expect(screen.queryByText('Skapa nytt rum')).toBeNull();
  });

  it('should validate room code input length', () => {
    renderHomePage();
    
    const joinButton = screen.getByText('🔗 Gå med i rum');
    fireEvent.click(joinButton);
    
    const roomCodeInput = screen.getByPlaceholderText('Rumkod (6 tecken)');
    const joinSubmitButton = screen.getByText('Gå med');
    
    // Test with short code
    fireEvent.change(roomCodeInput, { target: { value: 'TEST' } });
    expect(joinSubmitButton.getAttribute('disabled')).toBe('');
    
    // Test with valid code
    fireEvent.change(roomCodeInput, { target: { value: 'TEST01' } });
    expect(joinSubmitButton.getAttribute('disabled')).toBeNull();
  });

  it('should require room name for creation', () => {
    renderHomePage();
    
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    const roomNameInput = screen.getByPlaceholderText('Rumnamn');
    const createSubmitButton = screen.getByText('Skapa rum');
    
    // Test with empty name
    expect(createSubmitButton.getAttribute('disabled')).toBe('');
    
    // Test with valid name
    fireEvent.change(roomNameInput, { target: { value: 'Valid Room Name' } });
    expect(createSubmitButton.getAttribute('disabled')).toBeNull();
  });

  it('should prevent double submission during room creation', async () => {
    renderHomePage();
    
    const createButton = screen.getByText('🎯 Skapa rum');
    fireEvent.click(createButton);
    
    const roomNameInput = screen.getByPlaceholderText('Rumnamn');
    fireEvent.change(roomNameInput, { target: { value: 'Test Room' } });
    
    const createSubmitButton = screen.getByText('Skapa rum');
    
    // Click multiple times rapidly
    fireEvent.click(createSubmitButton);
    fireEvent.click(createSubmitButton);
    fireEvent.click(createSubmitButton);
    
    await waitFor(() => {
      expect(mockGameContext.createRoom).toHaveBeenCalledTimes(1);
    });
  });

  it('should prevent double submission during room joining', async () => {
    renderHomePage();
    
    const joinButton = screen.getByText('🔗 Gå med i rum');
    fireEvent.click(joinButton);
    
    const roomCodeInput = screen.getByPlaceholderText('Rumkod (6 tecken)');
    fireEvent.change(roomCodeInput, { target: { value: 'TEST01' } });
    
    const joinSubmitButton = screen.getByText('Gå med');
    
    // Click multiple times rapidly
    fireEvent.click(joinSubmitButton);
    fireEvent.click(joinSubmitButton);
    fireEvent.click(joinSubmitButton);
    
    await waitFor(() => {
      expect(mockGameContext.joinRoom).toHaveBeenCalledTimes(1);
    });
  });
});