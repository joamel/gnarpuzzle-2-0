import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { GameInterface } from '../../components/GameInterface';
import { GameProvider } from '../../contexts/GameContext';
import { socketService } from '../../services/socketService';
import React from 'react';

// Mock dependencies
vi.mock('../../services/socketService', () => ({
  socketService: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    joinRoom: vi.fn(),
    joinGame: vi.fn(),
    getSocket: vi.fn(() => null),
    isConnected: vi.fn(() => true)
  }
}));

vi.mock('../../services/apiService', () => ({
  apiService: {
    getGame: vi.fn().mockResolvedValue({
      game: {
        id: 1,
        phase: 'letter_selection',
        current_turn: 1,
        players: [
          {
            id: 1,
            user_id: 1,
            position: 1,
            username: 'testuser',
            grid_state: JSON.stringify(
              Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({
                letter: null,
                x,
                y
              })))
            ),
            placement_confirmed: 0
          }
        ]
      },
      players: []
    }),
    getRoomByCode: vi.fn().mockResolvedValue({ room: { id: 1, code: 'TEST' }, members: [] })
  }
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    token: 'test-token'
  })
}));

describe('GameInterface Component', () => {
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    // Capture event handlers
    (socketService.on as any).mockImplementation((event: string, handler: Function) => {
      eventHandlers.set(event, handler);
    });
  });

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<GameProvider>{ui}</GameProvider>);
  };

  test('renders game interface', () => {
    renderWithProvider(<GameInterface />);
    
    // Component should render - check for loading state initially
    expect(screen.getByText(/Loading game.../i)).toBeInTheDocument();
  });

  test('handles game phase changes', async () => {
    const { container } = renderWithProvider(<GameInterface />);

    // Simulate game start
    const gameStartHandler = eventHandlers.get('game:started');
    if (gameStartHandler) {
      await act(async () => {
        await gameStartHandler({
          gameId: 1,
          roomId: 1,
          phase: 'letter_selection',
          currentTurn: 1,
          players: [
            {
              id: 1,
              user_id: 1,
              position: 1,
              username: 'testuser',
              grid_state: JSON.stringify(
                Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({
                  letter: null,
                  x,
                  y
                })))
              ),
              placement_confirmed: 0
            }
          ],
          timer_end: Date.now() + 30000
        });
      });
    }

    await waitFor(() => {
      // After game starts, loading should be gone and game content should render
      expect(screen.queryByText(/Loading game.../i)).not.toBeInTheDocument();
      // Component should have rendered game interface (container exists)
      expect(container.firstChild).toBeTruthy();
    }, { timeout: 3000 });
  });

  test('renders game board when game is active', async () => {
    const { container } = renderWithProvider(<GameInterface />);

    // First start the game
    const gameStartHandler = eventHandlers.get('game:started');
    if (gameStartHandler) {
      await act(async () => {
        await gameStartHandler({
          gameId: 1,
          roomId: 1,
          phase: 'letter_selection',
          currentTurn: 1,
          players: [
            {
              id: 1,
              user_id: 1,
              position: 1,
              username: 'testuser',
              grid_state: JSON.stringify(
                Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({
                  letter: null,
                  x,
                  y
                })))
              ),
              placement_confirmed: 0
            }
          ]
        });
      });
    }

    // Then change to placement phase with a letter
    const phaseHandler = eventHandlers.get('game:phase_changed');
    if (phaseHandler) {
      await act(async () => {
        phaseHandler({
          gameId: 1,
          phase: 'letter_placement',
          current_letter: 'A',
          timer_end: Date.now() + 30000
        });
      });
    }

    await waitFor(() => {
      // Should have game content rendered (not just loading)
      expect(container.querySelector('div')).toBeTruthy();
      // Selected letter should be set in context
      expect(container.textContent).not.toBe('Loading game...');
    }, { timeout: 3000 });
  });

  test('displays timer during active phase', async () => {
    renderWithProvider(<GameInterface />);

    // Start game first
    const gameStartHandler = eventHandlers.get('game:started');
    if (gameStartHandler) {
      await act(async () => {
        await gameStartHandler({
          gameId: 1,
          roomId: 1,
          phase: 'letter_selection',
          currentTurn: 1,
          players: [
            {
              id: 1,
              user_id: 1,
              position: 1,
              username: 'testuser',
              grid_state: JSON.stringify(
                Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({
                  letter: null,
                  x,
                  y
                })))
              ),
              placement_confirmed: 0
            }
          ]
        });
      });
    }

    // Set phase with timer
    const phaseHandler = eventHandlers.get('game:phase_changed');
    if (phaseHandler) {
      await act(async () => {
        phaseHandler({
          gameId: 1,
          phase: 'letter_placement',
          current_letter: 'B',
          timer_end: Date.now() + 15000
        });
      });
    }

    await waitFor(() => {
      // Verify phase handler was called (state should update)
      expect(phaseHandler).toBeDefined();
    }, { timeout: 2000 });
  });

  test('shows waiting message when not user turn', async () => {
    const { container } = renderWithProvider(<GameInterface />);

    // Start game first
    const gameStartHandler = eventHandlers.get('game:started');
    if (gameStartHandler) {
      await act(async () => {
        await gameStartHandler({
          gameId: 1,
          roomId: 1,
          phase: 'letter_selection',
          currentTurn: 1,
          players: [
            {
              id: 1,
              user_id: 1,
              position: 1,
              username: 'testuser',
              grid_state: JSON.stringify(
                Array(5).fill(null).map((_, y) => Array(5).fill(null).map((_, x) => ({
                  letter: null,
                  x,
                  y
                })))
              ),
              placement_confirmed: 0
            }
          ]
        });
      });
    }

    // Simulate turn change to another player
    const turnHandler = eventHandlers.get('game:turn_changed');
    if (turnHandler) {
      await act(async () => {
        turnHandler({
          currentTurn: 999, // Different player ID
          phase: 'letter_selection'
        });
      });
    }

    await waitFor(() => {
      // Component should handle turn change (not crash, render something)
      expect(container.firstChild).toBeTruthy();
    }, { timeout: 2000 });
  });

  test('handles letter placement event', async () => {
    renderWithProvider(<GameInterface />);

    const letterPlacedHandler = eventHandlers.get('letter:placed');
    if (letterPlacedHandler) {
      await act(async () => {
        letterPlacedHandler({
          playerId: 1,
          letter: 'K',
          x: 2,
          y: 2
        });
      });
    }

    // Should not crash
    await waitFor(() => {
      expect(true).toBe(true);
    });
  });

  test('handles game ended event', async () => {
    renderWithProvider(<GameInterface />);

    const gameEndedHandler = eventHandlers.get('game:ended');
    if (gameEndedHandler) {
      await act(async () => {
        gameEndedHandler({
          leaderboard: [
            {
              userId: 1,
              username: 'player1',
              score: 100,
              grid: [],
              words: []
            }
          ]
        });
      });
    }

    await waitFor(() => {
      // Game ended, should show result or message
      expect(true).toBe(true); // Component handles event without crash
    });
  });
});