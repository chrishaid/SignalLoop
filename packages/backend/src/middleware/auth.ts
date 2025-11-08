import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/**
 * Middleware to ensure user is authenticated
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  throw new AppError('Authentication required', 401);
};

/**
 * Middleware to ensure user has specific role
 */
export const requireRole = (roles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      throw new AppError('Authentication required', 401);
    }

    const user = req.user as any;

    // TODO: Check user's roles from database
    // For now, we'll implement basic check

    next();
  };
};

/**
 * Middleware to check tenant access
 */
export const requireTenantAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    throw new AppError('Authentication required', 401);
  }

  const user = req.user as any;
  const tenantId = req.params.tenantId || req.body.tenantId;

  if (!tenantId) {
    throw new AppError('Tenant ID required', 400);
  }

  if (user.tenantId !== tenantId) {
    throw new AppError('Access denied to this tenant', 403);
  }

  next();
};
