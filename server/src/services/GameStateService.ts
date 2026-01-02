import { DatabaseManager } from '../config/database';
import { Game, Player, GridCell, RoomSettings } from '../models/types';
import { SocketService } from './SocketService';
import { WordValidationService, GridScore } from './WordValidationService';

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
      console.log('📖 Word validation service initialized');
    } catch (error) {
      console.error('Failed to initialize word validation service:', error);
    }
  }

  /**
   * Start a new game for a room
   */
  async startGame(roomId: number): Promise<Game> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    // Get first player from room to set as current turn
    const firstMember = await db.get(`
      SELECT user_id FROM room_members 
      WHERE room_id = ? 
      ORDER BY joined_at ASC 
      LIMIT 1
    `, roomId) as { user_id: number } | null;

    if (!firstMember) {
      throw new Error('No members found in room');
    }

    // Create initial game state
    const result = await db.run(`
      INSERT INTO games (
        room_id, state, current_phase, current_turn, turn_number, 
        board_state, available_letters, letter_pool, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `, 
      roomId, 
      'starting', 
      'letter_selection',
      firstMember.user_id, // Use actual user_id for current_turn
      1,
      JSON.stringify([]),
      JSON.stringify(this.generateSwedishLetters()),
      JSON.stringify(this.generateSwedishLetters())
    );

    const gameId = result.lastInsertRowid as number;
    const game = await this.getGameById(gameId);

    if (!game) throw new Error('Failed to create game');

    // Create players from room members
    await this.createPlayersFromRoom(gameId, roomId);

    // Initialize player grid states
    await this.initializePlayerGrids(gameId);

    // Start first letter selection phase
    await this.startLetterSelectionPhase(gameId);

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
      console.log('⚠️ Already in letter selection phase, skipping');
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

    // Emit phase change to all players
    const phaseData = {
      gameId,
      phase: 'letter_selection',
      timer_end: phaseEndTime,
      current_turn: game.current_turn
    };
    
    console.log(`📡 Sending phase change:`, {
      phase: phaseData.phase,
      timer_end: phaseData.timer_end,
      current_time: Date.now(),
      remaining_ms: phaseData.timer_end - Date.now()
    });
    
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:phase_changed', phaseData);

    // Clear any existing timer for this game BEFORE setting new one
    this.clearGameTimer(gameId);
    
    // Set timeout for auto-advance
    const timerId = setTimeout(() => {
      this.handleLetterSelectionTimeout(gameId);
    }, settings.letter_timer * 1000);
    
    // Store timer ID for potential clearing
    this.activeTimers.set(gameId, timerId);
    
    console.log(`⏰ Set letter selection timeout for ${settings.letter_timer} seconds`);
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
      console.log('⚠️ Already in letter placement phase, skipping');
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

    // Get updated game state to include current_turn
    const updatedGame = await this.getGameById(gameId);
    
    // Emit phase change
    const phaseData = {
      gameId,
      phase: 'letter_placement',
      timer_end: phaseEndTime,
      current_turn: updatedGame?.current_turn
    };
    
    console.log(`📡 Sending placement phase change:`, {
      phase: phaseData.phase,
      timer_end: phaseData.timer_end,
      current_time: Date.now(),
      remaining_ms: phaseData.timer_end - Date.now()
    });
    
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
    console.log(`📍 placeLetter called: gameId=${gameId}, playerId=${playerId}, position=(${x}, ${y})`);
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_placement') {
      console.log(`❌ placeLetter failed: phase=${game?.current_phase}, expected=letter_placement`);
      throw new Error('Not in placement phase');
    }

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const player = await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, playerId) as Player;

    if (!player || !player.current_letter) {
      console.log(`❌ placeLetter failed: player found=${!!player}, current_letter=${player?.current_letter}`);
      throw new Error('No letter to place');
    }

    console.log(`✅ placeLetter: placing "${player.current_letter}" at (${x}, ${y}) for player ${playerId}`);

    // Update player's grid
    let gridState: GridCell[][];
    try {
      gridState = typeof player.grid_state === 'string' 
        ? JSON.parse(player.grid_state) 
        : player.grid_state;
    } catch {
      console.log(`❌ placeLetter failed: invalid grid_state format`);
      throw new Error('Invalid grid state');
    }
    
    if (gridState[y] && gridState[y][x] && !gridState[y][x].letter) {
      gridState[y][x] = {
        letter: player.current_letter,
        x,
        y
      };

      await db.run(`
        UPDATE players 
        SET grid_state = ?
        WHERE game_id = ? AND user_id = ?
      `, JSON.stringify(gridState), gameId, playerId);

      console.log(`✅ placeLetter SUCCESS: saved "${player.current_letter}" at (${x}, ${y}) for player ${playerId}`);

      // Emit placement event
      this.socketService.broadcastToRoom(`game:${gameId}`, 'letter:placed', {
        gameId,
        playerId,
        letter: player.current_letter,
        x,
        y
      });
    } else {
      console.log(`❌ placeLetter failed: cell (${x}, ${y}) not available. Cell state:`, gridState[y]?.[x]);
      throw new Error('Cell not available');
    }
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
      WHERE game_id = ? AND user_id = ?
    `, gameId, playerId);

    // Calculate current score for this player
    await this.calculatePlayerScore(gameId, playerId);

    // Check if all players confirmed
    const confirmedCount = await db.get(`
      SELECT COUNT(*) as count FROM players 
      WHERE game_id = ? AND placement_confirmed = 1
    `, gameId) as { count: number };

    const totalPlayers = await db.get(`
      SELECT COUNT(*) as count FROM players WHERE game_id = ?
    `, gameId) as { count: number };

    if (confirmedCount.count === totalPlayers.count) {
      console.log('🎆 All players confirmed - clearing placement timer');
      this.clearGameTimer(gameId);
      
      // Validate we're still in placement phase before advancing
      const updatedGame = await this.getGameById(gameId);
      if (updatedGame?.current_phase !== 'letter_placement') {
        console.log('⚠️ Skipping turn advance - phase changed during confirmation');
        return;
      }
      
      // Check if this ends the game or advances turn
      const gameEnded = await this.checkGameEnd(gameId);
      if (!gameEnded) {
        await this.advanceToNextTurn(gameId);
      }
    }
  }

  /**
   * Advance to next turn or check game end
   */
  async advanceToNextTurn(gameId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const game = await this.getGameById(gameId);
    if (!game) return;

    // Prevent race conditions - only advance if in placement phase
    if (game.current_phase !== 'letter_placement') {
      console.log(`⚠️ Skipping turn advance - game not in placement phase: ${game.current_phase}`);
      return;
    }

    // Check if game is finished (grid full)
    if (await this.isGameFinished(gameId)) {
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
    console.log(`⏰ handleLetterSelectionTimeout triggered for game ${gameId}`);
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_selection') {
      console.log(`⚠️ Skipping letter selection timeout - phase is ${game?.current_phase || 'unknown'}`);
      return;
    }

    // Clear the timer since we're handling it now
    this.clearGameTimer(gameId);
    
    // Auto-select random letter
    const letters = this.generateSwedishLetters();
    const randomLetter = letters[Math.floor(Math.random() * letters.length)];

    console.log(`⏰ Letter selection timeout - auto-selecting "${randomLetter}" for player ${game.current_turn}`);

    const currentPlayer = await this.getCurrentPlayer(gameId, game.current_turn!);
    if (currentPlayer) {
      await this.selectLetter(gameId, currentPlayer.user_id, randomLetter, true);
    }
  }

  async handlePlacementTimeout(gameId: number): Promise<void> {
    console.log(`⏰ handlePlacementTimeout triggered for game ${gameId}`);
    
    const game = await this.getGameById(gameId);
    if (!game || game.current_phase !== 'letter_placement') {
      console.log(`❌ Skipping timeout - game phase is ${game?.current_phase || 'unknown'}`);
      return;
    }

    // Clear the timer since we're handling it now
    this.clearGameTimer(gameId);

    console.log('🤖 Auto-placing letters due to timeout');

    // Auto-place letters for unconfirmed players
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const unconfirmedPlayers = await db.all(`
      SELECT * FROM players 
      WHERE game_id = ? AND placement_confirmed = 0
    `, gameId) as Player[];

    console.log(`📍 Found ${unconfirmedPlayers.length} players with unconfirmed placements`);

    for (const player of unconfirmedPlayers) {
      if (player.current_letter) {
        console.log(`⏰ Timeout: Processing unconfirmed placement for player ${player.user_id} with letter "${player.current_letter}"`);
        console.log(`🗂️ Player grid_state:`, JSON.stringify(player.grid_state));
        await this.autoPlaceLetter(gameId, player.user_id, player.current_letter);
      } else {
        console.log(`⚠️ Player ${player.user_id} has no current letter to auto-place`);
      }
      
      await db.run(`
        UPDATE players 
        SET placement_confirmed = 1 
        WHERE id = ?
      `, player.id);
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
    console.log(`🔍 autoPlaceLetter called: gameId=${gameId}, playerId=${playerId}, letter="${letter}"`);
    
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Get fresh player data to ensure we have the latest grid_state
    const player = await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, playerId) as Player;

    if (!player) {
      console.log(`⚠️ Player ${playerId} not found in game ${gameId}`);
      return;
    }

    console.log(`🔍 Fresh player data - current_letter: "${player.current_letter}", placement_confirmed: ${player.placement_confirmed}`);
    
    let gridState: GridCell[][];
    try {
      gridState = typeof player.grid_state === 'string' 
        ? JSON.parse(player.grid_state)
        : player.grid_state;
      console.log(`🔍 Parsed grid state successfully`);
    } catch (error) {
      console.error(`❌ Failed to parse grid_state:`, error);
      console.log(`🗂️ Raw grid_state:`, player.grid_state);
      return;
    }
    
    console.log(`🔍 Current grid state for player ${playerId}:`, JSON.stringify(gridState));
    
    // First check if the letter is already placed somewhere in the grid
    let foundExistingPlacement = false;
    for (let y = 0; y < gridState.length; y++) {
      for (let x = 0; x < gridState[y].length; x++) {
        const cellLetter = gridState[y][x].letter;
        console.log(`🔍 Checking cell (${x}, ${y}): "${cellLetter}" vs "${letter}" (match: ${cellLetter === letter})`);
        
        if (cellLetter === letter) {
          console.log(`✅ Letter "${letter}" already placed at (${x}, ${y}) for player ${playerId} - confirming placement`);
          foundExistingPlacement = true;
          
          // Letter already placed, just broadcast the existing placement
          this.socketService.broadcastToRoom(`game:${gameId}`, 'letter:placed', {
            gameId,
            playerId,
            letter,
            x,
            y,
            auto: true,
            confirmed: true
          });
          
          return; // Letter already placed, no need to move it
        }
      }
    }
    
    if (!foundExistingPlacement) {
      console.log(`⚠️ Letter "${letter}" not found in grid for player ${playerId}, placing in random empty cell`);
    }
    
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
      
      console.log(`🤖 Auto-placed "${letter}" at random position (${x}, ${y}) for player ${playerId} (${emptyCells.length} empty cells available)`);
      
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
    
    console.log(`❌ No empty cells found for player ${playerId} - grid is full!`);
  }

  private async isGameFinished(gameId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const players = await db.all(`
      SELECT user_id, grid_state FROM players WHERE game_id = ?
    `, gameId) as { user_id: number; grid_state: string }[];

    console.log(`🔍 isGameFinished check: gameId=${gameId}, players=${players.length}`);

    // Check if any player's grid is full
    for (const player of players) {
      const grid = JSON.parse(player.grid_state) as GridCell[][];
      const lettersCount = grid.flat().filter(cell => cell.letter).length;
      const totalCells = grid.flat().length;
      const isEmpty = grid.some(row => row.some(cell => !cell.letter));
      
      console.log(`👤 Player ${player.user_id}: ${lettersCount}/${totalCells} letters, isEmpty=${isEmpty}`);
      
      if (!isEmpty) {
        console.log(`🏁 Game ${gameId} is finished - Player ${player.user_id} has full grid!`);
        return true; // Grid is full
      }
    }

    console.log(`⏳ Game ${gameId} continues - no player has full grid yet`);
    return false;
  }

  private async finishGame(gameId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    await db.run(`
      UPDATE games 
      SET state = 'finished', current_phase = 'finished', finished_at = datetime('now')
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
      console.warn('Word validation service not ready, skipping score calculation');
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

    // Update player's score in database
    await db.run(`
      UPDATE players 
      SET final_score = ? 
      WHERE game_id = ? AND user_id = ?
    `, gridScore.totalPoints, gameId, userId);

    console.log(`🎯 Player ${userId} score: ${gridScore.totalPoints} (${gridScore.words.length} words)`);
    
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

    // Update game status - COMMENTED OUT: games table doesn't have status column
    // await db.run(`
    //   UPDATE games SET status = 'completed' WHERE id = ?
    // `, gameId);

    // Calculate final scores
    const scores = await this.calculateAllPlayerScores(gameId);

    // Get player details for leaderboard
    const players = await db.all(`
      SELECT p.user_id, u.username, p.final_score, p.grid_state
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.game_id = ?
      ORDER BY p.final_score DESC
    `, gameId);

    // Broadcast game end with scores
    this.socketService.broadcastToRoom(`game:${gameId}`, 'game:ended', {
      gameId,
      leaderboard: players.map(p => ({
        userId: p.user_id,
        username: p.username,
        score: p.final_score,
        words: scores[p.user_id]?.words || []
      })),
      finalScores: scores
    });

    console.log(`🏁 Game ${gameId} ended. Winner: ${players[0]?.username} (${players[0]?.final_score} pts)`);
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
      console.log(`🕒 Cleared timer for game ${gameId}`);
    }
  }
}