import Database from 'better-sqlite3';
import { dbLogger } from '../utils/logger';

export interface DatabaseInterface {
  run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> | { lastInsertRowid: number; changes: number };
  get(query: string, ...params: any[]): Promise<any> | any;
  all(query: string, ...params: any[]): Promise<any[]> | any[];
  exec(query: string): Promise<void> | void;
  close(): Promise<void> | void;
}

export class SQLiteDatabase implements DatabaseInterface {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    dbLogger.info('SQLite Database connected', { dbPath });
  }

  async run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    try {
      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.changes
      };
    } catch (error) {
      dbLogger.error('SQL Error in run()', {
        message: (error as Error).message,
        query,
        params
      });
      throw error;
    }
  }

  async get(query: string, ...params: any[]): Promise<any> {
    try {
      const stmt = this.db.prepare(query);
      const result = stmt.get(...params);
      return result || null;
    } catch (error) {
      dbLogger.error('SQL Error in get()', {
        message: (error as Error).message,
        query,
        params
      });
      throw error;
    }
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);
      return results;
    } catch (error) {
      dbLogger.error('SQL Error in all()', {
        message: (error as Error).message,
        query,
        params
      });
      throw error;
    }
  }

  async exec(query: string): Promise<void> {
    try {
      this.db.exec(query);
    } catch (error) {
      dbLogger.error('SQL Error in exec()', {
        message: (error as Error).message,
        query
      });
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      dbLogger.info('SQLite Database connection closed');
    }
  }

  // SQLite-specific features
  transaction<T>(fn: (db: SQLiteDatabase) => T): T {
    return this.db.transaction(() => fn(this))();
  }

  pragma(statement: string): any {
    return this.db.pragma(statement);
  }

  backup(destinationPath: string): void {
    this.db.backup(destinationPath);
  }

  // Development helper: Clear all rooms and games
  async clearAllRoomsAndGames(): Promise<void> {
    try {
      dbLogger.debug('Clearing all rooms and games (development)');
      
      // Clear in reverse dependency order
      this.db.exec('DELETE FROM players');
      this.db.exec('DELETE FROM games');
      this.db.exec('DELETE FROM room_members');
      this.db.exec('DELETE FROM rooms');
      
      dbLogger.info('All rooms and games cleared (development)');
    } catch (error) {
      dbLogger.error('Error clearing rooms and games', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // Development helper: Reset playing rooms to waiting
  async resetPlayingRooms(): Promise<void> {
    try {
      dbLogger.debug('Resetting playing rooms to waiting (development)');
      
      // Delete all games and players first  
      this.db.exec('DELETE FROM players');
      this.db.exec('DELETE FROM games');
      
      // Reset all rooms to waiting status
      const result = this.db.prepare('UPDATE rooms SET status = ? WHERE status = ?').run('waiting', 'playing');
      
      dbLogger.info('Reset playing rooms to waiting', { changes: result.changes });
    } catch (error) {
      dbLogger.error('Error resetting playing rooms', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}