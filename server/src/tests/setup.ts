// Vitest setup file
import { vi } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';