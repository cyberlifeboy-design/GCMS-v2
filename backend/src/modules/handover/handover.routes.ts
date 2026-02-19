import { Router } from 'express';
import { HandoverController } from './handover.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// POST /api/v1/handover/checkout - Check out a car
router.post(
    '/checkout',
    requireRole('FocalPoint', 'Admin'),
    auditLog(),
    HandoverController.checkOut
);

// POST /api/v1/handover/checkin - Check in a car
router.post(
    '/checkin',
    requireRole('FocalPoint', 'Admin'),
    auditLog(),
    HandoverController.checkIn
);

// GET /api/v1/handover/my-history - Current user's history
router.get(
    '/my-history',
    requireRole('FocalPoint', 'Admin'),
    auditLog(),
    HandoverController.getMyHistory
);

// GET /api/v1/handover/history - Full history (Admin/LCC, or FocalPoint filtered)
router.get(
    '/history',
    requireRole('Admin', 'LCC', 'FocalPoint'),
    auditLog(),
    HandoverController.getAllHistory
);

export default router;
