import express from 'express';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { DatabaseManager } from './config/database';
import { SocketService } from './services/SocketService';
import { RoomCleanupService } from './services/RoomCleanupService';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Mobile-optimized CORS - accepts localhost (dev) and configured frontend domains (prod)
const corsOptions = {
  origin: process.env.NODE_ENV === 'development' 
    ? true 
    : (process.env.CORS_ORIGIN || 'http://localhost:5173'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Mobile-optimized rate limiting - disabled in development
const limiter = process.env.NODE_ENV === 'production' ? rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 // 15 minutes
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
}) : (_req: any, _res: any, next: any) => next(); // No rate limiting in development

// Socket.IO Setup with mobile optimization
const io = new Server(server, {
  cors: corsOptions,
  transports: ['websocket', 'polling'], // Fallback for mobile networks
});

// Middleware
app.use(cors(corsOptions));
app.use(compression()); // Compress responses for better mobile performance
app.use(express.json({ limit: '1mb' })); // Mobile-friendly payload limit
app.use(express.urlencoded({ extended: true }));
app.use(limiter);

// Request logging middleware
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint also available under /api
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '2.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
import { authRoutes } from './routes/auth';
import { roomRoutes } from './routes/rooms';
import { gameRoutes } from './routes/games';

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Socket.IO connection handling
// Socket.IO connection handling - now delegated to SocketService
let socketService: SocketService;
let roomCleanupService: RoomCleanupService | undefined;

io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
});

// Database connection and server startup
async function startServer() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await DatabaseManager.getInstance();
    logger.info('Database connected successfully');

    // Seed database with initial data
    const { seedDatabase } = await import('./config/seed');
    await seedDatabase();

    // Initialize Socket.IO service
    socketService = new SocketService(io);
    logger.info('Socket.IO service initialized');

    // Development mode: Reset game state on startup
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Development mode: Resetting playing rooms to waiting...');
      try {
        const dbManager = await DatabaseManager.getInstance();
        const db = dbManager.getDatabase();
        
        // Delete all active games and players (this clears ongoing game state)
        await db.run('DELETE FROM players');
        await db.run('DELETE FROM games');
        
        // Reset rooms that are currently playing back to waiting
        const resetResult = await db.run(`UPDATE rooms SET status = 'waiting' WHERE status = 'playing'`);
        
        console.log('✅ Reset all playing rooms to waiting status');
        console.log(`✅ Reset ${resetResult.changes} playing rooms to waiting status`);
        
        // Optionally clear all rooms completely (uncomment for full reset)
        if (process.env.RESET_ALL_ROOMS === 'true') {
          await db.run('DELETE FROM room_members');
          await db.run('DELETE FROM rooms');
          console.log('✅ Cleared all rooms and room members (RESET_ALL_ROOMS=true)');
        }
      } catch (error) {
        console.error('❌ Failed to reset game state:', error);
      }
    }

    // Initialize and start room cleanup service with smart empty room deletion
    roomCleanupService = new RoomCleanupService();
    roomCleanupService.start();
    logger.info('Room cleanup service started with empty room deletion enabled');

    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 GnarPuzzle server running on port ${PORT}`);
      logger.info(`🌐 CORS enabled for: ${corsOptions.origin}`);
      logger.info(`📱 Mobile optimizations enabled`);
      logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully');
  
  server.close(async () => {
    try {
      // Stop room cleanup service
      if (roomCleanupService && roomCleanupService.stop) {
        roomCleanupService.stop();
        logger.info('Room cleanup service stopped');
      }

      const dbManager = await DatabaseManager.getInstance();
      await dbManager.close();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully');
  
  server.close(async () => {
    try {
      // Stop room cleanup service
      if (roomCleanupService && roomCleanupService.stop) {
        roomCleanupService.stop();
        logger.info('Room cleanup service stopped');
      }

      const dbManager = await DatabaseManager.getInstance();
      await dbManager.close();
      logger.info('Database connection closed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

// Start the server
startServer();

export { app, io };
export function getSocketService(): SocketService | null {
  return socketService || null;
}
export function getRoomCleanupService(): RoomCleanupService | null {
  return roomCleanupService || null;
}