import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth';
import { prisma } from '../config/database';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: string;
        stadiumId?: string;
        departmentId?: string;
    };
}

/**
 * Middleware to authenticate JWT token
 */
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.warn(`[AUTH] Missing or invalid Authorization header for path: ${req.path}`);
            res.status(401).json({ error: 'No authentication token provided' });
            return;
        }

        const token = authHeader.substring(7);

        const decoded = jwt.verify(token, authConfig.jwt.accessTokenSecret) as {
            userId: string;
            email: string;
            role: string;
            stadiumId?: string;
            departmentId?: string;
        };

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true, stadiumId: true, departmentId: true, isActive: true },
        });

        if (!user) {
            console.warn(`[AUTH] User not found for ID: ${decoded.userId}`);
            res.status(401).json({ error: 'User not found' });
            return;
        }

        if (!user.isActive) {
            console.warn(`[AUTH] Deactivated user attempted access: ${user.email}`);
            res.status(401).json({ error: 'Account has been deactivated' });
            return;
        }

        req.user = {
            userId: user.id,
            email: user.email,
            role: user.role,
            stadiumId: user.stadiumId || undefined,
            departmentId: user.departmentId || undefined,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            console.warn(`[AUTH] Token expired for path: ${req.path}`);
            res.status(401).json({ error: 'Token expired' });
        } else if (error instanceof jwt.JsonWebTokenError) {
            console.warn(`[AUTH] Invalid JWT for path: ${req.path}`);
            res.status(401).json({ error: 'Invalid token' });
        } else {
            console.error(`[AUTH] unexpected error:`, error);
            res.status(500).json({ error: 'Authentication failed' });
        }
    }
};

/**
 * Optional authentication - don't fail if no token, but attach user if valid token
 */
export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            next();
            return;
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, authConfig.jwt.accessTokenSecret) as {
            userId: string;
            email: string;
            role: string;
            stadiumId?: string;
        };

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true, stadiumId: true, isActive: true },
        });

        if (user && user.isActive) {
            req.user = {
                userId: user.id,
                email: user.email,
                role: user.role,
                stadiumId: user.stadiumId || undefined,
            };
        }

        next();
    } catch (error) {
        next();
    }
};
