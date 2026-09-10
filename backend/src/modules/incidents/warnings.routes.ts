import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { WarningsController } from './warnings.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('SuperAdmin', 'Admin'), WarningsController.list);
router.post('/', requireRole('SuperAdmin', 'Admin'), auditLog(), WarningsController.issueStandalone);
router.patch('/:id/revoke', requireRole('SuperAdmin'), auditLog(), WarningsController.revoke);

export default router;
