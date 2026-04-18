import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { prisma } from '../config/database';

/**
 * Sensitive fields that should never be stored in audit logs
 */
const SENSITIVE_FIELDS = [
    'password',
    'passwordHash',
    'token',
    'secret',
    'refreshToken',
    'accessToken',
    'currentPassword',
    'newPassword',
    'confirmPassword',
    'apiKey',
    'apiSecret',
    'privateKey',
    'authorization',
];

/**
 * Recursively sanitize an object by removing sensitive fields
 */
const sanitizeBody = (body: any): any => {
    if (!body || typeof body !== 'object') return body;

    // Handle arrays
    if (Array.isArray(body)) {
        return body.map(item => sanitizeBody(item));
    }

    // Handle objects
    const sanitized: any = {};
    for (const key of Object.keys(body)) {
        // Skip sensitive fields entirely
        if (SENSITIVE_FIELDS.some(field => key.toLowerCase() === field.toLowerCase())) {
            continue;
        }
        // Recursively sanitize nested objects
        sanitized[key] = sanitizeBody(body[key]);
    }
    return sanitized;
};

/**
 * Middleware to log all API requests to the audit log
 */
export const auditLog = () => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        // Capture request start time
        const startTime = Date.now();

        // Store original send function
        const originalSend = res.send;

        // Override response send to capture response
        res.send = function (data: any): Response {
            // Restore original send
            res.send = originalSend;

            // Log the audit trail asynchronously (don't block response)
            if (req.user) {
                // Only log authenticated requests
                const action = `${req.method} ${req.path}`;
                const entityType = extractEntityType(req.path);
                const entityId = extractEntityId(req.path);

                // Get IP address
                const ipAddress =
                    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
                    req.socket.remoteAddress ||
                    'unknown';

                // Get user agent
                const userAgent = req.headers['user-agent'] || 'unknown';

                // Create audit log entry (don't await - fire and forget)
                prisma.auditLog
                    .create({
                        data: {
                            userId: req.user.userId,
                            action,
                            entityType: entityType || 'Unknown',
                            entityId: entityId || 'N/A',
                            oldValue: undefined, // For updates, this should be populated before the change
                            newValue: req.method === 'POST' || req.method === 'PUT' ? sanitizeBody(req.body) : undefined,
                            ipAddress,
                            userAgent,
                        },
                    })
                    .catch((error) => {
                        console.error('Failed to create audit log:', error);
                    });
            }

            // Return original response
            return originalSend.call(this, data);
        };

        next();
    };
};

/**
 * Extract entity type from request path
 * e.g., /api/v1/fleet/123 -> "Fleet"
 */
function extractEntityType(path: string): string | null {
    const match = path.match(/\/api\/v\d+\/(\w+)/);
    if (match) {
        // Capitalize first letter
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
    return null;
}

/**
 * Extract entity ID from request path
 * e.g., /api/v1/fleet/123 -> "123"
 */
function extractEntityId(path: string): string | null {
    const match = path.match(/\/api\/v\d+\/\w+\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
}

/**
 * Create audit log entry for updates (captures old value)
 */
export const auditUpdate = (
    entityType: string,
    getEntityId: (req: AuthRequest) => string,
    getOldValue: (req: AuthRequest) => Promise<any>
) => {
    return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
        if (!req.user) {
            next();
            return;
        }

        try {
            const entityId = getEntityId(req);
            const oldValue = await getOldValue(req);

            // Store old value in request for later use
            (req as any).auditOldValue = oldValue;
            (req as any).auditEntityType = entityType;
            (req as any).auditEntityId = entityId;
        } catch (error) {
            console.error('Failed to capture old value for audit:', error);
        }

        next();
    };
};
