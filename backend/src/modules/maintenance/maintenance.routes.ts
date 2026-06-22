import { Router } from 'express';
import { MaintenanceController } from './maintenance.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/maintenance
router.get('/', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam', 'FA'), MaintenanceController.getAll);

// GET /api/v1/maintenance/export
router.get('/export', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.exportCsv);

// GET /api/v1/maintenance/fleet/:fleetId
router.get('/fleet/:fleetId', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), MaintenanceController.getByFleet);

// GET /api/v1/maintenance/:id
router.get('/:id', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam', 'FA'), MaintenanceController.getById);

// GET /api/v1/maintenance/:id/pdf — full printable report
router.get('/:id/pdf', requireRole('SuperAdmin', 'Admin', 'Contracts', 'Observer'), MaintenanceController.getPdfReport);

// POST /api/v1/maintenance — report issue
router.post('/', requireRole('SuperAdmin', 'Admin', 'FA'), MaintenanceController.uploadMiddleware, auditLog(), MaintenanceController.reportIssue);

// POST /api/v1/maintenance/:id/escalate — Admin escalates to Contracts
router.post('/:id/escalate', requireRole('SuperAdmin', 'Admin'), auditLog(), MaintenanceController.escalateToContracts);

// Quotation workflow
router.post('/:id/request-quotation', requireRole('Contracts', 'SuperAdmin'), auditLog(), MaintenanceController.requestQuotation);
router.post('/:id/submit-cost', requireRole('MaintenanceTeam', 'SuperAdmin'), auditLog(), MaintenanceController.submitCost);
router.post('/:id/approve-cost', requireRole('Contracts', 'SuperAdmin'), auditLog(), MaintenanceController.approveCost);
router.post('/:id/reject-quotation', requireRole('Contracts', 'SuperAdmin'), auditLog(), MaintenanceController.rejectQuotation);

// PATCH /api/v1/maintenance/:id/status
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin', 'MaintenanceTeam'), auditLog(), MaintenanceController.updateStatus);

export default router;
