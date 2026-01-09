import { DatabaseManager } from '../config/database';
import { Room, RoomWithMembers, User, RoomSettings } from './types';

export class RoomModel {
  static async create(data: {
    name: string;
    created_by: number;
    settings?: Partial<RoomSettings>;
  }): Promise<Room> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const code = await this.generateRoomCode();
    
    // Default room settings
    const defaultSettings: RoomSettings = {
      grid_size: 5,
      max_players: 6,
      letter_timer: 20,  // Increased from 10 to 20 seconds
      placement_timer: 30,  // Increased from 15 to 30 seconds
      is_private: false
    };
    
    const finalSettings = { ...defaultSettings, ...data.settings };
    
    const result = await db.run(`
      INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, 
      code,
      data.name,
      data.created_by,
      finalSettings.max_players,
      finalSettings.grid_size,
      finalSettings.placement_timer,
      JSON.stringify(finalSettings)
    );
    
    const room = await this.findById(result.lastInsertRowid as number) as Room;
    
    // Auto-join creator to room
    console.log(`🏠 RoomModel.create: Auto-joining user ${data.created_by} to room ${room.id}`);
    const addMemberResult = await this.addMember(room.id, data.created_by);
    console.log(`🏠 RoomModel.create: addMember result:`, addMemberResult);
    
    // Verify member was added
    const memberCount = await this.getMemberCount(room.id);
    console.log(`🏠 RoomModel.create: Member count after adding:`, memberCount);
    
    return room;
  }

  static async findById(id: number): Promise<Room | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const room = await db.get(`
      SELECT * FROM rooms WHERE id = ?
    `, id) as Room | null;
    
    return room ? this.parseRoomSettings(room) : null;
  }

  static async findByCode(code: string): Promise<Room | null> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const room = await db.get(`
      SELECT * FROM rooms WHERE code = ?
    `, code) as Room | null;
    
    if (room) {
      console.log(`🔍 RoomModel.findByCode(${code}): Raw settings from DB:`, room.settings);
      const parsed = this.parseRoomSettings(room);
      console.log(`🔍 RoomModel.findByCode(${code}): After parseRoomSettings - require_password:`, parsed.settings?.require_password, `(type: ${typeof parsed.settings?.require_password})`);
      return parsed;
    }
    return null;
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
      const parsedRoom = this.parseRoomSettings(room);
      roomsWithMembers.push({
        ...parsedRoom,
        members,
        member_count: room.member_count
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
    } catch (error: any) {
      console.error(`❌ RoomModel.addMember: Error adding member:`, error);
      console.error(`❌ RoomModel.addMember: Error message:`, error?.message);
      console.error(`❌ RoomModel.addMember: Error code:`, error?.code);
      // Handle unique constraint violation (user already in room)
      return false;
    }
  }

  static async isMember(roomId: number, userId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    console.log(`🔍 isMember check: roomId=${roomId} (${typeof roomId}), userId=${userId} (${typeof userId})`);
    
    try {
      const member = await db.get(`
        SELECT 1 FROM room_members 
        WHERE room_id = ? AND user_id = ? 
        LIMIT 1
      `, roomId, userId);
      
      const result = member !== null && member !== undefined;
      console.log(`🔍 isMember result: ${result} for room ${roomId}, user ${userId}`);
      
      return result;
    } catch (error) {
      console.error(`❌ RoomModel.isMember: Error checking membership:`, error);
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
    
    if (result.changes > 0) {
      // Check if room is now empty and reset status to waiting if needed
      const memberCount = await this.getMemberCount(roomId);
      
      if (memberCount === 0) {
        console.log(`🔄 Room ${roomId} is now empty, resetting to waiting status...`);
        
        // Delete any ongoing games for this room
        try {
          await db.run('DELETE FROM players WHERE game_id IN (SELECT id FROM games WHERE room_id = ?)', roomId);
          await db.run('DELETE FROM games WHERE room_id = ?', roomId);
        } catch (error) {
          console.warn('⚠️ Failed to clean up games for empty room:', error);
        }
        
        // Reset room status to waiting
        await db.run('UPDATE rooms SET status = ? WHERE id = ?', 'waiting', roomId);
      }
    }
    
    return result.changes > 0;
  }

  static async getRoomMembers(roomId: number): Promise<User[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    console.log(`🔍 RoomModel.getRoomMembers: Getting members for room ${roomId}`);
    
    const members = await db.all(`
      SELECT u.* 
      FROM users u
      JOIN room_members rm ON u.id = rm.user_id
      WHERE rm.room_id = ?
      ORDER BY rm.joined_at ASC
    `, roomId) as User[];
    
    console.log(`🔍 RoomModel.getRoomMembers: Found ${members.length} members:`, members);
    
    return members;
  }

  static async getMemberCount(roomId: number): Promise<number> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.get(`
      SELECT COUNT(*) as count 
      FROM room_members 
      WHERE room_id = ?
    `, roomId) as { count: number } | undefined;
    
    return result?.count ?? 0;
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

  static async transferOwnership(roomId: number, newCreatorId: number): Promise<boolean> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const result = await db.run(`
      UPDATE rooms 
      SET created_by = ? 
      WHERE id = ?
    `, newCreatorId, roomId);
    
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

  /**
   * Get all rooms a user is currently a member of
   */
  static async getUserRooms(userId: number): Promise<Room[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const rooms = await db.all(`
      SELECT r.* FROM rooms r
      INNER JOIN room_members rm ON r.id = rm.room_id
      WHERE rm.user_id = ? AND r.status != 'abandoned' AND r.status != 'deleted'
    `, userId) as Room[];
    
    return rooms.map(room => this.parseRoomSettings(room));
  }

  /**
   * Remove user from all rooms they are currently in
   * Returns the room codes they were removed from
   */
  static async removeUserFromAllRooms(userId: number): Promise<string[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    // Get rooms user is in before removing
    const rooms = await this.getUserRooms(userId);
    const roomCodes = rooms.map(r => r.code);
    
    // Remove from all rooms
    await db.run(`
      DELETE FROM room_members WHERE user_id = ?
    `, userId);
    
    return roomCodes;
  }

  // Cleanup-related methods
  static async getInactiveRooms(timeoutMs: number): Promise<Room[]> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    const cutoffTime = new Date(Date.now() - timeoutMs).toISOString();
    
    return await db.all(`
      SELECT r.* FROM rooms r
      WHERE r.status != 'deleted' 
      AND r.created_at < ?
      ORDER BY r.created_at ASC
    `, cutoffTime) as Room[];
  }

  static async getConnectedMemberCount(_roomId: number): Promise<number> {
    // TODO: This would need to check actual socket connections
    // For now, return 0 to allow cleanup
    // In a real implementation, this would check:
    // - Active socket connections
    // - Last activity timestamps  
    // - User online status
    
    return 0;
  }

  static async removeAllMembers(roomId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    await db.run(`
      DELETE FROM room_members WHERE room_id = ?
    `, roomId);
  }

  static async markAsDeleted(roomId: number): Promise<void> {
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();
    
    await db.run(`
      UPDATE rooms 
      SET status = 'abandoned' 
      WHERE id = ?
    `, roomId);
  }

  static async generateRoomCode(): Promise<string> {
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

  private static parseRoomSettings(room: any): Room {
    try {
      // Handle null/undefined settings
      if (!room.settings) {
        console.warn(`⚠️ Room ${room.code} has no settings, using defaults`);
        return {
          ...room,
          settings: {
            grid_size: room.board_size || 5,
            max_players: room.max_players || 6,
            letter_timer: room.settings?.letter_timer || 20,
            placement_timer: room.settings?.placement_timer || 30,
            require_password: false
          }
        } as Room;
      }

      const settings = typeof room.settings === 'string' 
        ? JSON.parse(room.settings) 
        : room.settings;
      
      // Ensure require_password is a boolean (could be string "true"/"false" or boolean)
      let requirePassword = false;
      if (settings && settings.require_password !== undefined && settings.require_password !== null) {
        if (typeof settings.require_password === 'boolean') {
          requirePassword = settings.require_password;
        } else if (typeof settings.require_password === 'string') {
          requirePassword = settings.require_password.toLowerCase() === 'true';
        } else {
          requirePassword = Boolean(settings.require_password);
        }
      }
      
      const completeSettings = {
        grid_size: room.board_size || settings?.grid_size || 5,
        max_players: room.max_players || settings?.max_players || 6,
        letter_timer: settings?.letter_timer || 20,
        placement_timer: settings?.placement_timer || 30,
        ...settings,
        require_password: requirePassword
      };
      
      return {
        ...room,
        settings: completeSettings
      } as Room;
    } catch (error) {
      console.error(`❌ Error parsing settings for room ${room.code}:`, error);
      // Fallback to default settings if parsing fails
      const defaultSettings: RoomSettings = {
        grid_size: room.board_size || 5,
        max_players: room.max_players || 6,
        letter_timer: 20,
        placement_timer: room.turn_duration || 30,
        is_private: false,
        require_password: false
      };
      
      return {
        ...room,
        settings: defaultSettings
      } as Room;
    }
  }
}