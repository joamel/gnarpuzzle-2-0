#!/usr/bin/env tsx

import { MigrationManager } from '../config/migrations';
import { seedDatabase, resetDatabase } from '../config/seed';

const command = process.argv[2];

async function main() {
  try {
    const migrationManager = new MigrationManager();

    switch (command) {
      case 'migrate':
        console.log('🔄 Running migrations...');
        await migrationManager.runMigrations();
        console.log('✅ Migrations completed!');
        break;

      case 'rollback':
        console.log('⬇️  Rolling back last migration...');
        await migrationManager.rollbackLastMigration();
        console.log('✅ Rollback completed!');
        break;

      case 'status':
        migrationManager.getStatus();
        break;

      case 'seed':
        console.log('🌱 Seeding database...');
        await migrationManager.runMigrations(); // Ensure migrations are up to date
        await seedDatabase();
        console.log('✅ Seeding completed!');
        break;

      case 'reset':
        if (process.env.NODE_ENV === 'production') {
          console.error('❌ Cannot reset database in production!');
          process.exit(1);
        }
        console.log('🔄 Resetting database...');
        await resetDatabase();
        console.log('✅ Database reset completed!');
        break;

      case 'setup':
        console.log('🚀 Setting up database...');
        await migrationManager.runMigrations();
        await seedDatabase();
        console.log('✅ Database setup completed!');
        break;

      default:
        console.log(`
📋 Available commands:

  migrate   - Run pending migrations
  rollback  - Rollback the last migration
  status    - Show migration status
  seed      - Seed database with test data
  reset     - Reset database and re-seed (dev only)
  setup     - Run migrations and seed data

Usage: npm run db <command>
        `);
        process.exit(1);
    }

  } catch (error) {
    console.error('❌ Database operation failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}