import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  AuthService.authenticateToken(req, res, next);
};