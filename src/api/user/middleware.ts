import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

export interface UserPayload {
  id: number;
  email: string;
  role: 'user';
}

export interface AuthenticatedRequest extends Request {
  user: UserPayload;
}

export function userAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as UserPayload;
    if (payload.role !== 'user') {
      res.status(403).json({ error: 'Invalid token type' });
      return;
    }
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function signUserToken(payload: Omit<UserPayload, 'role'>): string {
  return jwt.sign({ ...payload, role: 'user' }, config.JWT_SECRET, { expiresIn: '7d' });
}
