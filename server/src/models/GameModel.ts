import { DatabaseManager } from '../config/database';
import { Game, GameWithPlayers } from './types';

export class GameModel {
  static async create(roomId: number): Promise<Game> {
    const dbManager = await DatabaseManager.getInstance();
    
    return await dbManager.transaction(async (db) => {
      // Create game
      const availableLetters = GameModel.generateAvailableLetters();
      const gameResult = await db.run(`
        INSERT INTO games (room_id, available_letters) 
        VALUES (?, ?)
      `, roomId, JSON.stringify(availableLetters));
      
      const gameId = gameResult.lastInsertRowid as number;
      
      // Create players from room members
      const { RoomModel } = await import('./RoomModel');
      const members = await RoomModel.getRoomMembers(roomId);
      
      for (let index = 0; index < members.length; index++) {
        await db.run(`
          INSERT INTO players (game_id, user_id, position) 
          VALUES (?, ?, ?)
        `, gameId, members[index].id, index);
      }
      
      // Update room status
      const { RoomModel: RM } = await import('./RoomModel');
      await RM.updateStatus(roomId, 'playing');
      
      return await GameModel.findById(gameId) as Game;
    });
  }

  static async findById(id: number): Promise<Game | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const game = await db.get(`
      SELECT * FROM games WHERE id = ?
    `, id) as Game | null;
    
    if (game) {
      game.board_state = JSON.parse(game.board_state as any);
      game.available_letters = JSON.parse(game.available_letters as any);
    }
    
    return game;
  }

  static async findByRoomId(roomId: number): Promise<Game | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const game = await db.get(`
      SELECT * FROM games 
      WHERE room_id = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `, roomId) as Game | null;
    
    if (game) {
      game.board_state = JSON.parse(game.board_state as any);
      game.available_letters = JSON.parse(game.available_letters as any);
    }
    
    return game;
  }

  static async getWithPlayers(gameId: number): Promise<GameWithPlayers | null> {
    const game = await GameModel.findById(gameId);
    if (!game) return null;

    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const playersData = await db.all(`
      SELECT 
        p.*,
        u.username,
        u.created_at as user_created_at,
        u.last_active
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.game_id = ?
      ORDER BY p.position ASC
    `, gameId) as any[];
    
    const players = playersData.map(row => ({
      id: row.id,
      game_id: row.game_id,
      user_id: row.user_id,
      position: row.position,
      score: row.score,
      board_state: JSON.parse(row.board_state),
      words_found: JSON.parse(row.words_found),
      ready_to_start: row.ready_to_start,
      joined_at: row.joined_at,
      // New game logic fields with defaults
      current_letter: row.current_letter || null,
      grid_state: row.grid_state ? JSON.parse(row.grid_state) : [],
      placement_confirmed: row.placement_confirmed || false,
      final_score: row.final_score || 0,
      username: row.username,
      created_at: row.user_created_at,
      last_active: row.last_active
    }));

    return {
      ...game,
      players
    };
  }

  static async updateBoardState(gameId: number, boardState: any[]): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE games 
      SET board_state = ?, turn_number = turn_number + 1
      WHERE id = ?
    `, JSON.stringify(boardState), gameId);
    
    return result.changes > 0;
  }

  static async setCurrentTurn(gameId: number, userId: number | null): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE games 
      SET current_turn = ?, turn_started_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END
      WHERE id = ?
    `, userId, userId, gameId);
    
    return result.changes > 0;
  }

  static async updateGameState(gameId: number, state: Game['state']): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE games 
      SET state = ?, finished_at = CASE WHEN ? = 'finished' THEN CURRENT_TIMESTAMP ELSE finished_at END
      WHERE id = ?
    `, state, state, gameId);
    
    return result.changes > 0;
  }

  static async getAvailableLetters(gameId: number): Promise<string[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT available_letters FROM games WHERE id = ?
    `, gameId) as { available_letters: string } | null;
    
    return result ? JSON.parse(result.available_letters) : [];
  }

  static async updateAvailableLetters(gameId: number, letters: string[]): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE games 
      SET available_letters = ? 
      WHERE id = ?
    `, JSON.stringify(letters), gameId);
    
    return result.changes > 0;
  }

  private static generateAvailableLetters(): string[] {
    // Swedish letter distribution (simplified)
    const letters = [
      // Vowels (more common)
      'A', 'A', 'A', 'A', 'E', 'E', 'E', 'E', 'I', 'I', 'O', 'O', 'U', 'U',
      'Å', 'Ä', 'Ä', 'Ö',
      // Common consonants
      'N', 'N', 'N', 'T', 'T', 'T', 'R', 'R', 'R', 'S', 'S', 'L', 'L',
      'K', 'K', 'D', 'D', 'M', 'M', 'G', 'G', 'V', 'V',
      // Less common
      'H', 'F', 'P', 'B', 'C', 'J', 'X', 'Z', 'Q', 'W', 'Y'
    ];
    
    // Shuffle and return
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    
    return letters;
  }
}