import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRoutes } from '../../routes/admin';

vi.mock('../../config/seed', () => ({
  seedDatabase: vi.fn(async () => undefined)
}));

describe('Admin Routes - POST /api/admin/seed', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_API_KEY;
  });

  it('returns 404 when ADMIN_API_KEY is not set', async () => {
    const res = await request(app).post('/api/admin/seed');
    expect(res.status).toBe(404);
  });

  it('returns 403 when admin key is invalid', async () => {
    process.env.ADMIN_API_KEY = 'secret';
    const res = await request(app)
      .post('/api/admin/seed')
      .set('X-Admin-Key', 'wrong');
    expect(res.status).toBe(403);
  });

  it('runs seed when admin key is valid', async () => {
    process.env.ADMIN_API_KEY = 'secret';

    const res = await request(app)
      .post('/api/admin/seed')
      .set('X-Admin-Key', 'secret');

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.message).toBe('Seed completed');

    const { seedDatabase } = await import('../../config/seed');
    expect(vi.mocked(seedDatabase)).toHaveBeenCalledTimes(1);
  });
});
