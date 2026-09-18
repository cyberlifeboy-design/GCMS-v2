import { Router, Request, Response } from 'express';
import { SettingsController } from './settings.controller';
import { settingsService } from './settings.service';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/database';

const router = Router();

// GET /api/v1/settings/public — public branding info (no auth required)
router.get('/public', async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.systemSettings.findFirst();
        const requestWindow = await settingsService.getRequestWindowState();
        const bookingWindow = await settingsService.getBookingWindowState();
        res.json({
            tournamentName: settings?.tournamentName || 'GCMS',
            logoUrl: settings?.logoUrl || null,
            headerUrl: settings?.headerUrl || null,
            footerUrl: settings?.footerUrl || null,
            footerText: settings?.footerText || null,
            handoverTcEnTitle: settings?.handoverTcEnTitle || null,
            handoverTcEnBody: settings?.handoverTcEnBody || null,
            handoverTcArTitle: settings?.handoverTcArTitle || null,
            handoverTcArBody: settings?.handoverTcArBody || null,
            handoverTcCheckboxes: settings?.handoverTcCheckboxes || null,
            enableCarRequests: settings?.enableCarRequests ?? true,
            requestWindow,
            enableBookings: settings?.enableBookings ?? true,
            bookingWindow,
        });
    } catch {
        // A settings read failure must never block submissions — default to open.
        res.json({
            tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null,
            enableCarRequests: true,
            requestWindow: { isOpen: true, opensAt: null, closesAt: null, message: null },
            enableBookings: true,
            bookingWindow: { isOpen: true, opensAt: null, closesAt: null, message: null },
        });
    }
});

router.use(authenticate);

// GET /api/v1/settings — public read for branding (all authenticated users)
router.get('/', SettingsController.get);

// PUT /api/v1/settings — SuperAdmin only, supports file uploads
router.put(
    '/',
    requireRole('SuperAdmin'),
    SettingsController.uploadMiddleware,
    SettingsController.update
);

// POST /api/v1/settings/request-window/announce — SuperAdmin only
router.post('/request-window/announce', requireRole('SuperAdmin'), SettingsController.announceWindow);

// POST /api/v1/settings/smtp/test — SuperAdmin only
router.post('/smtp/test', requireRole('SuperAdmin'), SettingsController.testSmtp);

export default router;
