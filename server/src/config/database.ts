// Hybrid database implementation supporting both SQLite and Mock
// Automatically detects if better-sqlite3 is available

import * as path from 'path';
import * as fs from 'fs';
import { DatabaseInterface, SQLiteDatabase } from './sqlite';
import { PostgresDatabase } from './postgres';
import { dbLogger } from '../utils/logger';

// Import all migrations
import m001 from './migrations/001_create_users_table';
import m002 from './migrations/002_create_rooms_table';
import m003 from './migrations/003_create_games_table';
import m004 from './migrations/004_create_players_table';
import m005 from './migrations/005_create_room_members_table';
import m006 from './migrations/006_enhance_game_logic_schema';
import m007 from './migrations/007_add_password_hash_to_users';
import m008 from './migrations/008_case_insensitive_usernames';
import m009 from './migrations/009_fix_phase_timer_end_bigint';

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
    dbLogger.debug('Mock DB exec', { queryPreview: `${query.substring(0, 50)}...` });
  }

  async run(query: string, ...params: any[]): Promise<{ lastInsertRowid: number; changes: number }> {
    dbLogger.debug('Mock DB run', { queryPreview: `${query.substring(0, 50)}...`, params });
    
    // Handle user insertions
    if (query.toLowerCase().includes('insert into users')) {
      const id = this.nextId++;
      const username = params[0];
      const password_hash = params.length > 1 ? params[1] : null;
      const user = {
        id: id,
        username: username,
        password_hash,
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
      dbLogger.debug('Mock DB stored room member', { roomId: room_id, userId: user_id });
      dbLogger.debug('Mock DB current room members', { roomMembers: Array.from(this.roomMembers.entries()) });
      return { lastInsertRowid: this.nextId++, changes: 1 };
    }

    // Handle UPDATE queries (like updating last_active)
    if (query.toLowerCase().includes('update')) {
      return { lastInsertRowid: 0, changes: 1 };
    }
    
    return { lastInsertRowid: this.nextId++, changes: 1 };
  }

  async get(query: string, ...params: any[]): Promise<any | null> {
    dbLogger.debug('Mock DB get', { queryPreview: `${query.substring(0, 50)}...`, params });
    
    // Handle user queries by ID
    if (query.toLowerCase().includes('select * from users where id')) {
      const id = params[0];
      return this.users.get(id) || null;
    }

    // Handle user queries by username  
    if (query.toLowerCase().includes('select * from users where username')) {
      const username = params[0];
      const wanted = typeof username === 'string' ? username.toLowerCase() : String(username ?? '').toLowerCase();
      for (const user of this.users.values()) {
        const existing = typeof user.username === 'string' ? user.username.toLowerCase() : String(user.username ?? '').toLowerCase();
        if (existing === wanted) {
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
      dbLogger.debug('Mock DB room member count', { roomId, memberCount });
      return { count: memberCount };
    }

    // Handle room member existence checks
    if (query.toLowerCase().includes('select 1 from room_members')) {
      const roomId = params[0];
      const userId = params[1];
      const memberKey = `${roomId}-${userId}`;
      const exists = this.roomMembers.has(memberKey);
      dbLogger.debug('Mock DB membership check', { roomId, userId, exists });
      return exists ? { '1': 1 } : null;
    }
    
    return null;
  }

  async all(query: string, ...params: any[]): Promise<any[]> {
    dbLogger.debug('Mock DB all', { queryPreview: `${query.substring(0, 50)}...`, params });
    
    // Handle room members JOIN query
    if (query.toLowerCase().includes('select u.*') && 
        query.toLowerCase().includes('from users u') &&
        query.toLowerCase().includes('join room_members rm')) {
      const roomId = params[0];
      dbLogger.debug('Mock DB getting members for room', { roomId });
      dbLogger.debug('Mock DB all room members in system', { roomMembers: Array.from(this.roomMembers.entries()) });
      dbLogger.debug('Mock DB all users in system', { users: Array.from(this.users.entries()) });
      
      // Find all members for this room
      const memberUserIds = Array.from(this.roomMembers.values())
        .filter(member => {
          const matches = member.room_id === roomId || member.room_id === Number(roomId);
          dbLogger.debug('Mock DB comparing member.room_id with roomId', {
            memberRoomId: member.room_id,
            memberRoomIdType: typeof member.room_id,
            roomId,
            roomIdType: typeof roomId,
            matches
          });
          return matches;
        })
        .map(member => member.user_id);
        
      dbLogger.debug('Mock DB found member IDs for room', { roomId, memberUserIds });
      
      // Get user details for each member
      const members = memberUserIds.map(userId => {
        // Try both number and string versions of the ID
        let user = this.users.get(userId);
        if (!user) {
          user = this.users.get(Number(userId));
        }
        dbLogger.debug('Mock DB looking up user', { userId, userFound: Boolean(user) });
        return user;
      }).filter(user => user !== undefined);
        
      dbLogger.debug('Mock DB returning members', { roomId, memberCount: members.length });
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
    dbLogger.debug('Mock database connection closed');
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
    const postgresUrl = process.env.DATABASE_URL;
    const dbPath =
      process.env.DATABASE_PATH ||
      process.env.DB_PATH ||
      path.join(process.cwd(), 'data', 'gnarpuzzle.db');
    
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Prefer Postgres when DATABASE_URL is provided (recommended for Render free tier).
    if (postgresUrl) {
      this.db = new PostgresDatabase(postgresUrl);
      dbLogger.info('Using Postgres database (DATABASE_URL provided)');
      
      // Run migrations to create schema
      dbLogger.info('Running database migrations');
      const { MigrationRunner } = await import('./MigrationRunner');
      const migrationRunner = new MigrationRunner(this.db);
      
      // Register all migrations in order
      migrationRunner.registerMigration(m001);
      migrationRunner.registerMigration(m002);
      migrationRunner.registerMigration(m003);
      migrationRunner.registerMigration(m004);
      migrationRunner.registerMigration(m005);
      migrationRunner.registerMigration(m006);
      migrationRunner.registerMigration(m007);
      migrationRunner.registerMigration(m008);
        migrationRunner.registerMigration(m009);
      
      // Run all pending migrations
      await migrationRunner.runPendingMigrations();
      
      // Development mode: Clear/reset rooms on startup
      if (process.env.NODE_ENV !== 'production') {
        const clearMode = process.env.DB_CLEAR_MODE || 'reset'; // 'clear', 'reset', or 'none'
        
        if (clearMode === 'clear') {
          await (this.db as any).clearAllRoomsAndGames();
        } else if (clearMode === 'reset') {
          await (this.db as any).resetPlayingRooms();
        }
      }
      return;
    }

    // Try to use SQLite if available, otherwise fallback to mock
    let useSQLite = false;
    try {
      // Check if better-sqlite3 is available
      require.resolve('better-sqlite3');
      useSQLite = true;
    } catch {
      // better-sqlite3 not installed
      useSQLite = false;
    }

    if (useSQLite) {
      this.db = new SQLiteDatabase(dbPath);
      dbLogger.info('Using real SQLite database', { dbPath });
      
      // Run migrations to create schema
      dbLogger.info('Running database migrations');
      const { MigrationRunner } = await import('./MigrationRunner');
      const migrationRunner = new MigrationRunner(this.db);
      
      // Register all migrations in order
      migrationRunner.registerMigration(m001);
      migrationRunner.registerMigration(m002);
      migrationRunner.registerMigration(m003);
      migrationRunner.registerMigration(m004);
      migrationRunner.registerMigration(m005);
      migrationRunner.registerMigration(m006);
      migrationRunner.registerMigration(m007);
      migrationRunner.registerMigration(m008);
      
      // Run all pending migrations
      await migrationRunner.runPendingMigrations();

      // Development mode: Clear/reset rooms on startup
      if (process.env.NODE_ENV !== 'production') {
        const clearMode = process.env.DB_CLEAR_MODE || 'reset'; // 'clear', 'reset', or 'none'
        
        if (clearMode === 'clear') {
          await (this.db as any).clearAllRoomsAndGames();
        } else if (clearMode === 'reset') {
          await (this.db as any).resetPlayingRooms();
        }
      }
    } else {
      // Fallback to mock database ONLY if better-sqlite3 is not installed
      this.db = new SimpleDatabaseMock();
      dbLogger.warn('Using mock database (better-sqlite3 not installed)', { dbPath });
      dbLogger.info('To use real SQLite, install: npm install better-sqlite3 @types/better-sqlite3');
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
    dbLogger.debug('Starting transaction');
    try {
      const result = await fn(this.db);
      dbLogger.debug('Transaction committed');
      return result;
    } catch (error) {
      dbLogger.warn('Transaction rolled back', {
        error: error instanceof Error ? error.message : String(error)
      });
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