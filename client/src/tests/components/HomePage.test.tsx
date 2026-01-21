import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import HomePage from '../../pages/HomePage';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
const mockUser = { id: 123, username: 'testuser' };
const mockLogout = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}));

// Mock GameContext
const mockJoinRoom = vi.fn();
const mockLeaveRoom = vi.fn();
vi.mock('../../contexts/GameContext', () => ({
  useGame: () => ({
    joinRoom: mockJoinRoom,
    leaveRoom: mockLeaveRoom,
    currentRoom: null,
  }),
}));

// Mock Logo component (alias import)
vi.mock('@/assets/Logo', () => ({
  default: (props: any) => <div data-testid="logo" {...props}>Logo</div>
}));

// Mock apiService
const mockGetRooms = vi.fn();
const mockCreateRoom = vi.fn();
const mockGetOnlineStats = vi.fn();
vi.mock('../../services/apiService', () => ({
  apiService: {
    getRooms: () => mockGetRooms(),
    createRoom: (...args: any[]) => mockCreateRoom(...args),
    getOnlineStats: () => mockGetOnlineStats(),
  },
}));

// Mock socketService
vi.mock('../../services/socketService', () => ({
  socketService: {
    isConnected: () => false,
    on: vi.fn(),
    off: vi.fn(),
    getSocket: vi.fn(() => null),
  },
}));

const renderHomePage = () => {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true } as any}>
      <HomePage />
    </BrowserRouter>
  );
};

describe('HomePage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockGetRooms.mockResolvedValue([]);
    mockGetOnlineStats.mockResolvedValue({ online: { total: 1, authenticated: 1, anonymous: 0 } });
    mockJoinRoom.mockResolvedValue({ success: true });
    mockLeaveRoom.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Header and layout', () => {
    it('renders welcome copy and user menu', async () => {
      renderHomePage();

      expect(screen.getByText('Välkommen till GnarPuzzle')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /användarmeny/i })).toBeInTheDocument();

      // Let async effects (room list + online stats) settle to avoid act warnings.
      await waitFor(() => expect(mockGetRooms).toHaveBeenCalled());
      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('shows available rooms count and user info', async () => {
      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText('Tillgängliga rum (0)')).toBeInTheDocument();
        expect(screen.getByText(/Inloggad som:/)).toBeInTheDocument();
        expect(screen.getByText(/testuser/)).toBeInTheDocument();
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });
  });

  describe('Room list', () => {
    it('shows empty state when no rooms are available', async () => {
      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText('Inga rum tillgängliga')).toBeInTheDocument();
        expect(screen.getByText('Skapa det första rummet')).toBeInTheDocument();
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('renders available rooms with details', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '1',
          name: 'Test Room',
          code: 'ABC123',
          member_count: 2,
          max_players: 4,
          board_size: 4,
          settings: { placement_timer: 30, letter_timer: 20 },
        },
      ]);

      renderHomePage();

      await waitFor(() => {
        expect(screen.getByText('Test Room')).toBeInTheDocument();
        expect(screen.getByText('Tillgängliga rum (1)')).toBeInTheDocument();
        expect(screen.getByText(/20\s*s/)).toBeInTheDocument();
        expect(screen.getByText(/4\s*×\s*4/)).toBeInTheDocument();
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('joins a room when clicking a non-full room card', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '1',
          name: 'Open Room',
          code: 'OPEN01',
          member_count: 1,
          max_players: 4,
          board_size: 5,
          settings: { placement_timer: 25, letter_timer: 15 },
        },
      ]);

      renderHomePage();

      const card = await screen.findByText('Open Room');
      fireEvent.click(card.closest('.card')!);

      await waitFor(() => {
        expect(mockJoinRoom).toHaveBeenCalledWith('OPEN01', undefined);
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('prompts for password when room is locked and joins with provided code', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '2',
          name: 'Locked Room',
          code: 'LOCK01',
          member_count: 1,
          max_players: 4,
          board_size: 5,
          settings: { require_password: true, placement_timer: 25, letter_timer: 15 },
        },
      ]);

      renderHomePage();

      // Simulate backend behavior: first join attempt fails with "Password required",
      // then succeeds once the user enters the code.
      mockJoinRoom
        .mockRejectedValueOnce(new Error('Password required'))
        .mockResolvedValueOnce({ success: true });

      const card = await screen.findByText('Locked Room');
      fireEvent.click(card.closest('.card')!);

      await waitFor(() => {
        expect(screen.getByText('Lösenord krävs')).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText('Ange rumskoden') as HTMLInputElement;
      fireEvent.change(passwordInput, { target: { value: 'secret' } });
      expect(passwordInput.value).toBe('SECRET');

      fireEvent.click(screen.getByRole('button', { name: /gå med/i }));

      await waitFor(() => {
        expect(mockJoinRoom).toHaveBeenCalledWith('LOCK01', 'SECRET');
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });
  });

  describe('Create room modal', () => {
    it('opens modal from empty state action', async () => {
      renderHomePage();

      const openButton = await screen.findByText('Skapa det första rummet');
      fireEvent.click(openButton);

      expect(await screen.findByText('Skapa nytt rum')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Mitt coola rum')).toBeInTheDocument();

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('disables submit when room name is empty', async () => {
      renderHomePage();

      const openButton = await screen.findByText('Skapa det första rummet');
      fireEvent.click(openButton);

      const submitButton = await screen.findByText('Skapa rum');
      expect(submitButton).toBeDisabled();

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });

    it('submits room creation with defaults and joins room', async () => {
      mockCreateRoom.mockResolvedValue({ room: { id: '10', code: 'NEW123' } });

      renderHomePage();

      const openButton = await screen.findByText('Skapa det första rummet');
      fireEvent.click(openButton);

      const nameInput = await screen.findByPlaceholderText('Mitt coola rum');
      fireEvent.change(nameInput, { target: { value: 'My New Room' } });

      const submitButton = screen.getByText('Skapa rum');
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockCreateRoom).toHaveBeenCalledWith('My New Room', {
          max_players: 4,
          board_size: 5,
          letter_timer: 20,
          placement_timer: 30,
          require_password: false,
        });
      });

      await waitFor(() => {
        expect(mockJoinRoom).toHaveBeenCalledWith('NEW123');
      });

      await waitFor(() => expect(mockGetOnlineStats).toHaveBeenCalled());
    });
  });
});
