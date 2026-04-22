import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export type Role = 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';

/**
 * Middleware to check if user has required role(s)
 */
export const requireRole = (...allowedRoles: Role[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!allowedRoles.includes(req.user.role as Role)) {
            res.status(403).json({
                error: 'Insufficient permissions',
                required: allowedRoles,
                current: req.user.role,
            });
            return;
        }

        next();
    };
};

/**
 * Check if user has access to a specific stadium
 * SuperAdmin and Observer have access to all stadiums
 * Admin and FA are scoped to their assigned stadium
 */
export const checkStadiumAccess = (stadiumIdFromRequest: (req: AuthRequest) => string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // SuperAdmin and Observer have access to all stadiums
        if (req.user.role === 'SuperAdmin' || req.user.role === 'Observer') {
            next();
            return;
        }

        const requestedStadiumId = stadiumIdFromRequest(req);

        if (req.user.stadiumId !== requestedStadiumId) {
            res.status(403).json({ error: 'Access denied to this venue' });
            return;
        }

        next();
    };
};

/**
 * Check if user owns a resource or is an admin-level role
 */
export const requireOwnership = (userIdFromRequest: (req: AuthRequest) => string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // SuperAdmin and Admin can access any resource
        if (req.user.role === 'SuperAdmin' || req.user.role === 'Admin') {
            next();
            return;
        }

        const resourceUserId = userIdFromRequest(req);

        if (req.user.userId !== resourceUserId) {
            res.status(403).json({
                error: 'Access denied - you can only access your own resources',
            });
            return;
        }

        next();
    };
};
