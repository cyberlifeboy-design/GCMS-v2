import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
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
import notificationRoutes from './modules/notifications/notification.routes';
import announcementRoutes from './modules/announcements/announcements.routes';
import { auditLog } from './middleware/audit.middleware';
import { sanitizeInput } from './middleware/sanitize.middleware';
import logger from './config/logger';

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3005;

// Trust first proxy (Cloudflare/nginx) - required for rate limiter to work behind reverse proxy
app.set('trust proxy', 1);

// Middleware
app.use(cors({ origin: [process.env.CORS_ORIGIN || 'http://localhost:3000', 'https://gcms.mehaisi.com'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput); // Sanitize all inputs after body parser
app.use(morgan('dev'));

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

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/fleet', fleetRoutes);
app.use('/api/v1/handover', handoverRoutes);
app.use('/api/v1/maintenance', maintenanceRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/stadiums', stadiumRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1', requestRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/announcements', announcementRoutes);

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
