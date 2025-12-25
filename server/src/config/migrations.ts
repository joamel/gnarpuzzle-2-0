import { getDatabase, DatabaseManager } from './database';
import fs from 'fs';
import path from 'path';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down?: string;
}

export class MigrationManager {
  private migrationsPath: string;

  constructor() {
    this.migrationsPath = path.join(__dirname, 'migrations');
  }

  private async ensureMigrationTable(): Promise<void> {
    const db = await getDatabase();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  public async runMigrations(): Promise<void> {
    await this.ensureMigrationTable();
    
    const migrations = this.loadMigrations();
    const executedVersions = await this.getExecutedVersions();

    for (const migration of migrations) {
      if (!executedVersions.includes(migration.version)) {
        console.log(`⬆️  Running migration: ${migration.name}`);
        
        const dbManager = await DatabaseManager.getInstance();
        await dbManager.transaction(async (db) => {
          await db.exec(migration.up);
          
          await db.run(`
            INSERT INTO schema_migrations (version, name) 
            VALUES (?, ?)
          `, migration.version, migration.name);
        });

        console.log(`✅ Migration completed: ${migration.name}`);
      }
    }
  }

  public async rollbackLastMigration(): Promise<void> {
    const lastMigration = await this.getLastExecutedMigration();
    if (!lastMigration) {
      console.log('ℹ️  No migrations to rollback');
      return;
    }

    const migrations = this.loadMigrations();
    const migration = migrations.find(m => m.version === lastMigration.version);
    
    if (!migration || !migration.down) {
      throw new Error(`Cannot rollback migration ${lastMigration.name}: no down migration found`);
    }

    console.log(`⬇️  Rolling back migration: ${migration.name}`);
    
    const dbManager = await DatabaseManager.getInstance();
    await dbManager.transaction(async (db) => {
      await db.exec(migration.down!);
      
      await db.run(`
        DELETE FROM schema_migrations WHERE version = ?
      `, migration.version);
    });

    console.log(`✅ Rollback completed: ${migration.name}`);
  }

  private loadMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsPath)) {
      return [];
    }

    const migrationFiles = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .sort();

    const migrations: Migration[] = [];
    
    for (const file of migrationFiles) {
      const migrationModule = require(path.join(this.migrationsPath, file));
      migrations.push(migrationModule.default || migrationModule.migration || migrationModule);
    }

    return migrations.sort((a, b) => a.version - b.version);
  }

  private async getExecutedVersions(): Promise<number[]> {
    const db = await getDatabase();
    const rows = await db.all('SELECT version FROM schema_migrations ORDER BY version');
    return rows.map((row: any) => row.version);
  }

  private async getLastExecutedMigration(): Promise<{ version: number; name: string } | null> {
    const db = await getDatabase();
    return await db.get(`
      SELECT version, name FROM schema_migrations 
      ORDER BY version DESC 
      LIMIT 1
    `) as { version: number; name: string } | null;
  }

  public async getStatus(): Promise<void> {
    const migrations = this.loadMigrations();
    const executedVersions = await this.getExecutedVersions();

    console.log('\n📋 Migration Status:');
    console.log('==================');
    
    for (const migration of migrations) {
      const status = executedVersions.includes(migration.version) ? '✅' : '⏳';
      console.log(`${status} v${migration.version.toString().padStart(3, '0')} - ${migration.name}`);
    }
    
    console.log(`\n📊 Total: ${migrations.length} migrations, ${executedVersions.length} executed\n`);
  }
}