import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRoutes } from '../../routes/admin';
import { UserModel } from '../../models/UserModel';

describe('Admin Routes - POST /api/admin/users/:username/password', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);

  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it('returns 404 when ADMIN_API_KEY is not set', async () => {
    const res = await request(app).post('/api/admin/users/GnarMaster/password').send({ newPassword: 'password123' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when admin key is invalid', async () => {
    process.env.ADMIN_API_KEY = 'secret';

    const res = await request(app)
      .post('/api/admin/users/GnarMaster/password')
      .set('X-Admin-Key', 'wrong')
      .send({ newPassword: 'password123' });

    expect(res.status).toBe(403);
  });

  it('sets password when admin key is valid', async () => {
    process.env.ADMIN_API_KEY = 'secret';

    await UserModel.create('GnarMaster');

    const res = await request(app)
      .post('/api/admin/users/GnarMaster/password')
      .set('X-Admin-Key', 'secret')
      .send({ newPassword: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body?.success).toBe(true);
    expect(res.body?.user?.username).toBe('GnarMaster');
    expect(res.body?.user?.isGuest).toBe(false);

    const updated = await UserModel.findByUsername('GnarMaster');
    expect(updated?.password_hash).toBeTruthy();
  });
});
