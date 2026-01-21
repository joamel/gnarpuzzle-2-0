import { DatabaseManager } from '../config/database';
import { User } from './types';

export class UserModel {
  static async create(username: string): Promise<User> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      INSERT INTO users (username) 
      VALUES (?)
    `, username);
    
    // Return mock user for testing
    return {
      id: result.lastInsertRowid as number,
      username,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    };
  }

  static async createWithPassword(username: string, passwordHash: string): Promise<User> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const result = await db.run(
      `
      INSERT INTO users (username, password_hash)
      VALUES (?, ?)
    `,
      username,
      passwordHash
    );

    return {
      id: result.lastInsertRowid as number,
      username,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    };
  }

  static async findById(id: number): Promise<User | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.get(`
      SELECT * FROM users WHERE id = ?
    `, id) as User | null;
  }

  static async findByUsername(username: string): Promise<User | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.get(`
      SELECT * FROM users WHERE username COLLATE NOCASE = ?
    `, username) as User | null;
  }

  static async updateLastActive(id: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    await db.run(`
      UPDATE users 
      SET last_active = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, id);
  }

  static async updateUsername(id: number, username: string): Promise<User | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const result = await db.run(
      `
      UPDATE users
      SET username = ?, last_active = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      username,
      id
    );

    if (!result.changes) return null;
    return await UserModel.findById(id);
  }

  static async setPasswordHash(id: number, passwordHash: string): Promise<User | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const result = await db.run(
      `
      UPDATE users
      SET password_hash = ?, last_active = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      passwordHash,
      id
    );

    if (!result.changes) return null;
    return await UserModel.findById(id);
  }

  static async getAll(limit = 100, offset = 0): Promise<User[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.all(`
      SELECT * FROM users 
      ORDER BY last_active DESC 
      LIMIT ? OFFSET ?
    `, limit, offset) as User[];
  }

  static async delete(id: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      DELETE FROM users WHERE id = ?
    `, id);
    
    return result.changes > 0;
  }

  static async exists(username: string): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT 1 FROM users WHERE username COLLATE NOCASE = ? LIMIT 1
    `, username);
    
    return !!result;
  }

  static async getActiveUsers(minutesAgo = 60): Promise<User[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.all(`
      SELECT * FROM users 
      WHERE last_active > datetime('now', '-' || ? || ' minutes')
      ORDER BY last_active DESC
    `, minutesAgo) as User[];
  }
}