import express from 'express';
import { getSocketService } from '../index';

const router = express.Router();

/**
 * GET /api/stats/online
 * Get current online users count
 */
router.get('/online', (req, res) => {
  try {
    const socketService = getSocketService();
    
    if (!socketService) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Socket service not available'
      });
      return;
    }

    // Get connected users from socket service
    const connectedUsers = (socketService as any).connectedUsers || new Map();
    const onlineCount = connectedUsers.size;
    
    // Get authenticated users count (users with userId)
    const authenticatedUsers = Array.from(connectedUsers.values())
      .filter((userData: any) => userData.userId)
      .length;

    res.status(200).json({
      success: true,
      online: {
        total: onlineCount,
        authenticated: authenticatedUsers,
        anonymous: onlineCount - authenticatedUsers
      }
    });

  } catch (error) {
    console.error('Error getting online stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get online statistics'
    });
  }
});

/**
 * GET /api/stats/summary
 * Get general game statistics
 */
router.get('/summary', async (req, res) => {
  try {
    const socketService = getSocketService();
    
    if (!socketService) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'Socket service not available'
      });
      return;
    }

    // Get connected users
    const connectedUsers = (socketService as any).connectedUsers || new Map();
    const onlineCount = connectedUsers.size;
    const authenticatedUsers = Array.from(connectedUsers.values())
      .filter((userData: any) => userData.userId)
      .length;

    // Get room statistics
    const roomStats = (socketService as any).roomPlayerReadyStatus || new Map();
    const activeRooms = roomStats.size;

    res.status(200).json({
      success: true,
      stats: {
        online: {
          total: onlineCount,
          authenticated: authenticatedUsers,
          anonymous: onlineCount - authenticatedUsers
        },
        rooms: {
          active: activeRooms
        }
      }
    });

  } catch (error) {
    console.error('Error getting game stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get game statistics'
    });
  }
});

export default router;