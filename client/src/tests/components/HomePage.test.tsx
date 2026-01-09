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
vi.mock('../../contexts/GameContext', () => ({
  useGame: () => ({
    joinRoom: mockJoinRoom,
    currentRoom: null,
  }),
}));

// Mock apiService
const mockGetRooms = vi.fn();
const mockCreateRoom = vi.fn();
vi.mock('../../services/apiService', () => ({
  apiService: {
    getRooms: () => mockGetRooms(),
    createRoom: (...args: any[]) => mockCreateRoom(...args),
  },
}));

// Mock socketService
vi.mock('../../services/socketService', () => ({
  socketService: {
    isConnected: () => false,
    on: vi.fn(),
    off: vi.fn(),
  },
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
    mockGetRooms.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Header', () => {
    it('should render header with username', async () => {
      renderHomePage();
      
      expect(screen.getByText('🧩 GnarPuzzle')).toBeInTheDocument();
      expect(screen.getByText(/Hej, testuser!/)).toBeInTheDocument();
    });

    it('should have logout button', () => {
      renderHomePage();
      
      const logoutButton = screen.getByRole('button', { name: /logga ut/i });
      expect(logoutButton).toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    it('should render create room button', () => {
      renderHomePage();
      
      expect(screen.getByText('🎮 Skapa nytt rum')).toBeInTheDocument();
    });

    it('should render room code input and join button', () => {
      renderHomePage();
      
      expect(screen.getByPlaceholderText(/Rumskod/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /gå med/i })).toBeInTheDocument();
    });

    it('should disable join button when room code is empty', () => {
      renderHomePage();
      
      const joinButton = screen.getByRole('button', { name: /gå med/i });
      expect(joinButton).toBeDisabled();
    });

    it('should enable join button when room code is entered', () => {
      renderHomePage();
      
      const input = screen.getByPlaceholderText(/Rumskod/i);
      fireEvent.change(input, { target: { value: 'ABC123' } });
      
      const joinButton = screen.getByRole('button', { name: /gå med/i });
      expect(joinButton).not.toBeDisabled();
    });

    it('should convert room code to uppercase', () => {
      renderHomePage();
      
      const input = screen.getByPlaceholderText(/Rumskod/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'abc123' } });
      
      expect(input.value).toBe('ABC123');
    });
  });

  describe('Room List', () => {
    it('should show empty state when no rooms available', async () => {
      mockGetRooms.mockResolvedValue([]);
      renderHomePage();
      
      await waitFor(() => {
        expect(screen.getByText('Inga rum tillgängliga')).toBeInTheDocument();
      });
    });

    it('should display available rooms', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '1',
          name: 'Test Room',
          code: 'ABC123',
          member_count: 2,
          max_players: 4,
          board_size: 4,
        },
      ]);
      
      renderHomePage();
      
      await waitFor(() => {
        expect(screen.getByText('Test Room')).toBeInTheDocument();
        expect(screen.getByText('ABC123')).toBeInTheDocument();
        expect(screen.getByText('Tillgängliga rum (1)')).toBeInTheDocument();
      });
    });

    it('should show Fullt button for full rooms', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '1',
          name: 'Full Room',
          code: 'FULL01',
          member_count: 4,
          max_players: 4,
          board_size: 4,
        },
      ]);
      
      renderHomePage();
      
      await waitFor(() => {
        expect(screen.getByText('Fullt')).toBeInTheDocument();
      });
    });

    it('should have refresh button', () => {
      renderHomePage();
      
      const refreshButton = screen.getByRole('button', { name: /uppdatera rumslista/i });
      expect(refreshButton).toBeInTheDocument();
    });
  });

  describe('Create Room Modal', () => {
    it('should open modal when create button is clicked', async () => {
      renderHomePage();
      
      const createButton = screen.getByText('🎮 Skapa nytt rum');
      fireEvent.click(createButton);
      
      // Modal should appear with title
      await waitFor(() => {
        expect(screen.getByText('Skapa nytt rum')).toBeInTheDocument();
      });
    });

    it('should have room name input in modal', async () => {
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Mitt coola rum')).toBeInTheDocument();
      });
    });

    it('should have player and board size selects', async () => {
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        expect(screen.getByText('Max spelare')).toBeInTheDocument();
        expect(screen.getByText(/Brädstorlek/)).toBeInTheDocument();
      });
    });

    it('should close modal when close button is clicked', async () => {
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        expect(screen.getByText('Skapa nytt rum')).toBeInTheDocument();
      });
      
      const closeButton = screen.getByRole('button', { name: /stäng/i });
      fireEvent.click(closeButton);
      
      // Modal content should be gone (only one "Skapa nytt rum" from main button)
      await waitFor(() => {
        const elements = screen.getAllByText(/Skapa nytt rum/);
        expect(elements).toHaveLength(1);
      });
    });

    it('should disable submit when room name is empty', async () => {
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        const submitButton = screen.getByText('Skapa rum');
        expect(submitButton).toBeDisabled();
      });
    });

    it('should enable submit when room name is entered', async () => {
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText('Mitt coola rum');
        fireEvent.change(input, { target: { value: 'My Room' } });
        
        const submitButton = screen.getByText('Skapa rum');
        expect(submitButton).not.toBeDisabled();
      });
    });
  });

  describe('Room Joining', () => {
    it('should call joinRoom when joining by code', async () => {
      mockJoinRoom.mockResolvedValue({ success: true });
      renderHomePage();
      
      const input = screen.getByPlaceholderText(/Rumskod/i);
      fireEvent.change(input, { target: { value: 'TEST01' } });
      
      const joinButton = screen.getByRole('button', { name: /gå med/i });
      fireEvent.click(joinButton);
      
      await waitFor(() => {
        expect(mockJoinRoom).toHaveBeenCalledWith('TEST01');
      });
    });

    it('should call joinRoom when clicking join on room card', async () => {
      mockGetRooms.mockResolvedValue([
        {
          id: '1',
          name: 'Test Room',
          code: 'ABC123',
          member_count: 1,
          max_players: 4,
          board_size: 4,
        },
      ]);
      mockJoinRoom.mockResolvedValue({ success: true });
      
      renderHomePage();
      
      await waitFor(() => {
        expect(screen.getByText('Test Room')).toBeInTheDocument();
      });
      
      // Get the join button on the room card (not the one in quick actions)
      const joinButtons = screen.getAllByText('Gå med');
      fireEvent.click(joinButtons[joinButtons.length - 1]); // Last one is on room card
      
      await waitFor(() => {
        expect(mockJoinRoom).toHaveBeenCalledWith('ABC123');
      });
    });
  });

  describe('Room Creation', () => {
    it('should call createRoom with correct parameters', async () => {
      mockCreateRoom.mockResolvedValue({ 
        room: { id: '1', code: 'NEW123' } 
      });
      mockJoinRoom.mockResolvedValue({ success: true });
      
      renderHomePage();
      
      fireEvent.click(screen.getByText('🎮 Skapa nytt rum'));
      
      await waitFor(() => {
        const input = screen.getByPlaceholderText('Mitt coola rum');
        fireEvent.change(input, { target: { value: 'My New Room' } });
      });
      
      const submitButton = screen.getByText('Skapa rum');
      fireEvent.click(submitButton);
      
      await waitFor(() => {
        expect(mockCreateRoom).toHaveBeenCalledWith(
          'My New Room',
          expect.objectContaining({
            max_players: 4,
            board_size: 4,
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when join fails', async () => {
      mockJoinRoom.mockRejectedValue(new Error('Rummet finns inte'));
      
      renderHomePage();
      
      const input = screen.getByPlaceholderText(/Rumskod/i);
      fireEvent.change(input, { target: { value: 'INVALID' } });
      
      const joinButton = screen.getByRole('button', { name: /gå med/i });
      fireEvent.click(joinButton);
      
      await waitFor(() => {
        expect(screen.getByText('Rummet finns inte')).toBeInTheDocument();
      });
    });
  });
});
