import express from 'express';
import { GameModel, PlayerModel } from '../models';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /api/games/:id
 * Get game details
 * Requires authentication
 */
router.get('/:id', AuthService.authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    const gameWithPlayers = await GameModel.getWithPlayers(gameId);
    if (!gameWithPlayers) {
      res.status(404).json({
        error: 'Game not found',
        message: 'No game found with that ID'
      });
      return;
    }

    // Mobile-optimized response
    res.status(200).json({
      success: true,
      game: {
        id: gameWithPlayers.id,
        room_id: gameWithPlayers.room_id,
        state: gameWithPlayers.state,
        current_phase: gameWithPlayers.current_phase, // Add current_phase
        current_turn: gameWithPlayers.current_turn,
        turn_number: gameWithPlayers.turn_number,
        board_state: gameWithPlayers.board_state,
        turn_started_at: gameWithPlayers.turn_started_at,
        players: gameWithPlayers.players.map(player => ({
          id: player.id,
          user_id: player.user_id,
          username: player.username,
          position: player.position,
          score: player.score,
          ready_to_start: player.ready_to_start,
          words_found: player.words_found,
          grid_state: player.grid_state,
          current_letter: player.current_letter,
          placement_confirmed: player.placement_confirmed,
          final_score: player.final_score
        }))
      }
    });

  } catch (error) {
    logger.error('Get game error:', error);
    res.status(500).json({
      error: 'Unable to fetch game',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/games/:id/leaderboard
 * Get game leaderboard
 * Requires authentication
 */
router.get('/:id/leaderboard', AuthService.authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const gameId = parseInt(id);

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    const leaderboard = await PlayerModel.getLeaderboard(gameId);

    res.status(200).json({
      success: true,
      leaderboard: leaderboard.map((player, index) => ({
        rank: index + 1,
        userId: player.user_id,
        username: player.user.username,
        score: player.score,
        words: player.words_found,
        grid: player.grid_state
      }))
    });

  } catch (error) {
    logger.error('Get leaderboard error:', error);
    res.status(500).json({
      error: 'Unable to fetch leaderboard',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/games/:id/ready
 * Mark player as ready to start
 * Requires authentication
 */
router.post('/:id/ready', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { ready } = req.body;
    const gameId = parseInt(id);

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    if (typeof ready !== 'boolean') {
      res.status(400).json({
        error: 'Invalid ready status',
        message: 'Ready status must be true or false'
      });
      return;
    }

    const player = await PlayerModel.findByGameAndUser(gameId, authReq.user!.id);
    if (!player) {
      res.status(404).json({
        error: 'Player not found',
        message: 'You are not a player in this game'
      });
      return;
    }

    const success = await PlayerModel.setReadyToStart(player.id, ready);
    if (!success) {
      res.status(500).json({
        error: 'Failed to update ready status',
        message: 'Unable to update your ready status'
      });
      return;
    }

    logger.info(`Player ${authReq.user!.username} marked ${ready ? 'ready' : 'not ready'} in game ${gameId}`);

    // Check if all players are ready
    const allReady = await PlayerModel.areAllPlayersReady(gameId);

    res.status(200).json({
      success: true,
      ready,
      all_players_ready: allReady
    });

  } catch (error) {
    logger.error('Set ready status error:', error);
    res.status(500).json({
      error: 'Unable to update ready status',
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/games/room/:roomId
 * Get current game for a room
 * Requires authentication
 */
router.get('/room/:roomId', AuthService.authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const roomIdNum = parseInt(roomId);

    if (isNaN(roomIdNum)) {
      res.status(400).json({
        error: 'Invalid room ID',
        message: 'Room ID must be a number'
      });
      return;
    }

    const game = await GameModel.findByRoomId(roomIdNum);
    if (!game) {
      res.status(404).json({
        error: 'No active game',
        message: 'No active game found for this room'
      });
      return;
    }

    res.status(200).json({
      success: true,
      game: {
        id: game.id,
        room_id: game.room_id,
        state: game.state,
        current_turn: game.current_turn,
        turn_number: game.turn_number,
        created_at: game.created_at
      }
    });

  } catch (error) {
    logger.error('Get room game error:', error);
    res.status(500).json({
      error: 'Unable to fetch game',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/games/:id/select-letter
 * Select letter for current player
 * Requires authentication
 */
router.post('/:id/select-letter', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const gameId = parseInt(req.params.id);
    const { letter } = req.body;

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    if (!letter || typeof letter !== 'string') {
      res.status(400).json({
        error: 'Invalid letter',
        message: 'Letter must be provided as a string'
      });
      return;
    }

    // Get GameStateService instance
    const { GameStateService } = await import('../services/GameStateService');
    const { getSocketService } = await import('../index');
    const socketService = getSocketService();
    
    if (!socketService) {
      throw new Error('Socket service not available');
    }
    
    const gameStateService = GameStateService.getInstance(socketService);
    
    // Select letter
    await gameStateService.selectLetter(gameId, authReq.user!.id, letter);

    res.json({
      success: true,
      message: 'Letter selected successfully',
      letter: letter
    });

  } catch (error) {
    logger.error('Select letter error:', error);
    const message = error instanceof Error ? error.message : 'Failed to select letter';
    res.status(400).json({
      error: 'Unable to select letter',
      message: message
    });
  }
});

/**
 * POST /api/games/:id/place-letter
 * Place letter on grid
 * Requires authentication
 */
router.post('/:id/place-letter', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const gameId = parseInt(req.params.id);
    const { x, y } = req.body;

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    if (typeof x !== 'number' || typeof y !== 'number') {
      res.status(400).json({
        error: 'Invalid coordinates',
        message: 'x and y must be numbers'
      });
      return;
    }

    // Get GameStateService instance
    const { GameStateService } = await import('../services/GameStateService');
    const { getSocketService } = await import('../index');
    const socketService = getSocketService();
    
    if (!socketService) {
      throw new Error('Socket service not available');
    }
    
    const gameStateService = GameStateService.getInstance(socketService);
    
    // Place letter
    await gameStateService.placeLetter(gameId, authReq.user!.id, x, y);

    res.json({
      success: true,
      message: 'Letter placed successfully',
      coordinates: { x, y }
    });

  } catch (error) {
    logger.error('Place letter error', {
      gameId: req.params.id,
      userId: (req as any)?.user?.id,
      x: (req as any)?.body?.x,
      y: (req as any)?.body?.y,
      message: error instanceof Error ? error.message : String(error),
      error,
    });
    const message = error instanceof Error ? error.message : 'Failed to place letter';
    res.status(400).json({
      error: 'Unable to place letter',
      message: message
    });
  }
});

/**
 * POST /api/games/:id/placement-intent
 * Mark placement intent (temporary placement started)
 * Requires authentication
 */
router.post('/:id/placement-intent', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    // Get GameStateService instance
    const { GameStateService } = await import('../services/GameStateService');
    const { getSocketService } = await import('../index');
    const socketService = getSocketService();
    
    if (!socketService) {
      throw new Error('Socket service not available');
    }
    
    const gameStateService = GameStateService.getInstance(socketService);
    
    // Set placement intent
    await gameStateService.setPlacementIntent(gameId, authReq.user!.id);

    res.json({
      success: true,
      message: 'Placement intent set successfully'
    });

  } catch (error) {
    logger.error('Set placement intent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to set placement intent';
    res.status(400).json({
      error: 'Unable to set placement intent',
      message: message
    });
  }
});

/**
 * POST /api/games/:id/confirm-placement
 * Confirm letter placement
 * Requires authentication
 */
router.post('/:id/confirm-placement', AuthService.authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const gameId = parseInt(req.params.id);

    if (isNaN(gameId)) {
      res.status(400).json({
        error: 'Invalid game ID',
        message: 'Game ID must be a number'
      });
      return;
    }

    // Get GameStateService instance
    const { GameStateService } = await import('../services/GameStateService');
    const { getSocketService } = await import('../index');
    const socketService = getSocketService();
    
    if (!socketService) {
      throw new Error('Socket service not available');
    }
    
    const gameStateService = GameStateService.getInstance(socketService);
    
    // Confirm placement
    await gameStateService.confirmPlacement(gameId, authReq.user!.id);

    res.json({
      success: true,
      message: 'Placement confirmed successfully'
    });

  } catch (error) {
    logger.error('Confirm placement error:', error);
    const message = error instanceof Error ? error.message : 'Failed to confirm placement';
    res.status(400).json({
      error: 'Unable to confirm placement',
      message: message
    });
  }
});

export { router as gameRoutes };