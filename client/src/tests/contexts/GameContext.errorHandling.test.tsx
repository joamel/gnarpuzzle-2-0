import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { GameProvider, useGame } from '../../contexts/GameContext';
import { socketService } from '../../services/socketService';

// Mock socketService
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

// Mock apiService
vi.mock('../../services/apiService', () => ({
  apiService: {
    getGame: vi.fn(),
    getRoomByCode: vi.fn()
  }
}));

// Mock AuthContext
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    token: 'test-token'
  })
}));

describe('GameContext Error Handling', () => {
  let eventHandlers: Map<string, Function>;

  beforeEach(() => {
    vi.clearAllMocks();
    eventHandlers = new Map();

    // Capture event handlers
    (socketService.on as any).mockImplementation((event: string, handler: Function) => {
      eventHandlers.set(event, handler);
    });
  });

  const TestComponent = () => {
    const { gamePhase, leaderboard, players } = useGame();
    return (
      <div>
        <div data-testid="game-phase">{gamePhase}</div>
        <div data-testid="leaderboard-count">{leaderboard?.length || 0}</div>
        <div data-testid="player-count">{players.length}</div>
      </div>
    );
  };

  it('should handle malformed JSON in game:ended event gracefully', async () => {
    const { getByTestId } = render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    // Trigger game:ended with malformed leaderboard data
    const gameEndedHandler = eventHandlers.get('game:ended');
    expect(gameEndedHandler).toBeDefined();

    const malformedData = {
      gameId: 1,
      leaderboard: [
        {
          userId: 1,
          username: 'player1',
          score: 100,
          grid: 'invalid-json{{{',  // Malformed JSON
          words: '["word1", "word2"]'
        }
      ]
    };

    // Should not throw
    expect(() => {
      gameEndedHandler!(malformedData);
    }).not.toThrow();

    // Should still update phase to finished
    await waitFor(() => {
      expect(getByTestId('game-phase').textContent).toBe('finished');
    });
  });

  it('should handle missing data in letter:placed event gracefully', async () => {
    render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    const letterPlacedHandler = eventHandlers.get('letter:placed');
    expect(letterPlacedHandler).toBeDefined();

    // Trigger with incomplete data
    const incompleteData = {
      playerId: 1,
      // Missing letter, x, y
    };

    // Should not throw
    expect(() => {
      letterPlacedHandler!(incompleteData);
    }).not.toThrow();
  });

  it('should handle null/undefined room data in room:updated event', async () => {
    render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    const roomUpdatedHandler = eventHandlers.get('room:updated');
    expect(roomUpdatedHandler).toBeDefined();

    // Trigger with null room
    expect(() => {
      roomUpdatedHandler!({ room: null });
    }).not.toThrow();

    // Trigger with undefined data
    expect(() => {
      roomUpdatedHandler!(undefined);
    }).not.toThrow();
  });

  it('should handle errors in turn:skipped event', async () => {
    render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    const turnSkippedHandler = eventHandlers.get('turn:skipped');
    expect(turnSkippedHandler).toBeDefined();

    // Trigger with various invalid data
    expect(() => {
      turnSkippedHandler!({});
    }).not.toThrow();

    expect(() => {
      turnSkippedHandler!(null);
    }).not.toThrow();

    expect(() => {
      turnSkippedHandler!({ nextPlayerId: 'invalid' });
    }).not.toThrow();
  });

  it('should recover from API failures with fallback behavior', async () => {
    const { getByTestId } = render(
      <GameProvider>
        <TestComponent />
      </GameProvider>
    );

    const gameStartedHandler = eventHandlers.get('game:started');
    expect(gameStartedHandler).toBeDefined();

    // Import apiService to mock failure
    const { apiService } = await import('../../services/apiService');
    (apiService.getGame as any).mockRejectedValue(new Error('Network error'));

    // Trigger game:started - should use fallback
    gameStartedHandler!({
      gameId: 1,
      roomId: 1,
      phase: 'letter_selection',
      currentTurn: 1
    });

    // Should still update phase using fallback
    await waitFor(() => {
      expect(getByTestId('game-phase').textContent).toBe('letter_selection');
    }, { timeout: 3000 });
  });
});
