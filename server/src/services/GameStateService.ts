import { DatabaseManager } from '../config/database';
import { Game, Player, GridCell, RoomSettings } from '../models/types';
import { SocketService } from './SocketService';
import { WordValidationService, GridScore } from './WordValidationService';
import { gameLogger } from '../utils/logger';

export class GameStateService {
  private static instance: GameStateService;
  private socketService: SocketService;
  private wordValidationService: WordValidationService;
  private activeTimers: Map<number, NodeJS.Timeout> = new Map();

  private constructor(socketService: SocketService) {
    this.socketService = socketService;
    this.wordValidationService = WordValidationService.getInstance();
    this.initializeWordService();
  }

  public static getInstance(socketService: SocketService): GameStateService {
    if (!GameStateService.instance) {
      GameStateService.instance = new GameStateService(socketService);
    }
    return GameStateService.instance;
  }

  /**
   * Initialize word validation service
   */
  private async initializeWordService(): Promise<void> {
    try {
      await this.wordValidationService.loadDictionary();
      gameLogger.info('Word validation service initialized');
    } catch (error) {
      gameLogger.error('Failed to initialize word validation service', { error });
    }
  }

  /**
   * Start a new game for a room
   */
  async startGame(roomId: number): Promise<Game> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Pick a random starting player (still keeps the overall turn order by join-position)
    // This makes the "first picker" fair across matches.
    const firstMember = await db.get(`
      SELECT user_id FROM room_members 
      WHERE room_id = ? 
      ORDER BY RANDOM() 
      LIMIT 1
    `, roomId) as { user_id: number } | null;

    if (!firstMember) {
      throw new Error('No members found in room');
    }

    // Create initial game state - use 'starting' as initial phase
    // so that startLetterSelectionPhase can properly initialize the timer
    const result = await db.run(`
      INSERT INTO games (
        room_id, state, current_phase, current_turn, turn_number, 
        board_state, available_letters, letter_pool
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, 
      roomId, 
      'starting', 
      'starting',  // Changed from 'letter_selection' to allow startLetterSelectionPhase to work
      firstMember.user_id, // Use actual user_id for current_turn
      1,
      JSON.stringify([]),
      JSON.stringify(this.generateSwedishLetters()),
      JSON.stringify(this.generateSwedishLetters())
    );

    const gameId = result.lastInsertRowid as number;
    let game = await this.getGameById(gameId);

    if (!game) throw new Error('Failed to create game');

    // Create players from room members
    await this.createPlayersFromRoom(gameId, roomId);

    // Initialize player grid states
    await this.initializePlayerGrids(gameId);

    // Start first letter selection phase
    await this.startLetterSelectionPhase(gameId);

    // Fetch updated game state with timer info
    game = await this.getGameById(gameId);
    if (!game) throw new Error('Failed to fetch updated game');

    return game;
  }

  /**
   * Start letter selection phase with timer
   */
  async startLetterSelectionPhase(gameId: number): Promise<void> {
    const game = await this.getGameById(gameId);
    if (!game) throw new Error('Game not found');

    // Prevent starting if already in letter selection
    if (game.current_phase === 'letter_selection') {
      return;
    }

    const settings = await this.getGameSettings(gameId);
    const phaseEndTime = Date.now() + (settings.letter_timer * 1000);

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE games 
      SET current_phase = ?, phase_timer_end = ?
      WHERE id = ?
    `, 'letter_selection', phaseEndTime, gameId);

    // Fetch updated game state to get current_turn (may have changed during turn skip)
    const updatedGame = await this.getGameById(gameId);

    // Emit phase change to all players
    const phaseData = {
      gameId,
      phase: 'letter_selection',
      timer_end: phaseEndTime,
      current_turn: updatedGame?.current_turn || game.current_turn
    };
    
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:phase_changed', phaseData);

    // Clear any existing timer for this game BEFORE setting new one
    this.clearGameTimer(gameId);
    
    // Set timeout for auto-advance
    const timerId = setTimeout(() => {
      this.handleLetterSelectionTimeout(gameId);
    }, settings.letter_timer * 1000);
    
    // Store timer ID for potential clearing
    this.activeTimers.set(gameId, timerId);
    
    gameLogger.debug('Set letter selection timeout', { gameId, seconds: settings.letter_timer });
  }

  /**
   * Handle letter selection by current player
   */
  async selectLetter(gameId: number, playerId: number, letter: string, fromTimeout: boolean = false): Promise<void> {
    
    const game = await this.getGameById(gameId);
    if (!game) throw new Error('Game not found');

    if (game.current_phase !== 'letter_selection') {
      throw new Error(`Cannot select letter during ${game.current_phase} phase`);
    }

    // Get current player and validate turn
    const currentPlayer = await this.getCurrentPlayer(gameId, game.current_turn!);
    if (!currentPlayer || currentPlayer.user_id !== playerId) {
      throw new Error(`Not your turn. Current turn: ${game.current_turn}, Your position: ${currentPlayer?.position || 'unknown'}`);
    }
    
    // CRITICAL: Clear the auto-selection timer since player made manual choice
    // But only if this is NOT from a timeout to avoid clearing the wrong timer
    if (!fromTimeout) {
      this.clearGameTimer(gameId);
    }

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Update game with selected letter
    await db.run(`
      UPDATE games 
      SET current_letter = ?
      WHERE id = ?
    `, letter, gameId);

    // Update ALL players with selected letter so everyone can place it
    await db.run(`
      UPDATE players 
      SET current_letter = ?
      WHERE game_id = ?
    `, letter, gameId);

    // Emit letter selected event
    this.socketService.broadcastToRoom(`game:${gameId}`, 'letter:selected', {
      gameId,
      playerId,
      letter,
      turn: game.current_turn
    });

    // Advance to placement phase
    await this.startLetterPlacementPhase(gameId);
  }

  /**
   * Start letter placement phase for all players
   */
  async startLetterPlacementPhase(gameId: number): Promise<void> {
    const game = await this.getGameById(gameId);
    if (!game) return;
    
    // Prevent starting if already in letter placement
    if (game.current_phase === 'letter_placement') {
      return;
    }
    
    const settings = await this.getGameSettings(gameId);
    
    const phaseEndTime = Date.now() + (settings.placement_timer * 1000);

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE games 
      SET current_phase = ?, phase_timer_end = ?
      WHERE id = ?
    `, 'letter_placement', phaseEndTime, gameId);

    // Reset all player confirmations
    await db.run(`
      UPDATE players 
      SET placement_confirmed = 0 
      WHERE game_id = ?
    `, gameId);

    // Get updated game state to include current_turn and current_letter
    const updatedGame = await this.getGameById(gameId);
    
    // Emit phase change with current letter for robustness
    // This ensures clients have the letter even if they miss the letter:selected event
    const phaseData = {
      gameId,
      phase: 'letter_placement',
      timer_end: phaseEndTime,
      current_turn: updatedGame?.current_turn,
      current_letter: updatedGame?.current_letter
    };
    
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:phase_changed', phaseData);

    // Clear any existing timer BEFORE setting new one
    this.clearGameTimer(gameId);

    // Set placement timeout
    const timerId = setTimeout(() => {
      this.handlePlacementTimeout(gameId);
    }, settings.placement_timer * 1000);

    // Store timer ID
    this.activeTimers.set(gameId, timerId);
  }

  /**
   * Place letter on player's grid
   */
  async placeLetter(gameId: number, playerId: number, x: number, y: number): Promise<void> {
    gameLogger.debug('placeLetter called', { gameId, playerId, x, y });
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_placement') {
      gameLogger.warn('placeLetter failed: not in letter_placement phase', {
        gameId,
        playerId,
        phase: game?.current_phase,
      });
      throw new Error('Not in placement phase');
    }

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const player = await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, playerId) as Player;

    if (!player || !player.current_letter) {
      gameLogger.warn('placeLetter failed: missing player or current_letter', {
        gameId,
        playerId,
        hasPlayer: !!player,
        currentLetter: player?.current_letter,
      });
      throw new Error('No letter to place');
    }

    gameLogger.debug('Player data before placement', {
      gameId,
      playerId,
      currentLetter: player.current_letter,
      placementConfirmed: player.placement_confirmed,
    });

    // Update player's grid
    let gridState: GridCell[][];
    try {
      gridState = typeof player.grid_state === 'string' 
        ? JSON.parse(player.grid_state) 
        : player.grid_state;
      gameLogger.debug('grid_state parsed', {
        gameId,
        playerId,
        rows: gridState.length,
        cols: gridState[0]?.length,
      });
    } catch {
      gameLogger.warn('placeLetter failed: invalid grid state', { gameId, playerId });
      throw new Error('Invalid grid state');
    }
    
    if (gridState[y] && gridState[y][x] && !gridState[y][x].letter) {
      gameLogger.debug('Cell is available; placing letter', { gameId, playerId, x, y, letter: player.current_letter });
      
      gridState[y][x] = {
        letter: player.current_letter,
        x,
        y
      };

      gameLogger.debug('Saving updated grid_state to database', { gameId, playerId });
      await db.run(`
        UPDATE players 
        SET grid_state = ?
        WHERE game_id = ? AND user_id = ?
      `, JSON.stringify(gridState), gameId, playerId);

      gameLogger.debug('Grid state saved to database', { gameId, playerId });
      gameLogger.debug('Cell now contains letter', { gameId, playerId, x, y, letter: gridState[y][x].letter });

      // Emit placement event
      this.socketService.broadcastToRoom(`game:${gameId}`, 'letter:placed', {
        gameId,
        playerId,
        letter: player.current_letter,
        x,
        y
      });

      gameLogger.debug('Broadcasted letter:placed event', { gameId, playerId, x, y, letter: player.current_letter });
    } else {
      const cellStatus = gridState[y]?.[x]?.letter ? 'occupied' : 'invalid';
      gameLogger.warn('placeLetter failed: cell not available', { gameId, playerId, x, y, cellStatus });
      throw new Error('Cell not available');
    }
  }

  /**
   * Mark that player has started placing (temporary placement intent)
   * This prevents auto-placement from triggering for active players
   */
  async setPlacementIntent(gameId: number, playerId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE players 
      SET placement_confirmed = 2
      WHERE game_id = ? AND user_id = ? AND placement_confirmed = 0
    `, gameId, playerId);

    gameLogger.debug('Player set placement intent', { gameId, playerId });
  }

  /**
   * Confirm letter placement and calculate score
   */
  async confirmPlacement(gameId: number, playerId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE players 
      SET placement_confirmed = 1
      WHERE game_id = ? AND user_id = ? AND placement_confirmed IN (0, 2)
    `, gameId, playerId);

    gameLogger.debug('Player confirmed placement', { gameId, playerId });

    // Calculate current score for this player
    try {
      await this.calculatePlayerScore(gameId, playerId);
    } catch (err) {
      gameLogger.error('Error calculating score for player', { gameId, playerId, err });
      // Continue even if score calculation fails
    }

    // Check if all players confirmed
    const confirmedCount = await db.get(`
      SELECT COUNT(*) as count FROM players 
      WHERE game_id = ? AND placement_confirmed = 1
    `, gameId) as { count: number };

    const totalPlayers = await db.get(`
      SELECT COUNT(*) as count FROM players WHERE game_id = ?
    `, gameId) as { count: number };

    gameLogger.debug('Placement confirmation status', {
      gameId,
      confirmed: confirmedCount.count,
      total: totalPlayers.count,
    });

    if (confirmedCount.count === totalPlayers.count) {
      gameLogger.debug('All players confirmed - advancing game');
      this.clearGameTimer(gameId);
      
      // Validate we're still in placement phase before advancing
      const updatedGame = await this.getGameById(gameId);
      if (updatedGame?.current_phase !== 'letter_placement') {
        gameLogger.warn('Game phase changed during confirmation - skipping advance', {
          gameId,
          phase: updatedGame?.current_phase,
        });
        return;
      }
      
      // Check if this ends the game or advances turn
      const gameEnded = await this.checkGameEnd(gameId);
      gameLogger.debug('Game end check result', { gameId, gameEnded });
      if (!gameEnded) {
        gameLogger.debug('Advancing to next turn', { gameId });
        await this.advanceToNextTurn(gameId);
      }
    } else {
      gameLogger.debug('Waiting for remaining players to confirm', {
        gameId,
        remaining: totalPlayers.count - confirmedCount.count,
      });
    }
  }

  /**
   * Advance to next turn or check game end
   */
  async advanceToNextTurn(gameId: number): Promise<void> {
    gameLogger.debug('advanceToNextTurn called', { gameId });
    
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const game = await this.getGameById(gameId);
    if (!game) {
      gameLogger.warn('Game not found in advanceToNextTurn', { gameId });
      return;
    }

    gameLogger.debug('Current game state', { gameId, phase: game.current_phase, turn: game.current_turn });

    // Prevent race conditions - only advance if in placement phase
    if (game.current_phase !== 'letter_placement') {
      gameLogger.warn('Cannot advance turn - wrong phase', {
        gameId,
        phase: game.current_phase,
        expected: 'letter_placement',
      });
      return;
    }

    // Check if game is finished (grid full)
    if (await this.isGameFinished(gameId)) {
      gameLogger.info('Game is finished - ending game', { gameId });
      await this.finishGame(gameId);
      return;
    }

    // Advance to next player by user_id order
    const players = await db.all(`
      SELECT p.user_id, p.position 
      FROM players p 
      WHERE p.game_id = ? 
      ORDER BY p.position ASC
    `, gameId) as { user_id: number; position: number }[];

    if (players.length === 0) return;

    // Find current player index
    const currentIndex = players.findIndex(p => p.user_id === game.current_turn);
    const nextIndex = (currentIndex + 1) % players.length;
    const nextUserId = players[nextIndex].user_id;

    await db.run(`
      UPDATE games 
      SET current_turn = ?, turn_number = turn_number + 1, current_letter = NULL
      WHERE id = ?
    `, nextUserId, gameId);

    // Clear player letters
    await db.run(`
      UPDATE players 
      SET current_letter = NULL, placement_confirmed = 0 
      WHERE game_id = ?
    `, gameId);

    // Start next letter selection phase
    await this.startLetterSelectionPhase(gameId);
  }

  /**
   * Handle automatic timeout scenarios
   */
  async handleLetterSelectionTimeout(gameId: number): Promise<void> {
    gameLogger.warn('Letter selection timeout triggered', { gameId });
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_selection') {
      gameLogger.debug('Skipping letter selection timeout - wrong phase', { gameId, phase: game?.current_phase });
      return;
    }

    // Clear the timer since we're handling it now
    this.clearGameTimer(gameId);
    
    // Pass turn to next player instead of auto-selecting random letter
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Get all players ordered by position
    const players = await db.all(`
      SELECT p.user_id, p.position 
      FROM players p 
      WHERE p.game_id = ? 
      ORDER BY p.position ASC
    `, gameId) as { user_id: number; position: number }[];

    if (players.length === 0) return;

    // Find current player index and move to next
    const currentIndex = players.findIndex(p => p.user_id === game.current_turn);
    const nextIndex = (currentIndex + 1) % players.length;
    const nextUserId = players[nextIndex].user_id;

    // Update game with new current turn (don't increment turn_number since no letter was placed)
    // Also temporarily set phase to allow restarting letter_selection
    await db.run(`
      UPDATE games 
      SET current_turn = ?, current_phase = 'turn_transition'
      WHERE id = ?
    `, nextUserId, gameId);

    // Notify about skipped turn
    this.socketService.broadcastToRoom(`game:${gameId}`, 'turn:skipped', {
      gameId,
      skippedPlayerId: game.current_turn,
      nextPlayerId: nextUserId
    });

    // Start new letter selection phase for next player (now allowed since phase is 'turn_transition')
    await this.startLetterSelectionPhase(gameId);
  }

  async handlePlacementTimeout(gameId: number): Promise<void> {
    gameLogger.warn('Placement timeout triggered', { gameId });
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_placement') {
      gameLogger.debug('Skipping placement timeout - wrong phase', { gameId, phase: game?.current_phase });
      return;
    }

    // Clear the timer since we're handling it now
    this.clearGameTimer(gameId);

    // Auto-place letters for unconfirmed players
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const unconfirmedPlayers = await db.all(`
      SELECT * FROM players 
      WHERE game_id = ? AND placement_confirmed = 0
    `, gameId) as Player[];

    // Process all auto-placements FIRST before marking any as confirmed
    // This prevents race conditions where advanceToNextTurn runs before all updates complete
    for (const player of unconfirmedPlayers) {
      if (player.current_letter) {
        await this.autoPlaceLetter(gameId, player.user_id, player.current_letter);
      }
    }
    
    // NOW mark all as confirmed in a batch (more efficient and safer)
    if (unconfirmedPlayers.length > 0) {
      const playerIds = unconfirmedPlayers.map(p => p.id).join(',');
      await db.run(`
        UPDATE players 
        SET placement_confirmed = 1 
        WHERE id IN (${playerIds})
      `);
    }

    await this.advanceToNextTurn(gameId);
  }

  // Helper methods
  private async getGameById(gameId: number): Promise<Game | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    return await db.get('SELECT * FROM games WHERE id = ?', gameId) as Game | null;
  }

  private async getCurrentPlayer(gameId: number, userId: number): Promise<Player | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    return await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, userId) as Player | null;
  }

  private async getGameSettings(gameId: number): Promise<RoomSettings> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const room = await db.get(`
      SELECT r.settings FROM rooms r 
      JOIN games g ON r.id = g.room_id 
      WHERE g.id = ?
    `, gameId) as { settings: string };

    return JSON.parse(room.settings) as RoomSettings;
  }

  private async createPlayersFromRoom(gameId: number, roomId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Get room members
    const members = await db.all(`
      SELECT rm.user_id, rm.joined_at 
      FROM room_members rm
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, roomId);

    // Create player entries for each member
    for (let i = 0; i < members.length; i++) {
      await db.run(`
        INSERT INTO players (
          game_id, user_id, position, score, board_state, words_found, 
          ready_to_start, grid_state, current_letter, placement_confirmed, final_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, 
        gameId,
        members[i].user_id,
        i + 1, // Position based on join order
        0,
        JSON.stringify([]),
        JSON.stringify([]),
        1, // true -> 1
        JSON.stringify([]), // Will be initialized later
        null,
        0, // false -> 0
        0
      );
    }
  }

  private async initializePlayerGrids(gameId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    const settings = await this.getGameSettings(gameId);
    
    // Get all players for this game
    const players = await db.all(`
      SELECT user_id FROM players WHERE game_id = ?
    `, gameId) as { user_id: number }[];

    // Create a separate grid for each player
    for (const player of players) {
      const emptyGrid: GridCell[][] = [];
      for (let y = 0; y < settings.grid_size; y++) {
        emptyGrid[y] = [];
        for (let x = 0; x < settings.grid_size; x++) {
          emptyGrid[y][x] = { letter: null, x, y };
        }
      }

      await db.run(`
        UPDATE players 
        SET grid_state = ? 
        WHERE game_id = ? AND user_id = ?
      `, JSON.stringify(emptyGrid), gameId, player.user_id);
    }
  }

  private async autoPlaceLetter(gameId: number, playerId: number, letter: string): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Get fresh player data to ensure we have the latest grid_state
    const player = await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, playerId) as Player;

    if (!player) {
      gameLogger.warn('autoPlaceLetter: player not found', { gameId, playerId });
      return;
    }

    gameLogger.debug('autoPlaceLetter processing player', {
      gameId,
      playerId,
      currentLetter: player.current_letter,
      currentLetterType: typeof player.current_letter,
      placementConfirmed: player.placement_confirmed,
      targetLetter: letter,
      targetLetterType: typeof letter,
    });
    
    let gridState: GridCell[][];
    try {
      gridState = typeof player.grid_state === 'string' 
        ? JSON.parse(player.grid_state)
        : player.grid_state;
      gameLogger.debug('autoPlaceLetter grid_state parsed', {
        gameId,
        playerId,
        rows: gridState.length,
        cols: gridState[0]?.length,
      });
    } catch (error) {
      gameLogger.error('autoPlaceLetter failed to parse grid_state', { gameId, playerId, error });
      return;
    }
    
    // Since each player has their own individual grid, just place the letter randomly
    gameLogger.debug('Auto-placing letter for player (individual grid)', {
      gameId,
      playerId,
      letter,
    });
    
    // Letter not found in grid, place it in a random empty cell
    const emptyCells: {x: number, y: number}[] = [];
    for (let y = 0; y < gridState.length; y++) {
      for (let x = 0; x < gridState[y].length; x++) {
        if (!gridState[y][x].letter) {
          emptyCells.push({x, y});
        }
      }
    }
    
    if (emptyCells.length > 0) {
      // Choose a random empty cell
      const randomIndex = Math.floor(Math.random() * emptyCells.length);
      const {x, y} = emptyCells[randomIndex];
      
      gridState[y][x] = { letter, x, y };
      
      await db.run(`
        UPDATE players 
        SET grid_state = ? 
        WHERE game_id = ? AND user_id = ?
      `, JSON.stringify(gridState), gameId, playerId);

      gameLogger.debug('Auto-placed letter', {
        gameId,
        playerId,
        letter,
        x,
        y,
        emptyCells: emptyCells.length,
      });
      
      // Emit the auto-placement to show other players
      this.socketService.broadcastToRoom(`game:${gameId}`, 'letter:placed', {
        gameId,
        playerId,
        letter,
        x,
        y,
        auto: true
      });
      
      return;
    }
    
    gameLogger.warn('No empty cells found for player - grid is full', { gameId, playerId });
  }

  private async isGameFinished(gameId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const players = await db.all(`
      SELECT user_id, grid_state FROM players WHERE game_id = ?
    `, gameId) as { user_id: number; grid_state: string }[];

    gameLogger.debug('isGameFinished check', { gameId, players: players.length });

    // Check if any player's grid is full
    for (const player of players) {
      const grid = JSON.parse(player.grid_state) as GridCell[][];
      const lettersCount = grid.flat().filter(cell => cell.letter).length;
      const totalCells = grid.flat().length;
      const isEmpty = grid.some(row => row.some(cell => !cell.letter));
      
      if (!isEmpty) {
        return true; // Grid is full
      }
    }

    return false;
  }

  private async finishGame(gameId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE games 
      SET state = 'finished', current_phase = 'finished', finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, gameId);

    // Calculate and broadcast final scores
    await this.endGame(gameId);
  }

  /**
   * Calculate and update player score
   */
  async calculatePlayerScore(gameId: number, userId: number): Promise<GridScore | null> {
    if (!this.wordValidationService.isReady()) {
      gameLogger.warn('Word validation service not ready - skipping score calculation', { gameId, playerId: userId });
      return null;
    }

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Get player's grid state
    const player = await db.get(`
      SELECT grid_state FROM players 
      WHERE game_id = ? AND user_id = ?
    `, gameId, userId);

    if (!player) return null;

    const grid: GridCell[][] = JSON.parse(player.grid_state);
    const gridScore = this.wordValidationService.calculateGridScore(grid);

    // Update player's score and words_found in database
    await db.run(`
      UPDATE players 
      SET final_score = ?, words_found = ? 
      WHERE game_id = ? AND user_id = ?
    `, gridScore.totalPoints, JSON.stringify(gridScore.words), gameId, userId);

    gameLogger.debug('Player score calculated', {
      gameId,
      userId,
      points: gridScore.totalPoints,
      words: gridScore.words.length,
    });
    
    return gridScore;
  }

  /**
   * Calculate scores for all players in game
   */
  async calculateAllPlayerScores(gameId: number): Promise<{ [userId: number]: GridScore }> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const players = await db.all(`
      SELECT user_id, grid_state FROM players WHERE game_id = ?
    `, gameId);

    const scores: { [userId: number]: GridScore } = {};

    for (const player of players) {
      const gridScore = await this.calculatePlayerScore(gameId, player.user_id);
      if (gridScore) {
        scores[player.user_id] = gridScore;
      }
    }

    return scores;
  }

  /**
   * Check if game should end (all players finished or timeout)
   */
  async checkGameEnd(gameId: number): Promise<boolean> {
    // Only check for game end conditions, not just if all players confirmed
    const gameFinished = await this.isGameFinished(gameId);
    
    if (gameFinished) {
      await this.finishGame(gameId);
      return true;
    }

    return false;
  }

  /**
   * End game and broadcast final scores
   */
  async endGame(gameId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Get room data associated with this game (including board_size)
    const game = await db.get(`
      SELECT g.room_id, r.board_size, r.code FROM games g
      JOIN rooms r ON g.room_id = r.id
      WHERE g.id = ?
    `, gameId) as any;

    // Update room status back to waiting so players can start a new game
    if (game?.room_id) {
      await db.run(`
        UPDATE rooms SET status = 'waiting' WHERE id = ?
      `, game.room_id);
      gameLogger.debug('Room reset to waiting status', { roomId: game.room_id, gameId });
    }

    // Ready state is a lobby-only concept; clear it when a game ends.
    if (game?.code) {
      this.socketService.clearRoomReadyStatus(game.code);

      try {
        const { RoomModel } = await import('../models');
        const members = await RoomModel.getRoomMembers(game.room_id);

        for (const member of members) {
          this.socketService.emitToRoom(game.code, 'player:ready_changed', {
            userId: String(member.id),
            username: member.username,
            isReady: false,
            roomCode: game.code
          });
        }
      } catch (readyResetError) {
        gameLogger.warn('Failed to broadcast ready reset after game end', {
          gameId,
          roomCode: game.code,
          error: (readyResetError as Error).message
        });
      }
    }

    // Calculate final scores
    const scores = await this.calculateAllPlayerScores(gameId);

    // Get player details for leaderboard (use grid_state which is actively updated during game)
    const players = await db.all(`
      SELECT p.user_id, u.username, p.final_score, p.grid_state, p.words_found
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.game_id = ?
      ORDER BY p.final_score DESC
    `, gameId);

    gameLogger.debug('Players at game end', {
      gameId,
      players: players.map((p) => ({
        username: p.username,
        gridState: p.grid_state,
        wordsFound: p.words_found
      }))
    });

    // Broadcast game end with scores and board size
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:ended', {
      gameId,
      boardSize: game?.board_size || 5,
      leaderboard: players.map(p => ({
        userId: p.user_id,
        username: p.username,
        score: p.final_score,
        words: JSON.parse(p.words_found || '[]'),
        grid: JSON.parse(p.grid_state || '[]')
      })),
      finalScores: scores
    });

    gameLogger.info('Game ended', { 
      gameId, 
      winner: players[0]?.username, 
      score: players[0]?.final_score,
      playerCount: players.length 
    });
  }

  /**
   * Handle a player leaving the game
   * - If only 1 player left: end the game
   * - If more players but leaving player had turn: switch to next player
   */
  async handlePlayerLeft(gameId: number, leavingUserId: number, intentional: boolean = false): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const game = await this.getGameById(gameId);
    if (!game || game.state === 'finished') {
      gameLogger.debug('Player left but game already finished or not found', {
        gameId,
        leavingUserId
      });
      return;
    }

    // If intentional leave (clicked button), remove player immediately
    if (intentional) {
      gameLogger.info('Player intentionally left game - removing immediately', {
        gameId,
        leavingUserId
      });
      
      // Remove player from the game
      await db.run(`DELETE FROM players WHERE game_id = ? AND user_id = ?`, gameId, leavingUserId);
      gameLogger.debug('Removed player from game', { gameId, leavingUserId });
    } else {
      gameLogger.debug('Player disconnected from game - awaiting grace period', {
        gameId,
        leavingUserId
      });
      // For non-intentional disconnects, the SocketService handles the grace period
      // and will call this function again with proper removal after timeout
      return;
    }

    // Get remaining players
    const remainingPlayers = await db.all(`
      SELECT user_id, position FROM players WHERE game_id = ?
    `, gameId) as { user_id: number; position: number }[];
    
    gameLogger.info('Player left during game - checking remaining players', { 
      gameId, 
      leavingUserId, 
      remainingPlayers: remainingPlayers.length 
    });

    // If only 1 or fewer players left, end the game
    if (remainingPlayers.length <= 1) {
      gameLogger.info('Ending game because only one player left', {
        gameId,
        remainingPlayers: remainingPlayers.length
      });
      
      // Clear any active timers
      this.clearGameTimer(gameId);
      
      // Update game state to finished
      await db.run(
        `UPDATE games SET state = 'finished', current_phase = 'finished', finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
        gameId
      );
      
      // Update room status back to waiting
      await db.run(`UPDATE rooms SET status = 'waiting' WHERE id = ?`, game.room_id);
      
      // Get room code for socket broadcast
      const room = await db.get(`SELECT code FROM rooms WHERE id = ?`, game.room_id) as { code: string } | undefined;
      
      let leaderboard: Array<{ userId: number; username: string; score: number; words: any[] }> = [];

      if (remainingPlayers.length === 1) {
        const winnerUserId = remainingPlayers[0].user_id;

        // Calculate score from current grid if possible; then ensure at least 1 point for walkover.
        try {
          await this.calculatePlayerScore(gameId, winnerUserId);
        } catch (scoreErr) {
          gameLogger.warn('Failed to calculate winner score for walkover', {
            gameId,
            winnerUserId,
            error: (scoreErr as Error)?.message
          });
        }

        const winnerUser = await db.get(`SELECT username FROM users WHERE id = ?`, winnerUserId) as { username?: string } | undefined;
        const winnerRow = await db.get(
          `SELECT final_score as finalScore, words_found as wordsFound FROM players WHERE game_id = ? AND user_id = ?`,
          gameId,
          winnerUserId
        ) as { finalScore?: number; wordsFound?: string } | undefined;

        let winnerScore = Number(winnerRow?.finalScore || 0);
        let winnerWords: any[] = [];
        try {
          winnerWords = JSON.parse(winnerRow?.wordsFound || '[]');
          if (!Array.isArray(winnerWords)) winnerWords = [];
        } catch {
          winnerWords = [];
        }

        if (!Number.isFinite(winnerScore) || winnerScore < 1) {
          winnerScore = 1;
          await db.run(
            `UPDATE players SET final_score = ?, words_found = ? WHERE game_id = ? AND user_id = ?`,
            winnerScore,
            JSON.stringify(winnerWords),
            gameId,
            winnerUserId
          );
        }

        leaderboard = [{
          userId: winnerUserId,
          username: winnerUser?.username || 'Vinnare',
          score: winnerScore,
          words: winnerWords
        }];
      }

      const gameEndedData = {
        gameId,
        reason: 'player_left',
        message: 'Spelet avslutades eftersom en spelare lämnade',
        leaderboard,
        finalScores: {}
      };
      
      // Notify all players that game ended - send to BOTH game room and room room
      this.socketService.broadcastToRoom(`game:${gameId}`, 'game:ended', gameEndedData);
      if (room?.code) {
        this.socketService.broadcastToRoom(`room:${room.code}`, 'game:ended', gameEndedData);
      }
      
      return;
    }

    // If the leaving player had the turn, switch to next player
    if (game.current_turn === leavingUserId) {
      gameLogger.info('Leaving player had the turn - switching to next player', {
        gameId,
        leavingUserId
      });
      
      // Find next player
      const nextPlayer = remainingPlayers[0]; // First remaining player gets the turn
      
      await db.run(`
        UPDATE games SET current_turn = ?, current_letter = NULL WHERE id = ?
      `, nextPlayer.user_id, gameId);

      // Clear player letters
      await db.run(`
        UPDATE players SET current_letter = NULL, placement_confirmed = 0 WHERE game_id = ?
      `, gameId);

      // Restart current phase with new player
      if (game.current_phase === 'letter_selection') {
        await this.startLetterSelectionPhase(gameId);
      } else if (game.current_phase === 'letter_placement') {
        await this.startLetterPlacementPhase(gameId);
      }
    }

    // Notify remaining players about the player leaving
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:player_left', {
      gameId,
      leftUserId: leavingUserId,
      remainingPlayers: remainingPlayers.length,
      newCurrentTurn: game.current_turn === leavingUserId ? remainingPlayers[0].user_id : game.current_turn
    });
  }

  private generateSwedishLetters(): string[] {
    // Swedish alphabet with frequency distribution
    return [
      'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
      'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
      'Å', 'Ä', 'Ö'
    ];
  }

  /**
   * Get current score for a player
   */
  async getPlayerScore(gameId: number, userId: number): Promise<{ score: number; words: any[] } | null> {
    if (!this.wordValidationService.isReady()) {
      const dbManager = await DatabaseManager.getInstance();
      const db = dbManager.getDatabase();
      const player = await db.get(`
        SELECT final_score FROM players WHERE game_id = ? AND user_id = ?
      `, gameId, userId);
      
      return player ? { score: player.final_score || 0, words: [] } : null;
    }

    const gridScore = await this.calculatePlayerScore(gameId, userId);
    return gridScore ? { score: gridScore.totalPoints, words: gridScore.words } : null;
  }

  // Public method for testing
  public getSwedishLetters(): string[] {
    return this.generateSwedishLetters();
  }

  /**
   * Clear active timer for a game to prevent race conditions
   */
  private clearGameTimer(gameId: number): void {
    const timerId = this.activeTimers.get(gameId);
    if (timerId) {
      clearTimeout(timerId);
      this.activeTimers.delete(gameId);
      gameLogger.debug('Cleared game timer', { gameId });
    }
  }
}