import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { IncidentsController } from './incidents.controller';
import { WarningsController } from './warnings.controller';

const router = Router();
router.use(authenticate);

// Any authenticated user can file an incident
router.post('/', IncidentsController.uploadMiddleware, auditLog(), IncidentsController.report);

// Admin / SuperAdmin management
router.get('/', requireRole('SuperAdmin', 'Admin'), IncidentsController.list);
router.get('/:id', requireRole('SuperAdmin', 'Admin'), IncidentsController.getById);
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.updateStatus);
router.patch('/:id/form', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.saveForm);
router.post('/:id/form/sign', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.signForm);
router.post('/:id/escalate', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.escalate);
router.get('/:id/pdf', requireRole('SuperAdmin', 'Admin'), IncidentsController.downloadPdf);

// Issue a warning linked to this incident
router.post('/:id/warnings', requireRole('SuperAdmin', 'Admin'), auditLog(), WarningsController.issueForIncident);

export default router;
