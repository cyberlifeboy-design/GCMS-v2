import { Router } from 'express';
import { MaintenanceController } from './maintenance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// POST /api/v1/maintenance - Report issue (FocalPoint/Admin)
router.post(
    '/',
    requireRole('FocalPoint', 'Admin'),
    auditLog(),
    MaintenanceController.reportIssue
);

// GET /api/v1/maintenance - List pending tasks (Contractor/Admin/LCC)
router.get(
    '/',
    requireRole('Contractor', 'Admin', 'LCC'),
    auditLog(),
    MaintenanceController.getPendingTasks
);

// PUT /api/v1/maintenance/:id/assign - Assign to contractor (Admin)
router.put(
    '/:id/assign',
    requireRole('Admin'),
    auditLog(),
    MaintenanceController.assignToContractor
);

// PUT /api/v1/maintenance/:id/fix - Contractor report fix
router.put(
    '/:id/fix',
    requireRole('Contractor', 'Admin'),
    auditLog(),
    MaintenanceController.reportFix
);

// GET /api/v1/maintenance/history/:fleetId - History per vehicle
router.get(
    '/history/:fleetId',
    requireRole('Admin', 'LCC', 'FocalPoint'),
    auditLog(),
    MaintenanceController.getHistoryByFleet
);

export default router;
