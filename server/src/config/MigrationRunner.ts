import { SQLiteDatabase } from './sqlite';

export interface SimpleMigration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

/**
 * Runs database migrations in order
 * Keeps track of which migrations have been applied
 */
export class MigrationRunner {
  private db: SQLiteDatabase;
  private migrations: SimpleMigration[] = [];

  constructor(db: SQLiteDatabase) {
    this.db = db;
  }

  /**
   * Register a migration
   */
  registerMigration(migration: SimpleMigration): void {
    this.migrations.push(migration);
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<void> {
    try {
      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Get list of applied migrations
      const appliedMigrations = await this.getAppliedMigrations();

      // Run pending migrations
      for (const migration of this.migrations) {
        const migrationId = String(migration.version).padStart(3, '0');
        
        if (!appliedMigrations.includes(migrationId)) {
          console.log(`🔄 Running migration ${migrationId} (${migration.name})...`);
          try {
            // Execute the up migration SQL
            await this.db.exec(migration.up);
            await this.recordMigration(migrationId);
            console.log(`✅ Migration ${migrationId} completed`);
          } catch (error) {
            console.error(`❌ Migration ${migrationId} failed:`, error);
            throw error;
          }
        } else {
          console.log(`⏭️  Migration ${migrationId} already applied`);
        }
      }

      console.log('✅ All migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration process failed:', error);
      throw error;
    }
  }

  /**
   * Ensure migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    try {
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          migration_name TEXT UNIQUE NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      console.error('Failed to create migrations table:', error);
      throw error;
    }
  }

  /**
   * Get list of applied migrations
   */
  private async getAppliedMigrations(): Promise<string[]> {
    try {
      const result = await this.db.all(
        'SELECT migration_name FROM migrations ORDER BY applied_at'
      );
      return result.map((row: any) => row.migration_name);
    } catch (error) {
      console.error('Failed to get applied migrations:', error);
      return [];
    }
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(migrationName: string): Promise<void> {
    try {
      await this.db.run(
        'INSERT INTO migrations (migration_name) VALUES (?)',
        migrationName
      );
    } catch (error) {
      console.error(`Failed to record migration ${migrationName}:`, error);
      throw error;
    }
  }
}
