import express from 'express';
import { GameController } from '../controllers/gameController';
import { SocketService } from '../services/SocketService';

export function createGameRoutes(socketService: SocketService): express.Router {
  const router = express.Router();
  const gameController = new GameController(socketService);

  // Start game for room
  router.post('/rooms/:roomId/start', (req, res) => 
    gameController.startGame(req, res)
  );

  // Select letter for current turn
  router.post('/games/:gameId/select-letter', (req, res) => 
    gameController.selectLetter(req, res)
  );

  // Place letter on grid
  router.post('/games/:gameId/place-letter', (req, res) => 
    gameController.placeLetter(req, res)
  );

  // Confirm letter placement
  router.post('/games/:gameId/confirm-placement', (req, res) => 
    gameController.confirmPlacement(req, res)
  );

  // Get player score
  router.get('/games/:gameId/players/:userId/score', (req, res) => 
    gameController.getPlayerScore(req, res)
  );

  // Get all player scores
  router.get('/games/:gameId/scores', (req, res) => 
    gameController.getAllPlayerScores(req, res)
  );

  return router;
}