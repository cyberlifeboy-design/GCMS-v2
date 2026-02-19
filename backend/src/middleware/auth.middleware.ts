import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth';
import { prisma } from '../config/database';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: string;
        faTrigram?: string;
        stadiumId?: string;
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
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No authentication token provided' });
            return;
        }

        const token = authHeader.substring(7); // Remove "Bearer " prefix

        // Verify token
        const decoded = jwt.verify(token, authConfig.jwt.accessTokenSecret) as {
            userId: string;
            email: string;
            role: string;
            faTrigram?: string;
            stadiumId?: string;
        };

        // Verify user still exists
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true, faTrigram: true, stadiumId: true },
        });

        if (!user) {
            res.status(401).json({ error: 'User not found' });
            return;
        }

        // Attach user to request
        req.user = {
            userId: user.id,
            email: user.email,
            role: user.role,
            faTrigram: user.faTrigram || undefined,
            stadiumId: user.stadiumId || undefined,
        };

        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ error: 'Token expired' });
        } else if (error instanceof jwt.JsonWebTokenError) {
            res.status(401).json({ error: 'Invalid token' });
        } else {
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
            faTrigram?: string;
            stadiumId?: string;
        };

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { id: true, email: true, role: true, faTrigram: true, stadiumId: true },
        });

        if (user) {
            req.user = {
                userId: user.id,
                email: user.email,
                role: user.role,
                faTrigram: user.faTrigram || undefined,
                stadiumId: user.stadiumId || undefined,
            };
        }

        next();
    } catch (error) {
        // Silently continue without user
        next();
    }
};
