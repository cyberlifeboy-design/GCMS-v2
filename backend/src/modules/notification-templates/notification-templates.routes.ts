import { Router } from 'express';
import { NotificationTemplatesController } from './notification-templates.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authenticate, requireRole('SuperAdmin'));

router.get('/', NotificationTemplatesController.list);
router.put('/:key', NotificationTemplatesController.update);
router.post('/:key/reset', NotificationTemplatesController.reset);

export default router;
