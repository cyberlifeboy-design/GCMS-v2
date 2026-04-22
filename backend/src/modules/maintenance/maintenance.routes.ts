import { Router } from 'express';
import { MaintenanceController } from './maintenance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/maintenance — SuperAdmin/Admin/Observer/Contracts/MaintenanceTeam can view
router.get('/', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.getAll);

// GET /api/v1/maintenance/export — CSV export
router.get('/export', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.exportCsv);

// GET /api/v1/maintenance/fleet/:fleetId — history per cart
router.get('/fleet/:fleetId', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.getByFleet);

// GET /api/v1/maintenance/:id — get single log
router.get('/:id', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.getById);

// POST /api/v1/maintenance — report issue with optional photo upload
router.post(
    '/',
    requireRole('SuperAdmin', 'Admin', 'FA'),
    MaintenanceController.uploadMiddleware,
    auditLog(),
    MaintenanceController.reportIssue
);

// Quotation workflow
router.post('/:id/request-quotation', requireRole('Contracts', 'SuperAdmin'), auditLog(), MaintenanceController.requestQuotation);
router.post('/:id/submit-cost', requireRole('MaintenanceTeam', 'SuperAdmin'), auditLog(), MaintenanceController.submitCost);
router.post('/:id/approve-cost', requireRole('Contracts', 'SuperAdmin'), auditLog(), MaintenanceController.approveCost);

// PATCH /api/v1/maintenance/:id/status — update status (Open→InProgress→Resolved)
router.patch(
    '/:id/status',
    requireRole('SuperAdmin', 'Admin', 'MaintenanceTeam'),
    auditLog(),
    MaintenanceController.updateStatus
);

export default router;
