import { Router } from 'express';
import { DepartmentsController } from './departments.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

router.get('/', DepartmentsController.getAll);
router.post('/', requireRole('SuperAdmin', 'Admin'), DepartmentsController.create);
router.post('/bulk', requireRole('SuperAdmin'), DepartmentsController.createBulk);
router.put('/:id', requireRole('SuperAdmin', 'Admin'), DepartmentsController.update);
router.delete('/:id', requireRole('SuperAdmin', 'Admin'), DepartmentsController.delete);

export default router;
