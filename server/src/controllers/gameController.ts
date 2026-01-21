import { Request, Response } from 'express';
import { GameStateService } from '../services/GameStateService';
import { SocketService } from '../services/SocketService';
import { gameLogger } from '../utils/logger';

export class GameController {
  private gameStateService: GameStateService;

  constructor(socketService: SocketService) {
    this.gameStateService = GameStateService.getInstance(socketService);
  }

  /**
   * Start a new game for a room
   */
  async startGame(req: Request, res: Response): Promise<void> {
    try {
      const { roomId } = req.params;
      const game = await this.gameStateService.startGame(parseInt(roomId));
      res.json({ success: true, game });
    } catch (error) {
      gameLogger.error('Error starting game', {
        roomId: req.params.roomId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Select letter for current turn
   */
  async selectLetter(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.params;
      const { playerId, letter } = req.body;
      
      await this.gameStateService.selectLetter(
        parseInt(gameId), 
        parseInt(playerId), 
        letter
      );
      
      res.json({ success: true });
    } catch (error) {
      gameLogger.error('Error selecting letter', {
        gameId: req.params.gameId,
        playerId: req.body?.playerId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Place letter on grid
   */
  async placeLetter(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.params;
      const { playerId, x, y } = req.body;
      
      await this.gameStateService.placeLetter(
        parseInt(gameId), 
        parseInt(playerId), 
        x, 
        y
      );
      
      res.json({ success: true });
    } catch (error) {
      gameLogger.error('Error placing letter', {
        gameId: req.params.gameId,
        playerId: req.body?.playerId,
        x: req.body?.x,
        y: req.body?.y,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Confirm letter placement
   */
  async confirmPlacement(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.params;
      const { playerId } = req.body;
      
      await this.gameStateService.confirmPlacement(
        parseInt(gameId), 
        parseInt(playerId)
      );
      
      res.json({ success: true });
    } catch (error) {
      gameLogger.error('Error confirming placement', {
        gameId: req.params.gameId,
        playerId: req.body?.playerId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Get current player score
   */
  async getPlayerScore(req: Request, res: Response): Promise<void> {
    try {
      const { gameId, userId } = req.params;
      
      const scoreData = await this.gameStateService.getPlayerScore(
        parseInt(gameId), 
        parseInt(userId)
      );
      
      if (!scoreData) {
        res.status(404).json({ success: false, error: 'Player not found' });
        return;
      }
      
      res.json({ 
        success: true, 
        score: scoreData.score, 
        words: scoreData.words 
      });
    } catch (error) {
      gameLogger.error('Error getting player score', {
        gameId: req.params.gameId,
        userId: req.params.userId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Get all player scores for a game
   */
  async getAllPlayerScores(req: Request, res: Response): Promise<void> {
    try {
      const { gameId } = req.params;
      
      const scores = await this.gameStateService.calculateAllPlayerScores(
        parseInt(gameId)
      );
      
      res.json({ success: true, scores });
    } catch (error) {
      gameLogger.error('Error getting all player scores', {
        gameId: req.params.gameId,
        error: error instanceof Error ? error.message : String(error)
      });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}