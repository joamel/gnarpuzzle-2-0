import Database from 'better-sqlite3';

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
    
    console.log(`🗄️  SQLite Database connected: ${dbPath}`);
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
      console.error(`❌ SQL Error in run():`, (error as Error).message);
      console.error(`📝 Query:`, query);
      console.error(`📋 Params:`, params);
      throw error;
    }
  }

  async get(query: string, ...params: any[]): Promise<any> {
    try {
      const stmt = this.db.prepare(query);
      const result = stmt.get(...params);
      return result || null;
    } catch (error) {
      console.error(`❌ SQL Error in get():`, (error as Error).message);
      console.error(`📝 Query:`, query);
      console.error(`📋 Params:`, params);
      throw error;
    }
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(...params);
      return results;
    } catch (error) {
      console.error(`❌ SQL Error in all():`, (error as Error).message);
      console.error(`📝 Query:`, query);
      console.error(`📋 Params:`, params);
      throw error;
    }
  }

  async exec(query: string): Promise<void> {
    try {
      this.db.exec(query);
    } catch (error) {
      console.error(`❌ SQL Error in exec():`, (error as Error).message);
      console.error(`📝 Query:`, query);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      console.log('🗄️  SQLite Database connection closed');
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
      console.log('🧹 Development mode: Clearing all rooms and games...');
      
      // Clear in reverse dependency order
      this.db.exec('DELETE FROM players');
      this.db.exec('DELETE FROM games');
      this.db.exec('DELETE FROM room_members');
      this.db.exec('DELETE FROM rooms');
      
      console.log('✅ All rooms and games cleared for development');
    } catch (error) {
      console.error('❌ Error clearing rooms and games:', error);
      throw error;
    }
  }

  // Development helper: Reset playing rooms to waiting
  async resetPlayingRooms(): Promise<void> {
    try {
      console.log('🔄 Development mode: Resetting playing rooms to waiting...');
      
      // Delete all games and players first  
      this.db.exec('DELETE FROM players');
      this.db.exec('DELETE FROM games');
      
      // Reset all rooms to waiting status
      const result = this.db.prepare('UPDATE rooms SET status = ? WHERE status = ?').run('waiting', 'playing');
      
      console.log(`✅ Reset ${result.changes} playing rooms to waiting status`);
    } catch (error) {
      console.error('❌ Error resetting playing rooms:', error);
      throw error;
    }
  }
}