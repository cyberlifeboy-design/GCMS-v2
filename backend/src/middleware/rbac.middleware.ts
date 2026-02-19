import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

type Role = 'Admin' | 'LCC' | 'FocalPoint' | 'Contractor';

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
 */
export const checkStadiumAccess = (stadiumIdFromRequest: (req: AuthRequest) => string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // Admin and LCC have access to all stadiums
        if (req.user.role === 'Admin' || req.user.role === 'LCC') {
            next();
            return;
        }

        const requestedStadiumId = stadiumIdFromRequest(req);

        // Check if user has access to this stadium
        if (req.user.stadiumId !== requestedStadiumId) {
            res.status(403).json({
                error: 'Access denied to this stadium',
            });
            return;
        }

        next();
    };
};

/**
 * Check if FocalPoint user has access to specific FA (Functional Area)
 */
export const checkFAAccess = (faTrigramFromRequest: (req: AuthRequest) => string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // Admin and LCC have access to all FAs
        if (req.user.role === 'Admin' || req.user.role === 'LCC') {
            next();
            return;
        }

        // FocalPoint can only access their assigned FA
        if (req.user.role === 'FocalPoint') {
            const requestedFA = faTrigramFromRequest(req);
            if (req.user.faTrigram !== requestedFA) {
                res.status(403).json({
                    error: 'Access denied to this functional area',
                    userFA: req.user.faTrigram,
                    requestedFA,
                });
                return;
            }
        }

        next();
    };
};

/**
 * Check if user owns a resource or is an admin
 */
export const requireOwnership = (userIdFromRequest: (req: AuthRequest) => string) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // Admins can access any resource
        if (req.user.role === 'Admin') {
            next();
            return;
        }

        const resourceUserId = userIdFromRequest(req);

        // Check if user owns this resource
        if (req.user.userId !== resourceUserId) {
            res.status(403).json({
                error: 'Access denied - you can only access your own resources',
            });
            return;
        }

        next();
    };
};
