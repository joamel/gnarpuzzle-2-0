// Vitest setup file

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';

// Ensure tests never hit the real dev database on disk.
// Use a unique temporary DB file per test worker.
const workerId = process.env.VITEST_WORKER_ID || process.env.VITEST_POOL_ID || '0';
const dbFile = path.join(os.tmpdir(), `gnarpuzzle-test-${process.pid}-${workerId}.db`);

try {
	if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
} catch {
	// Best-effort cleanup; continue even if deletion fails.
}

process.env.DATABASE_PATH = dbFile;
process.env.DB_PATH = dbFile;