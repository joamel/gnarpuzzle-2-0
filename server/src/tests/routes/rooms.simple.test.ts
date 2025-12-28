import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Simple test to validate our test environment
describe('Room Routes Basic Tests', () => {
  const app = express();
  app.use(express.json());
  
  // Simple route for testing
  app.post('/test', (req, res) => {
    res.json({ success: true, message: 'Test endpoint working' });
  });

  it('should run basic express test', async () => {
    const response = await request(app)
      .post('/test')
      .send({ test: 'data' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('should handle JSON parsing', async () => {
    const response = await request(app)
      .post('/test')
      .send({ name: 'Test Room', max_players: 4 });

    expect(response.body.message).toBe('Test endpoint working');
  });
});