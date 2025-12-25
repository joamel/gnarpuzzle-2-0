import { DatabaseManager } from '../config/database';
import { Room, RoomWithMembers, User } from './types';

export class RoomModel {
  static async create(data: {
    name: string;
    created_by: number;
    max_players?: number;
    board_size?: number;
    turn_duration?: number;
  }): Promise<Room> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const code = await this.generateRoomCode();
    
    const result = await db.run(`
      INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, 
      code,
      data.name,
      data.created_by,
      data.max_players || 4,
      data.board_size || 5,
      data.turn_duration || 15
    );
    
    const room = await this.findById(result.lastInsertRowid as number) as Room;
    
    // Auto-join creator to room
    await this.addMember(room.id, data.created_by);
    
    return room;
  }

  static async findById(id: number): Promise<Room | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.get(`
      SELECT * FROM rooms WHERE id = ?
    `, id) as Room | null;
  }

  static async findByCode(code: string): Promise<Room | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.get(`
      SELECT * FROM rooms WHERE code = ?
    `, code) as Room | null;
  }

  static async getActiveRooms(): Promise<RoomWithMembers[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const rooms = await db.all(`
      SELECT 
        r.*,
        COUNT(rm.user_id) as member_count
      FROM rooms r
      LEFT JOIN room_members rm ON r.id = rm.room_id
      WHERE r.status IN ('waiting', 'playing')
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `) as (Room & { member_count: number })[];
    
    const roomsWithMembers: RoomWithMembers[] = [];
    
    for (const room of rooms) {
      const members = await this.getRoomMembers(room.id);
      roomsWithMembers.push({
        ...room,
        members
      });
    }
    
    return roomsWithMembers;
  }

  static async addMember(roomId: number, userId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    try {
      const result = await db.run(`
        INSERT INTO room_members (room_id, user_id) 
        VALUES (?, ?)
      `, roomId, userId);
      
      return result.changes > 0;
    } catch (error) {
      // Handle unique constraint violation (user already in room)
      return false;
    }
  }

  static async removeMember(roomId: number, userId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      DELETE FROM room_members 
      WHERE room_id = ? AND user_id = ?
    `, roomId, userId);
    
    return result.changes > 0;
  }

  static async getRoomMembers(roomId: number): Promise<User[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    return await db.all(`
      SELECT u.* 
      FROM users u
      JOIN room_members rm ON u.id = rm.user_id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, roomId) as User[];
  }

  static async getMemberCount(roomId: number): Promise<number> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM room_members 
      WHERE room_id = ?
    `, roomId) as { count: number };
    
    return result.count;
  }

  static async updateStatus(id: number, status: Room['status']): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE rooms 
      SET status = ? 
      WHERE id = ?
    `, status, id);
    
    return result.changes > 0;
  }

  static async deleteEmptyRooms(): Promise<number> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      DELETE FROM rooms 
      WHERE id IN (
        SELECT r.id 
        FROM rooms r
        LEFT JOIN room_members rm ON r.id = rm.room_id
        WHERE rm.room_id IS NULL 
        AND r.created_at < datetime('now', '-10 minutes')
      )
    `);
    
    return result.changes;
  }

  static async isUserInRoom(roomId: number, userId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT 1 FROM room_members 
      WHERE room_id = ? AND user_id = ? 
      LIMIT 1
    `, roomId, userId);
    
    return !!result;
  }

  private static async generateRoomCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    
    do {
      result = '';
      for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    } while (await this.findByCode(result)); // Ensure uniqueness
    
    return result;
  }
}