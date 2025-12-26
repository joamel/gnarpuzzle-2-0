// Jest setup file
import { DatabaseManager } from '../config/database';
import { MigrationManager } from '../config/migrations';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:'; // Use in-memory SQLite for tests

// Initialize test database with migrations
beforeAll(async () => {
  // Run migrations for test database
  const migrationManager = new MigrationManager();
  await migrationManager.runMigrations();
});

// Mock console methods during tests to reduce noise
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  // Suppress non-error console output during tests
  console.log = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
});

// Clean up database connections after tests
afterEach(async () => {
  // Close any open database connections
  try {
    const dbManager = await DatabaseManager.getInstance();
    await dbManager.close();
  } catch (error) {
    // Ignore cleanup errors
  }
});