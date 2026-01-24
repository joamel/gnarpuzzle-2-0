import { DatabaseManager } from '../config/database';
import { PlacementConfirmedState, Player, PlayerWithUser } from './types';

export class PlayerModel {
  static async findById(id: number): Promise<Player | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const player = await db.get(`
      SELECT * FROM players WHERE id = ?
    `, id) as Player | null;
    
    if (player) {
      player.board_state = JSON.parse(player.board_state as any);
      player.words_found = JSON.parse(player.words_found as any);
    }
    
    return player;
  }

  static async findByGameAndUser(gameId: number, userId: number): Promise<Player | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const player = await db.get(`
      SELECT * FROM players WHERE game_id = ? AND user_id = ?
    `, gameId, userId) as Player | null;
    
    if (player) {
      player.board_state = JSON.parse(player.board_state as any);
      player.words_found = JSON.parse(player.words_found as any);
    }
    
    return player;
  }

  static async getGamePlayers(gameId: number): Promise<PlayerWithUser[]> {
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
    
    return playersData.map(row => ({
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
      placement_confirmed: Number(row.placement_confirmed ?? 0) as PlacementConfirmedState,
      final_score: row.final_score || 0,
      user: {
        id: row.user_id,
        username: row.username,
        created_at: row.user_created_at,
        last_active: row.last_active
      }
    }));
  }

  static async updateBoardState(playerId: number, boardState: any[]): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE players 
      SET board_state = ? 
      WHERE id = ?
    `, JSON.stringify(boardState), playerId);
    
    return result.changes > 0;
  }

  static async addScore(playerId: number, points: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE players 
      SET score = score + ? 
      WHERE id = ?
    `, points, playerId);
    
    return result.changes > 0;
  }

  static async addFoundWord(playerId: number, word: string, points: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    
    return await dbManager.transaction(async (db) => {
      // Get current words
      const result = await db.get(`
        SELECT words_found FROM players WHERE id = ?
      `, playerId) as { words_found: string } | null;
      
      if (!result) return false;
      
      const wordsFound = JSON.parse(result.words_found);
      wordsFound.push({ word, points, timestamp: new Date().toISOString() });
      
      // Update words and score
      const updateResult = await db.run(`
        UPDATE players 
        SET words_found = ?, score = score + ? 
        WHERE id = ?
      `, JSON.stringify(wordsFound), points, playerId);
      
      return updateResult.changes > 0;
    });
  }

  static async setReadyToStart(playerId: number, ready: boolean): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE players 
      SET ready_to_start = ? 
      WHERE id = ?
    `, ready, playerId);
    
    return result.changes > 0;
  }

  static async areAllPlayersReady(gameId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT COUNT(*) as total, COUNT(CASE WHEN ready_to_start = TRUE THEN 1 END) as ready
      FROM players 
      WHERE game_id = ?
    `, gameId) as { total: number; ready: number };
    
    return result.total > 0 && result.total === result.ready;
  }

  static async getPlayerCount(gameId: number): Promise<number> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT COUNT(*) as count FROM players WHERE game_id = ?
    `, gameId) as { count: number };
    
    return result.count;
  }

  static async getLeaderboard(gameId: number): Promise<PlayerWithUser[]> {
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
      ORDER BY p.score DESC, p.joined_at ASC
    `, gameId) as any[];
    
    return playersData.map(row => ({
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
      placement_confirmed: Number(row.placement_confirmed ?? 0) as PlacementConfirmedState,
      final_score: row.final_score || 0,
      user: {
        id: row.user_id,
        username: row.username,
        created_at: row.user_created_at,
        last_active: row.last_active
      }
    }));
  }
}