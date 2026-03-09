import { Router } from 'express';
import { SettingsController } from './settings.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

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
