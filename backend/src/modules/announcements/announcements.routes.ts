import { Router } from 'express';
import { announcementController } from './announcements.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// All announcement routes require authentication
router.use(authenticate);

// GET /api/v1/announcements/active — get active announcements for current user
router.get('/active', announcementController.getActiveForUser.bind(announcementController));

// GET /api/v1/announcements — list all announcements (Admin+)
router.get('/', requireRole('Admin'), announcementController.getAll.bind(announcementController));

// GET /api/v1/announcements/:id — get announcement by ID (Admin+)
router.get('/:id', requireRole('Admin'), announcementController.getById.bind(announcementController));

// POST /api/v1/announcements — create announcement (Admin+)
router.post('/', requireRole('Admin'), announcementController.create.bind(announcementController));

// PUT /api/v1/announcements/:id — update announcement (Admin+)
router.put('/:id', requireRole('Admin'), announcementController.update.bind(announcementController));

// POST /api/v1/announcements/:id/send — send scheduled announcement now (Admin+)
router.post('/:id/send', requireRole('Admin'), announcementController.sendNow.bind(announcementController));

// POST /api/v1/announcements/:id/deactivate — deactivate announcement (Admin+)
router.post('/:id/deactivate', requireRole('Admin'), announcementController.deactivate.bind(announcementController));

// DELETE /api/v1/announcements/:id — delete announcement (SuperAdmin only)
router.delete('/:id', requireRole('SuperAdmin'), announcementController.delete.bind(announcementController));

export default router;