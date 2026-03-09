import { Router } from 'express';
import { MaintenanceController } from './maintenance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/maintenance — SuperAdmin/Admin/Observer can view
router.get('/', requireRole('SuperAdmin', 'Admin', 'Observer'), MaintenanceController.getAll);

// GET /api/v1/maintenance/export — CSV export
router.get('/export', requireRole('SuperAdmin', 'Admin', 'Observer'), MaintenanceController.exportCsv);

// GET /api/v1/maintenance/fleet/:fleetId — history per cart
router.get('/fleet/:fleetId', requireRole('SuperAdmin', 'Admin', 'Observer'), MaintenanceController.getByFleet);

// POST /api/v1/maintenance — report issue with optional photo upload
router.post(
    '/',
    requireRole('SuperAdmin', 'Admin', 'FA'),
    MaintenanceController.uploadMiddleware,
    auditLog(),
    MaintenanceController.reportIssue
);

// PATCH /api/v1/maintenance/:id/status — update status (Open→InProgress→Resolved)
router.patch(
    '/:id/status',
    requireRole('SuperAdmin', 'Admin'),
    auditLog(),
    MaintenanceController.updateStatus
);

export default router;
