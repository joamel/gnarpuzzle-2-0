// Real SQLite database implementation (currently disabled due to compilation issues)
// TODO: Re-enable when SQLite dependencies are properly configured

import path from 'path';
import fs from 'fs';

// For now, we'll use a simple in-memory mock for development
interface MockDatabase {
  exec: (query: string) => Promise<void>;
  run: (query: string, ...params: any[]) => Promise<{ lastInsertRowid: number; changes: number }>;
  get: (query: string, ...params: any[]) => Promise<any | null>;
  all: (query: string, ...params: any[]) => Promise<any[]>;
  close: () => Promise<void>;
}

class SimpleDatabaseMock implements MockDatabase {
  async exec(query: string): Promise<void> {
    console.log(`🔍 EXEC: ${query.substring(0, 50)}...`);
  }

  async run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    console.log(`🔍 RUN: ${query.substring(0, 50)}... with params:`, params);
    return { lastInsertRowid: Date.now(), changes: 1 };
  }

  async get(query: string, ...params: any[]): Promise<any | null> {
    console.log(`🔍 GET: ${query.substring(0, 50)}... with params:`, params);
    return null;
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    console.log(`🔍 ALL: ${query.substring(0, 50)}... with params:`, params);
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