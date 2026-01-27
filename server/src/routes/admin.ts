import express from 'express';
import crypto from 'crypto';
import { RoomModel } from '../models';

export const adminRoutes = express.Router();

const timingSafeEquals = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

adminRoutes.post('/seed', async (req, res) => {
  const expectedKey = process.env.ADMIN_API_KEY;

  // If not configured, hide the endpoint.
  if (!expectedKey) {
    res.status(404).json({
      error: 'Not found',
      message: 'Route not found'
    });
    return;
  }

  const providedKey = req.get('X-Admin-Key') || '';
  if (!providedKey || !timingSafeEquals(providedKey, expectedKey)) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid admin key'
    });
    return;
  }

  try {
    const { seedDatabase } = await import('../config/seed');
    await seedDatabase();

    // Return a small summary so operators can verify the seed actually
    // created/revived rooms in the same backend the client is using.
    const activeRooms = await RoomModel.getActiveRooms();
    const standardNames = new Set(['Snabbspel 4×4', 'Klassiskt 5×5', 'Utmaning 6×6']);
    const standardRooms = activeRooms
      .filter(r => standardNames.has(String(r.name)))
      .map(r => ({ id: r.id, code: r.code, name: r.name, status: r.status, member_count: r.member_count }));

    res.status(200).json({
      success: true,
      message: 'Seed completed',
      rooms: {
        activeTotal: activeRooms.length,
        standardRooms
      },
      backend: {
        db: process.env.DATABASE_URL ? 'postgres' : 'sqlite'
      }
    });
  } catch (err) {
    res.status(500).json({
      error: 'Seed failed',
      message: err instanceof Error ? err.message : String(err || '')
    });
  }
});
