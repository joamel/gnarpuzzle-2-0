import { UserModel, RoomModel } from '../models';
import { DatabaseManager } from './database';

export async function seedDatabase(): Promise<void> {
  console.log('🌱 Seeding database with test data...');

  try {
    // Create test users
    const testUsers = [
      'TestSpelare1',
      'TestSpelare2', 
      'TestSpelare3',
      'TestSpelare4',
      'GnarMaster',
      'WordWizard'
    ];

    for (const username of testUsers) {
      const exists = await UserModel.exists(username);
      if (!exists) {
        await UserModel.create(username);
        console.log(`✅ Created test user: ${username}`);
      }
    }

    // Create standard public rooms (4x4, 5x5, 6x6) WITHOUT auto-joining the creator
    const adminUser = await UserModel.findByUsername('GnarMaster');
    if (adminUser) {
      const standardRooms = [
        { name: 'Snabbspel 4×4', board_size: 4, max_players: 4, letter_timer: 15, placement_timer: 20 },
        { name: 'Klassiskt 5×5', board_size: 5, max_players: 6, letter_timer: 20, placement_timer: 30 },
        { name: 'Utmaning 6×6', board_size: 6, max_players: 4, letter_timer: 25, placement_timer: 40 }
      ];

      const dbManager = await DatabaseManager.getInstance();
      const db = dbManager.getDatabase();

      for (const roomData of standardRooms) {
        try {
          // Check if room already exists by name
          const existingRoom = await db.get(
            `SELECT id, status, settings FROM rooms WHERE name = ? LIMIT 1`,
            [roomData.name]
          ) as { id: number; status: string; settings: unknown } | undefined;

          const desiredSettings = JSON.stringify({
            grid_size: roomData.board_size,
            max_players: roomData.max_players,
            letter_timer: roomData.letter_timer,
            placement_timer: roomData.placement_timer,
            is_private: false,
            require_password: false
          });

          if (!existingRoom) {
            // Generate unique room code
            const code = await RoomModel.generateRoomCode();
            
            // Insert room directly WITHOUT auto-joining creator
            await db.run(`
              INSERT INTO rooms (code, name, created_by, max_players, board_size, turn_duration, settings, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')
            `,
              code,
              roomData.name,
              adminUser.id,
              roomData.max_players,
              roomData.board_size,
              roomData.placement_timer,
              desiredSettings
            );

            console.log(`✅ Created standard public room: ${roomData.name}`);
          } else {
            const isActive = ['waiting', 'playing'].includes(existingRoom.status);

            // If a standard room was previously auto-cleaned and marked abandoned,
            // revive it so it shows up again in the lobby.
            if (!isActive) {
              await db.run(
                `UPDATE rooms
                 SET status = 'waiting',
                     created_by = ?,
                     max_players = ?,
                     board_size = ?,
                     turn_duration = ?,
                     settings = ?
                 WHERE id = ?`,
                adminUser.id,
                roomData.max_players,
                roomData.board_size,
                roomData.placement_timer,
                desiredSettings,
                existingRoom.id
              );

              console.log(`♻️ Revived standard public room: ${roomData.name}`);
              continue;
            }

            // Backfill settings if missing/invalid so cleanup treats it as permanent.
            if (!existingRoom.settings) {
              await db.run(
                `UPDATE rooms SET settings = ? WHERE id = ?`,
                desiredSettings,
                existingRoom.id
              );
              console.log(`🛠️ Backfilled settings for standard public room: ${roomData.name}`);
            }

            console.log(`ℹ️  Standard public room already exists: ${roomData.name}`);
          }
        } catch (err) {
          console.log(`ℹ️  Standard room ${roomData.name} already exists or error creating:`, err);
        }
      }
    }

    console.log('🌱 Database seeding completed!\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Development-only: reset database with fresh seed data
export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot reset database in production!');
  }

  console.log('🔄 Resetting database...');
  
  const { getDatabase } = await import('./database');
  
  try {
    const db = await getDatabase();
    await db.exec(`
      DELETE FROM players;
      DELETE FROM room_members;
      DELETE FROM games;
      DELETE FROM rooms;
      DELETE FROM users;
      DELETE FROM schema_migrations;
    `);
    console.log('🗑️  Database cleared');
  } catch (error) {
    console.log('ℹ️  Database clear skipped (tables may not exist yet)');
  }
  
  // Re-run migrations
  const { MigrationManager } = await import('./migrations');
  const migrationManager = new MigrationManager();
  await migrationManager.runMigrations();
  
  // Re-seed
  await seedDatabase();
}