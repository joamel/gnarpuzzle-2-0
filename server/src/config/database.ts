// Real SQLite database implementation (currently disabled due to compilation issues)
// TODO: Re-enable when SQLite dependencies are properly configured

import * as path from 'path';
import * as fs from 'fs';

// For now, we'll use a simple in-memory mock for development
interface MockDatabase {
  exec: (query: string) => Promise<void>;
  run: (query: string, ...params: any[]) => Promise<{ lastInsertRowid: number; changes: number }>;
  get: (query: string, ...params: any[]) => Promise<any | null>;
  all: (query: string, ...params: any[]) => Promise<any[]>;
  close: () => Promise<void>;
}

class SimpleDatabaseMock implements MockDatabase {
  private nextId: number = 1;
  private users: Map<number, any> = new Map();
  private rooms: Map<number, any> = new Map();
  private roomsByCode: Map<string, any> = new Map();

  async exec(query: string): Promise<void> {
    console.log(`🔍 EXEC: ${query.substring(0, 50)}...`);
  }

  async run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    console.log(`🔍 RUN: ${query.substring(0, 50)}... with params:`, params);
    
    // Handle user insertions
    if (query.toLowerCase().includes('insert into users')) {
      const id = this.nextId++;
      const username = params[0];
      const user = {
        id: id,
        username: username,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString()
      };
      this.users.set(id, user);
      return { lastInsertRowid: id, changes: 1 };
    }
    
    // Handle room insertions
    if (query.toLowerCase().includes('insert into rooms')) {
      const id = this.nextId++;
      const [code, name, created_by, max_players, board_size, turn_duration, settings] = params;
      const room = {
        id: id,
        code: code,
        name: name,
        created_by: created_by,
        status: 'waiting',
        max_players: max_players || 4,
        board_size: board_size || 4,
        turn_duration: turn_duration || 30,
        settings: settings || '{}',
        created_at: new Date().toISOString()
      };
      this.rooms.set(id, room);
      this.roomsByCode.set(code, room);
      return { lastInsertRowid: id, changes: 1 };
    }

    // Handle room_members insertions (joining rooms)
    if (query.toLowerCase().includes('insert into room_members')) {
      // Mock: just return success
      return { lastInsertRowid: this.nextId++, changes: 1 };
    }

    // Handle UPDATE queries (like updating last_active)
    if (query.toLowerCase().includes('update')) {
      return { lastInsertRowid: 0, changes: 1 };
    }
    
    return { lastInsertRowid: this.nextId++, changes: 1 };
  }

  async get(query: string, ...params: any[]): Promise<any | null> {
    console.log(`🔍 GET: ${query.substring(0, 50)}... with params:`, params);
    
    // Handle user queries by ID
    if (query.toLowerCase().includes('select * from users where id')) {
      const id = params[0];
      return this.users.get(id) || null;
    }

    // Handle user queries by username  
    if (query.toLowerCase().includes('select * from users where username')) {
      const username = params[0];
      for (const user of this.users.values()) {
        if (user.username === username) {
          return user;
        }
      }
      return null;
    }
    
    // Handle room queries by ID
    if (query.toLowerCase().includes('select * from rooms where id')) {
      const id = params[0];
      return this.rooms.get(id) || null;
    }
    
    // Handle room queries by code
    if (query.toLowerCase().includes('select * from rooms where code')) {
      const code = params[0];
      return this.roomsByCode.get(code) || null;
    }

    // Handle COUNT queries for room members
    if (query.toLowerCase().includes('select count(*) as count') && 
        query.toLowerCase().includes('from room_members')) {
      // Mock: return count of 1 for any room
      return { count: 1 };
    }

    // Handle room member existence checks
    if (query.toLowerCase().includes('select 1 from room_members')) {
      // Mock: assume user is already member (return 1) or not (return null)
      // const roomId = params[0];
      // const userId = params[1];
      // For simplicity, assume user is not yet a member
      return null;
    }
    
    return null;
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    console.log(`🔍 ALL: ${query.substring(0, 50)}... with params:`, params);
    
    // Return active rooms
    if (query.toLowerCase().includes('select') && query.toLowerCase().includes('from rooms')) {
      return Array.from(this.rooms.values()).map(room => ({
        ...room,
        member_count: 1 // Mock member count
      }));
    }
    
    return [];
  }

  async close(): Promise<void> {
    console.log('📁 Mock database connection closed');
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: MockDatabase;

  private constructor() {
    // Constructor is now async via init()
  }

  public static async getInstance(): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
      await DatabaseManager.instance.init();
    }
    return DatabaseManager.instance;
  }

  private async init(): Promise<void> {
    const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'gnarpuzzle.db');
    
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Use mock database for now
    this.db = new SimpleDatabaseMock();
    
    console.log(`📁 Mock Database connected for development: ${dbPath}`);
    console.log(`ℹ️  To use real SQLite, install: npm install sqlite3 sqlite @types/sqlite3`);
  }

  public getDatabase(): MockDatabase {
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
  }

  // Transaction helper
  public async transaction<T>(fn: (db: MockDatabase) => Promise<T>): Promise<T> {
    console.log('🔄 Starting transaction');
    try {
      const result = await fn(this.db);
      console.log('✅ Transaction committed');
      return result;
    } catch (error) {
      console.log('❌ Transaction rolled back');
      throw error;
    }
  }
}

let dbInstance: MockDatabase | null = null;

export async function getDatabase(): Promise<MockDatabase> {
  if (!dbInstance) {
    const manager = await DatabaseManager.getInstance();
    dbInstance = manager.getDatabase();
  }
  return dbInstance;
}