import express from 'express';
import crypto from 'crypto';

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

    res.status(200).json({
      success: true,
      message: 'Seed completed'
    });
  } catch (err) {
    res.status(500).json({
      error: 'Seed failed',
      message: err instanceof Error ? err.message : String(err || '')
    });
  }
});
