import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { IncidentsController } from './incidents.controller';

const router = Router();
router.use(authenticate);

// Any authenticated user can file an incident
router.post('/', IncidentsController.uploadMiddleware, auditLog(), IncidentsController.report);

// Admin / SuperAdmin management
router.get('/', requireRole('SuperAdmin', 'Admin'), IncidentsController.list);
router.get('/:id', requireRole('SuperAdmin', 'Admin'), IncidentsController.getById);
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.updateStatus);
router.get('/:id/pdf', requireRole('SuperAdmin', 'Admin'), IncidentsController.downloadPdf);

export default router;
