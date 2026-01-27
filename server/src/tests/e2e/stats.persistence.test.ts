import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// IMPORTANT: routes/rooms and routes/stats import getSocketService from ../index.
// Importing the real index.ts would start the HTTP server in tests.
// Mock it so routes can be mounted without booting a listener.
import { vi } from 'vitest';
vi.mock('../../index', () => ({
  getSocketService: vi.fn(() => null)
}));

import { DatabaseManager } from '../../config/database';
import { authRoutes } from '../../routes/auth';
import { roomRoutes } from '../../routes/rooms';
import statsRoutes from '../../routes/stats';

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/stats', statsRoutes);
  return app;
};

describe('E2E - stats persist after leaving empty room', () => {
  beforeAll(async () => {
    // Ensure DB is initialized + migrations are applied.
    await DatabaseManager.getInstance();
  });

  it('keeps finished game history (stats) after last member leaves room', async () => {
    const app = createApp();

    const password = 'Password123!';
    const user1Name = `e2e_user1_${Math.random().toString(36).slice(2, 8)}`;
    const user2Name = `e2e_user2_${Math.random().toString(36).slice(2, 8)}`;

    const r1 = await request(app).post('/api/auth/register').send({ username: user1Name, password });
    expect(r1.status).toBe(200);
    const token1 = r1.body.token as string;
    const user1Id = r1.body.user.id as number;

    const r2 = await request(app).post('/api/auth/register').send({ username: user2Name, password });
    expect(r2.status).toBe(200);
    const token2 = r2.body.token as string;
    const user2Id = r2.body.user.id as number;

    const createRoom = await request(app)
      .post('/api/rooms')
      .set('Authorization', `Bearer ${token1}`)
      .send({ name: 'E2E Room', max_players: 2, board_size: 4 });

    expect(createRoom.status).toBe(201);
    const roomCode = createRoom.body.room.code as string;
    const roomId = createRoom.body.room.id as number;

    const joinRoom = await request(app)
      .post(`/api/rooms/${roomCode}/join`)
      .set('Authorization', `Bearer ${token2}`)
      .send({});
    expect(joinRoom.status).toBe(200);

    // Insert a finished game into DB for this room so stats has history.
    const dbManager = await DatabaseManager.getInstance();
    const db = dbManager.getDatabase();

    const gameRes = await db.run(
      `INSERT INTO games (room_id, state, current_phase, finished_at)
       VALUES (?, 'finished', 'finished', CURRENT_TIMESTAMP)`,
      roomId
    );
    const gameId = gameRes.lastInsertRowid as number;

    await db.run(
      `INSERT INTO players (game_id, user_id, position, score, final_score, words_found)
       VALUES (?, ?, 0, 12, 12, '[{"word":"TEST","points":1}]')`,
      gameId,
      user1Id
    );

    await db.run(
      `INSERT INTO players (game_id, user_id, position, score, final_score, words_found)
       VALUES (?, ?, 1, 9, 9, '[]')`,
      gameId,
      user2Id
    );

    const statsBefore = await request(app)
      .get('/api/stats/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(statsBefore.status).toBe(200);
    expect(statsBefore.body.stats.gamesPlayed).toBeGreaterThanOrEqual(1);

    // Leave with both users so the room becomes empty -> RoomModel.removeMember cleanup triggers.
    const leave1 = await request(app)
      .delete(`/api/rooms/${roomCode}/leave`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ intentional: true });
    expect(leave1.status).toBe(200);

    const leave2 = await request(app)
      .delete(`/api/rooms/${roomCode}/leave`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ intentional: true });
    expect(leave2.status).toBe(200);

    const statsAfter = await request(app)
      .get('/api/stats/me')
      .set('Authorization', `Bearer ${token1}`);
    expect(statsAfter.status).toBe(200);
    expect(statsAfter.body.stats.gamesPlayed).toBe(statsBefore.body.stats.gamesPlayed);

    // Also verify it survives a fresh login token.
    await request(app)
      .delete('/api/auth/logout')
      .set('Authorization', `Bearer ${token1}`)
      .send({});

    const loginAgain = await request(app).post('/api/auth/login').send({ username: user1Name, password });
    expect(loginAgain.status).toBe(200);

    const statsAfterRelogin = await request(app)
      .get('/api/stats/me')
      .set('Authorization', `Bearer ${loginAgain.body.token}`);

    expect(statsAfterRelogin.status).toBe(200);
    expect(statsAfterRelogin.body.stats.gamesPlayed).toBe(statsBefore.body.stats.gamesPlayed);
  });
});
