import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthenticatedRequest } from '../services/AuthService';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = await AuthService.getAuthenticatedUser(authReq);
    
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }
    
    authReq.user = user;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid authentication' });
  }
};