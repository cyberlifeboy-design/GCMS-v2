import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authConfig } from '../config/auth';
import { prisma } from '../config/database';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        name?: string;
        phone?: string | null;
        role: string;
        stadiumId?: string;
        departmentId?: string;
        sessionId?: string;
    };
}

class AuthError extends Error {
    constructor(public status: number, message: string, public code?: string) {
        super(message);
    }
}

// Background polls (notification badge, booking popups, live panels) send this header so
// they don't count as user activity — otherwise an unattended open tab would never idle out.
const BACKGROUND_HEADER = 'x-background';

/**
 * Verifies the access token AND its server-side session (VAPT #3/#5): the session must
 * still exist (not logged out, not replaced by a newer sign-in, not revoked by a password
 * change) and be within its idle deadline and absolute lifetime. A non-background request
 * slides the idle deadline forward.
 */
async function resolveUser(token: string, req: Request): Promise<NonNullable<AuthRequest['user']>> {
    const decoded = jwt.verify(token, authConfig.jwt.accessTokenSecret) as { userId: string; sid?: string };

    if (!decoded.sid) throw new AuthError(401, 'Session ended. Please sign in again.', 'SESSION_ENDED');

    const session = await prisma.refreshToken.findUnique({
        where: { id: decoded.sid },
        select: {
            id: true, userId: true, expiresAt: true, createdAt: true,
            user: { select: { id: true, email: true, name: true, phone: true, role: true, stadiumId: true, departmentId: true, isActive: true, isBlocked: true } },
        },
    });

    if (!session || session.userId !== decoded.userId) {
        throw new AuthError(401, 'Your session has ended — this account was signed in elsewhere or signed out.', 'SESSION_ENDED');
    }

    const now = Date.now();
    const { idleMs, maxMs } = authConfig.session;
    const absoluteEnd = session.createdAt.getTime() + maxMs;
    if (session.expiresAt.getTime() <= now || absoluteEnd <= now) {
        await prisma.refreshToken.deleteMany({ where: { id: session.id } });
        throw new AuthError(401, 'Your session expired. Please sign in again.', 'SESSION_EXPIRED');
    }

    const { user } = session;
    if (!user.isActive) throw new AuthError(401, 'Account has been deactivated');
    if (user.isBlocked) throw new AuthError(403, 'Your account has been blocked. Contact the administrator.');

    // Slide the idle deadline; skip the write unless it would move by more than a minute.
    if (req.get(BACKGROUND_HEADER) !== '1') {
        const next = Math.min(now + idleMs, absoluteEnd);
        if (next - session.expiresAt.getTime() > 60_000) {
            await prisma.refreshToken.update({ where: { id: session.id }, data: { expiresAt: new Date(next) } });
        }
    }

    return {
        userId: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        stadiumId: user.stadiumId || undefined,
        departmentId: user.departmentId || undefined,
        sessionId: session.id,
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
        const queryToken = req.query['token'] as string | undefined;

        if (!authHeader?.startsWith('Bearer ') && !queryToken) {
            console.warn(`[AUTH] Missing or invalid Authorization header for path: ${req.path}`);
            res.status(401).json({ error: 'No authentication token provided' });
            return;
        }

        const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : queryToken!;
        req.user = await resolveUser(token, req);
        next();
    } catch (error) {
        if (error instanceof AuthError) {
            console.warn(`[AUTH] ${error.message} (path: ${req.path})`);
            res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
        } else if (error instanceof jwt.TokenExpiredError) {
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
    _res: Response,
    next: NextFunction
): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        try {
            req.user = await resolveUser(authHeader.substring(7), req);
        } catch {
            // invalid/ended session — continue anonymously
        }
    }
    next();
};
