// Hybrid database implementation supporting both SQLite and Mock
// Automatically detects if better-sqlite3 is available

import * as path from 'path';
import * as fs from 'fs';
import { DatabaseInterface, SQLiteDatabase } from './sqlite';

// For now, we'll use a simple in-memory mock for development
interface MockDatabase extends DatabaseInterface {
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
  private roomMembers: Map<string, { room_id: number; user_id: number; joined_at: string }> = new Map();

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
      const [room_id, user_id] = params;
      const memberKey = `${room_id}-${user_id}`;
      const memberData = {
        room_id,
        user_id,
        joined_at: new Date().toISOString()
      };
      this.roomMembers.set(memberKey, memberData);
      console.log(`💾 Mock DB: Stored room member ${user_id} in room ${room_id}`);
      console.log(`💾 Mock DB: Current room members:`, Array.from(this.roomMembers.entries()));
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
      const roomId = params[0];
      const memberCount = Array.from(this.roomMembers.values())
        .filter(member => member.room_id === roomId).length;
      console.log(`🔢 Mock DB: Room ${roomId} has ${memberCount} members`);
      return { count: memberCount };
    }

    // Handle room member existence checks
    if (query.toLowerCase().includes('select 1 from room_members')) {
      const roomId = params[0];
      const userId = params[1];
      const memberKey = `${roomId}-${userId}`;
      const exists = this.roomMembers.has(memberKey);
      console.log(`🔍 Mock DB: User ${userId} ${exists ? 'is' : 'is not'} member of room ${roomId}`);
      return exists ? { '1': 1 } : null;
    }
    
    return null;
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    console.log(`🔍 ALL: ${query.substring(0, 50)}... with params:`, params);
    
    // Handle room members JOIN query
    if (query.toLowerCase().includes('select u.*') && 
        query.toLowerCase().includes('from users u') &&
        query.toLowerCase().includes('join room_members rm')) {
      const roomId = params[0];
      console.log(`👥 Mock DB: Getting members for room ${roomId}`);
      console.log(`👥 Mock DB: All room members in system:`, Array.from(this.roomMembers.entries()));
      console.log(`👥 Mock DB: All users in system:`, Array.from(this.users.entries()));
      
      // Find all members for this room
      const memberUserIds = Array.from(this.roomMembers.values())
        .filter(member => {
          const matches = member.room_id === roomId || member.room_id === Number(roomId);
          console.log(`👥 Mock DB: Comparing member.room_id ${member.room_id} (${typeof member.room_id}) with ${roomId} (${typeof roomId}): ${matches}`);
          return matches;
        })
        .map(member => member.user_id);
        
      console.log(`👥 Mock DB: Found member IDs for room ${roomId}: [${memberUserIds.join(', ')}]`);
      
      // Get user details for each member
      const members = memberUserIds.map(userId => {
        // Try both number and string versions of the ID
        let user = this.users.get(userId);
        if (!user) {
          user = this.users.get(Number(userId));
        }
        console.log(`👤 Mock DB: Looking up user ${userId}:`, user);
        return user;
      }).filter(user => user !== undefined);
        
      console.log(`👥 Mock DB: Returning ${members.length} members:`, members);
      return members;
    }
    
    // Return active rooms
    if (query.toLowerCase().includes('select') && query.toLowerCase().includes('from rooms')) {
      return Array.from(this.rooms.values()).map(room => {
        // Calculate actual member count
        const memberCount = Array.from(this.roomMembers.values())
          .filter(member => member.room_id === room.id).length;
        return {
          ...room,
          member_count: memberCount
        };
      });
    }
    
    return [];
  }

  async close(): Promise<void> {
    console.log('📁 Mock database connection closed');
  }
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: DatabaseInterface;

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

    // Try to use SQLite if available, otherwise fallback to mock
    try {
      // Check if better-sqlite3 is available
      require.resolve('better-sqlite3');
      this.db = new SQLiteDatabase(dbPath);
      console.log(`✅ Using real SQLite database: ${dbPath}`);
    } catch (error) {
      // Fallback to mock database
      this.db = new SimpleDatabaseMock();
      console.log(`📁 Mock Database connected for development: ${dbPath}`);
      console.log(`ℹ️  To use real SQLite, install: npm install better-sqlite3 @types/better-sqlite3`);
    }
  }

  public getDatabase(): DatabaseInterface {
    return this.db;
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
    }
  }

  // Transaction helper
  public async transaction<T>(fn: (db: DatabaseInterface) => Promise<T>): Promise<T> {
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

let dbInstance: DatabaseInterface | null = null;

export async function getDatabase(): Promise<DatabaseInterface> {
  if (!dbInstance) {
    const manager = await DatabaseManager.getInstance();
    dbInstance = manager.getDatabase();
  }
  return dbInstance;
}