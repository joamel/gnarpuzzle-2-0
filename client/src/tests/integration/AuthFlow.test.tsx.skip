import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { GameProvider } from '../../contexts/GameContext';
import LoginPage from '../../pages/LoginPage';
import HomePage from '../../pages/HomePage';

// Mock API service
vi.mock('../../services/apiService', () => ({
  apiService: {
    login: vi.fn(),
    getRooms: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    setToken: vi.fn(),
    clearToken: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' })
  }
}));

// Mock socket service
vi.mock('../../services/socketService', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false)
  }
}));

const renderWithAuth = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <GameProvider>
          {component}
        </GameProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Authentication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should allow user to login with valid username', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.login as any).mockResolvedValue({
      token: 'mock-token',
      user: { id: 1, username: 'testuser' }
    });

    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByLabelText(/användarnamn/i);
    const loginButton = screen.getByRole('button', { name: /börja spela/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(apiService.login).toHaveBeenCalledWith('testuser');
      expect(apiService.setToken).toHaveBeenCalledWith('mock-token');
    });
  });

  it('should reject login with too short username', async () => {
    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByLabelText(/användarnamn/i);
    const loginButton = screen.getByRole('button', { name: /börja spela/i });

    // Test too short username
    fireEvent.change(usernameInput, { target: { value: 'a' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(screen.getByText(/Användarnamn måste vara minst 2 tecken/i)).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.login as any).mockRejectedValue(new Error('Server error'));

    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByLabelText(/användarnamn/i);
    const loginButton = screen.getByRole('button', { name: /börja spela/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      // The actual error message is rendered from error.message
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });
});

describe('Room Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('auth_token', 'mock-token');
  });

  it('should display available rooms', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.getRooms as any).mockResolvedValue([
      {
        id: 1,
        name: 'Test Room',
        code: 'ABC123',
        member_count: 2,
        max_players: 4,
        board_size: 4
      }
    ]);

    renderWithAuth(<HomePage />);

    await waitFor(() => {
      expect(screen.getByText('Test Room')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      // Room member count is rendered - check the room card exists
      expect(screen.getByText(/Tillgängliga rum/i)).toBeInTheDocument();
    });
  });

  it('should open create room modal', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.getRooms as any).mockResolvedValue([]);

    renderWithAuth(<HomePage />);

    // Click button to open modal
    const createButton = screen.getByText(/skapa nytt rum/i);
    fireEvent.click(createButton);

    // Modal should be visible with form elements
    await waitFor(() => {
      expect(screen.getByText('Skapa nytt rum')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Mitt coola rum')).toBeInTheDocument();
    });
  });

  it('should display join button for available rooms', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.getRooms as any).mockResolvedValue([
      {
        id: 1,
        name: 'Test Room',
        code: 'ABC123',
        member_count: 1,
        max_players: 4,
        board_size: 4
      }
    ]);

    renderWithAuth(<HomePage />);

    await waitFor(() => {
      // Check that room is displayed and join button exists
      expect(screen.getByText('Test Room')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      const joinButtons = screen.getAllByText(/gå med/i);
      expect(joinButtons.length).toBeGreaterThan(0);
    });
  });

  it('should prevent joining full rooms', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.getRooms as any).mockResolvedValue([
      {
        id: 1,
        name: 'Full Room',
        code: 'FULL01',
        member_count: 4,
        max_players: 4,
        board_size: 4
      }
    ]);

    renderWithAuth(<HomePage />);

    await waitFor(() => {
      const fullButton = screen.getByText(/fullt/i);
      expect(fullButton).toBeDisabled();
    });
  });
});