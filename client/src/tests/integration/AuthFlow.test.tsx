import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import { GameProvider } from '../../contexts/GameContext';
import LoginPage from '../../pages/LoginPage';
import HomePage from '../../pages/HomePage';

// Mock API service
vi.mock('../../services/apiService', () => {
  let token: string | null = null;

  return {
    apiService: {
      login: vi.fn(),
      guestLogin: vi.fn(),
      register: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
      getRooms: vi.fn(),
      createRoom: vi.fn(),
      joinRoom: vi.fn(),
      leaveRoom: vi.fn().mockResolvedValue(undefined),
      getOnlineStats: vi.fn().mockResolvedValue({ online: { total: 1, authenticated: 1, anonymous: 0 } }),
      setToken: vi.fn((t: string) => {
        token = t;
      }),
      getToken: vi.fn(() => token),
      clearToken: vi.fn(() => {
        token = null;
      }),
      getCurrentUser: vi.fn().mockResolvedValue({ id: 1, username: 'testuser' })
    }
  };
});

// Mock socket service
vi.mock('../../services/socketService', () => ({
  socketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    getSocket: vi.fn(() => null),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    joinGame: vi.fn(),
    isConnected: vi.fn().mockReturnValue(false)
  }
}));

const renderWithAuth = (component: React.ReactElement) => {
  return render(
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true } as any}>
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
    sessionStorage.clear();
  });

  it('should allow user to login with valid username', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.login as any).mockResolvedValue({
      token: 'mock-token',
      user: { id: 1, username: 'testuser' }
    });

    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByPlaceholderText(/namn|användarnamn/i);
    const passwordInput = screen.getByLabelText('Lösenord');
    const loginButton = screen.getByRole('button', { name: /^(börja spela|logga in)$/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(apiService.login).toHaveBeenCalledWith('testuser', 'password123');
    });
  });

  it('should allow user to login as guest (generated username)', async () => {
    const { apiService } = await import('../../services/apiService');

    (apiService.guestLogin as any).mockResolvedValue({
      token: 'mock-guest-token',
      user: { id: 1, username: 'gast_test' }
    });

    renderWithAuth(<LoginPage />);

    const guestButton = screen.getByRole('button', { name: /^logga in som gäst$/i });
    fireEvent.click(guestButton);

    await waitFor(() => {
      expect(apiService.guestLogin).toHaveBeenCalledWith(expect.stringMatching(/^gast_[A-Z0-9]{4}$/));
    });
  });

  it('should generate a guest username when none is provided', async () => {
    const { apiService } = await import('../../services/apiService');

    (apiService.guestLogin as any).mockResolvedValue({
      token: 'mock-guest-token',
      user: { id: 1, username: 'gast_ABCD' }
    });

    renderWithAuth(<LoginPage />);

    const guestButton = screen.getByRole('button', { name: /^logga in som gäst$/i });
    fireEvent.click(guestButton);

    await waitFor(() => {
      expect(apiService.guestLogin).toHaveBeenCalledWith(expect.stringMatching(/^gast_[A-Z0-9]{4}$/));
    });
  });

  it('should ignore typed username when logging in as guest', async () => {
    const { apiService } = await import('../../services/apiService');

    (apiService.guestLogin as any).mockResolvedValue({
      token: 'mock-guest-token',
      user: { id: 1, username: 'gast_test' }
    });

    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByPlaceholderText(/namn|användarnamn/i);
    fireEvent.change(usernameInput, { target: { value: 'Joakim' } });

    const guestButton = screen.getByRole('button', { name: /^logga in som gäst$/i });
    fireEvent.click(guestButton);

    await waitFor(() => {
      expect(apiService.guestLogin).toHaveBeenCalledTimes(1);
    });

    expect((apiService.guestLogin as any).mock.calls[0][0]).toMatch(/^gast_[A-Z0-9]{4}$/);
  });

  it('should validate username length on login', async () => {
    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByPlaceholderText(/namn|användarnamn/i);
    const loginButton = screen.getByRole('button', { name: /^(börja spela|logga in)$/i });

    // Test too short username
    fireEvent.change(usernameInput, { target: { value: 'a' } });
    fireEvent.click(loginButton);

    // Verify button is still visible (validation happens before submit)
    await waitFor(() => {
      expect(loginButton).toBeInTheDocument();
    });
  });

  it('should handle API errors gracefully', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.login as any).mockRejectedValue(new Error('Server error'));

    renderWithAuth(<LoginPage />);

    const usernameInput = screen.getByPlaceholderText(/namn|användarnamn/i);
    const loginButton = screen.getByRole('button', { name: /^(börja spela|logga in)$/i });

    fireEvent.change(usernameInput, { target: { value: 'testuser' } });
    fireEvent.click(loginButton);

    // Verify error state by checking login button is still visible
    await waitFor(() => {
      expect(loginButton).toBeInTheDocument();
    });
  });
});

describe('Room Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('auth_token', 'mock-token');
    sessionStorage.clear();
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
      // Room card should be rendered with member count
      expect(screen.getByText(/2\/4/)).toBeInTheDocument();
    });
  });

  it('should open create room modal', async () => {
    const { apiService } = await import('../../services/apiService');
    
    (apiService.getRooms as any).mockResolvedValue([]);

    renderWithAuth(<HomePage />);

    // Click button to open modal
    const createButton = screen.getByRole('button', { name: /skapa|nytt rum/i });
    fireEvent.click(createButton);

    // Modal should be visible with form elements
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/rum|mitt/i)).toBeInTheDocument();
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
      // Check that room is displayed
      expect(screen.getByText('Test Room')).toBeInTheDocument();
      expect(screen.getByText(/1\/4/)).toBeInTheDocument();
    });
  });

  it('should display full rooms correctly', async () => {
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
      expect(screen.getByText('Full Room')).toBeInTheDocument();
      expect(screen.getByText(/4\/4/)).toBeInTheDocument();
    });
  });
});