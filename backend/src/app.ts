import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import helmet from 'helmet';
import authRoutes from './modules/auth/auth.routes';
import fleetRoutes from './modules/fleet/fleet.routes';
import handoverRoutes from './modules/handover/handover.routes';
import maintenanceRoutes from './modules/maintenance/maintenance.routes';
import userRoutes from './modules/users/users.routes';
import reportRoutes from './modules/reports/reports.routes';
import stadiumRoutes from './modules/stadiums/stadiums.routes';
import settingsRoutes from './modules/settings/settings.routes';
import departmentRoutes from './modules/departments/departments.routes';
import requestRoutes from './modules/requests/requests.routes';
import accessRequestRoutes from './modules/access-requests/access-requests.routes';
import invitationRoutes from './modules/invitations/invitations.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import announcementRoutes from './modules/announcements/announcements.routes';
import poolBookingsRoutes from './modules/pool-bookings/pool-bookings.routes';
import poolBookingRequestsRoutes from './modules/pool-booking-requests/pool-booking-requests.routes';
import incidentsRoutes from './modules/incidents/incidents.routes';
import warningsRoutes from './modules/incidents/warnings.routes';
import notificationTemplatesRoutes from './modules/notification-templates/notification-templates.routes';
import documentsRoutes from './modules/documents/documents.routes';
import { auditLog } from './middleware/audit.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { BUCKETS, getFileBuffer, checkStorageConnection } from './config/storage';
import { checkDatabaseConnection } from './config/database';
import * as fs from 'fs';
import * as path from 'path';
import logger from './config/logger';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3005;

// Trust first proxy (Cloudflare/nginx) - required for rate limiter to work behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // the SPA is served from the same origin; CSP tuned in the deployment guide if needed
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // storage proxy serves images to the SPA
}));

// CORS_ORIGIN is a comma-separated list of allowed origins in production; falls back to
// localhost dev origins (+ the current known mehaisi.com deployment) when unset.
const envOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
const allowedOrigins = envOrigins.length
    ? envOrigins
    : [
        'http://localhost:3000',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'https://gcms.mehaisi.com',
        'https://point-dangerous-packs-local.trycloudflare.com',
    ];
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(sanitizeInput); // Sanitize all inputs after body parser
app.use(morgan('dev'));
app.use(apiLimiter);

// Audit logging middleware (applies to all routes)
app.use(auditLog());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'GCMS Backend API',
        version: '1.0.0',
    });
});

app.get('/api/v1/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'GCMS Backend API',
        version: '1.0.0',
    });
});

// Readiness probe (Container Apps): DB + storage connectivity check.
app.get('/api/v1/health/ready', async (req: Request, res: Response) => {
    const [dbOk, storageOk] = await Promise.all([checkDatabaseConnection(), checkStorageConnection()]);
    if (!dbOk || !storageOk) {
        res.status(503).json({
            status: 'degraded',
            db: dbOk ? 'ok' : 'error',
            storage: storageOk ? 'ok' : 'error',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    res.status(200).json({ status: 'ok', db: 'ok', storage: 'ok', timestamp: new Date().toISOString() });
});

// API v1 routes
app.get('/api/v1', (req: Request, res: Response) => {
    res.json({
        message: 'GCMS API v1',
        endpoints: {
            health: '/health',
            auth: '/api/v1/auth',
            fleet: '/api/v1/fleet',
            handover: '/api/v1/handover',
            maintenance: '/api/v1/maintenance',
            users: '/api/v1/users',
            reports: '/api/v1/reports',
            stadiums: '/api/v1/stadiums',
            settings: '/api/v1/settings',
            departments: '/api/v1/departments',
            requests: '/api/v1/requests',
            notifications: '/api/v1/notifications',
            announcements: '/api/v1/announcements',
            publicRequests: '/api/v1/public/requests',
        },
    });
});

// Storage proxy - serve files via the active storage driver (local/MinIO/Azure Blob),
// with local disk fallback baked into getFileBuffer() itself.
const allowedBuckets = new Set(Object.values(BUCKETS));
const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
};
app.get('/api/v1/storage/:bucket/:filename', async (req: Request, res: Response) => {
    const bucket = req.params.bucket as string;
    const filename = req.params.filename as string;
    if (!allowedBuckets.has(bucket)) {
        return res.status(404).json({ error: 'Not found' });
    }
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    try {
        const buffer = await getFileBuffer(bucket, filename);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
    } catch {
        return res.status(404).json({ error: 'File not found' });
    }
});

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/fleet', fleetRoutes);
app.use('/api/v1/handover', handoverRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/stadiums', stadiumRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/notification-templates', notificationTemplatesRoutes);
app.use('/api/v1/departments', departmentRoutes);
// poolBookingRequestsRoutes is mounted before requestRoutes (both bare '/api/v1')
// so its public routes aren't swallowed by requestRoutes' internal
// `router.use(authenticate)` catch-all for paths it doesn't itself match —
// see the comment in pool-booking-requests.routes.ts for details.
app.use('/api/v1', poolBookingRequestsRoutes);
app.use('/api/v1', accessRequestRoutes);
app.use('/api/v1', invitationRoutes);
app.use('/api/v1', requestRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/pool-bookings', poolBookingsRoutes);
app.use('/api/v1/incidents', incidentsRoutes);
app.use('/api/v1/warnings', warningsRoutes);
app.use('/api/v1/documents', documentsRoutes);

// In production, the built frontend ships inside this image; serve it as static
// files with an SPA fallback so client-side routes resolve. Local dev keeps using
// the Vite dev server on :3000 — this block is a no-op unless the directory exists.
if (process.env.NODE_ENV === 'production') {
    const frontendDir = process.env.FRONTEND_DIST_DIR || path.join(__dirname, '../frontend-dist');
    if (fs.existsSync(frontendDir)) {
        app.use(express.static(frontendDir));
        app.get('*', (req: Request, res: Response, next) => {
            if (req.path.startsWith('/api/')) { next(); return; }
            res.sendFile(path.join(frontendDir, 'index.html'));
        });
    }
}

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: any, req: Request, res: Response, next: any) => {
    logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
});

export default app;
