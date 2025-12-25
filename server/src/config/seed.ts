import { UserModel } from '../models';

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