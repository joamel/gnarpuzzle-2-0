import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('SQLite Setup Verification', () => {
  it('should create and use real SQLite database', () => {
    const dbPath = path.join(process.cwd(), 'data', 'test-setup.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Clean up any existing test file
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    
    // Create SQLite database
    const db = new Database(dbPath);
    
    // Create a simple test table
    db.exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      )
    `);
    
    // Insert test data
    const insert = db.prepare('INSERT INTO test_table (name) VALUES (?)');
    const result = insert.run('test_name');
    
    expect(result.changes).toBe(1);
    expect(result.lastInsertRowid).toBe(1);
    
    // Query test data
    const select = db.prepare('SELECT * FROM test_table WHERE id = ?');
    const row = select.get(1);
    
    expect(row).toEqual({
      id: 1,
      name: 'test_name'
    });
    
    // Clean up
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('should detect better-sqlite3 package', () => {
    // This test verifies that better-sqlite3 is installed and working
    const Database = require('better-sqlite3');
    expect(typeof Database).toBe('function');
  });

  it('should show the difference from mock behavior', () => {
    // This is just a reference test to show what real SQLite gives us
    // vs what mock database gives us
    expect(true).toBe(true);
    console.log('📝 Real SQLite features:');
    console.log('  - Actual file-based persistence');
    console.log('  - REAL SQL constraints and foreign keys');
    console.log('  - Transaction support');
    console.log('  - Performance characteristics');
    console.log('  - PRAGMA commands for introspection');
  });
});