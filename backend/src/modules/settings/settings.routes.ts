import { Router, Request, Response } from 'express';
import { SettingsController } from './settings.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { prisma } from '../../config/database';

const router = Router();

// GET /api/v1/settings/public — public branding info (no auth required)
router.get('/public', async (_req: Request, res: Response) => {
    try {
        const settings = await prisma.systemSettings.findFirst();
        res.json({
            tournamentName: settings?.tournamentName || 'GCMS',
            logoUrl: settings?.logoUrl || null,
            headerUrl: settings?.headerUrl || null,
            footerUrl: settings?.footerUrl || null,
            footerText: settings?.footerText || null,
        });
    } catch {
        res.json({ tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null });
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

export default router;
