import { DatabaseInterface } from './sqlite';
import { dbLogger } from '../utils/logger';

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
  private db: DatabaseInterface;
  private migrations: SimpleMigration[] = [];

  constructor(db: DatabaseInterface) {
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

        if (!appliedMigrations.includes(migration.version)) {
          dbLogger.info('Running migration', { migrationId, name: migration.name });
          try {
            // Execute the up migration SQL
            // Split by semicolon and execute each statement separately
            // This allows partial success for migrations with multiple statements
            const statements = migration.up.split(';').map(s => s.trim()).filter(s => s.length > 0);
            for (const statement of statements) {
              try {
                await this.db.exec(statement + ';');
              } catch (stmtError: any) {
                // Ignore "table already exists", "index already exists", "duplicate column" errors
                const errorMsg = stmtError.message || '';
                if (errorMsg.includes('already exists') || errorMsg.includes('duplicate column')) {
                  dbLogger.debug('Skipping statement (already exists/duplicate column)', {
                    migrationId,
                    statementPreview: `${statement.substring(0, 50)}...`
                  });
                } else {
                  throw stmtError;
                }
              }
            }
            await this.recordMigration(migration.version, migration.name);
            dbLogger.info('Migration completed', { migrationId });
          } catch (error) {
            dbLogger.error('Migration failed', {
              migrationId,
              error: error instanceof Error ? error.message : String(error)
            });
            throw error;
          }
        } else {
          dbLogger.debug('Migration already applied', { migrationId });
        }
      }

      dbLogger.info('All migrations completed successfully');
    } catch (error) {
      dbLogger.error('Migration process failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Ensure migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    try {
      // Use schema_migrations for portability across SQLite/Postgres.
      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } catch (error) {
      dbLogger.error('Failed to create migrations table', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get list of applied migrations
   */
  private async getAppliedMigrations(): Promise<number[]> {
    try {
      const result = await this.db.all(
        'SELECT version FROM schema_migrations ORDER BY version'
      );
      return result.map((row: any) => Number(row.version)).filter((v: number) => Number.isFinite(v));
    } catch (error) {
      // Backward compatibility: older DBs may have used `migrations(migration_name, applied_at)`.
      try {
        const legacy = await this.db.all(
          'SELECT migration_name FROM migrations ORDER BY applied_at'
        );
        return legacy
          .map((row: any) => Number.parseInt(String(row.migration_name), 10))
          .filter((v: number) => Number.isFinite(v));
      } catch (legacyError) {
        dbLogger.error('Failed to get applied migrations', {
          error: error instanceof Error ? error.message : String(error),
          legacyError: legacyError instanceof Error ? legacyError.message : String(legacyError)
        });
        return [];
      }
    }
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(version: number, name: string): Promise<void> {
    try {
      await this.db.run(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        version,
        name
      );
    } catch (error) {
      dbLogger.error('Failed to record migration', {
        version,
        name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
