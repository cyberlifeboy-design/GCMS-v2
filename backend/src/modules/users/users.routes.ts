import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// List all users (Admin only)
router.get('/', requireRole('Admin'), auditLog(), UsersController.getAll);

// Get specific user
router.get('/:id', auditLog(), UsersController.getById);

// Update user
router.put('/:id', auditLog(), UsersController.update);

// Bulk create users (Admin only)
router.post('/bulk', requireRole('Admin'), auditLog(), UsersController.bulkCreate);

// Delete user (Admin only)
router.delete('/:id', requireRole('Admin'), auditLog(), UsersController.delete);

export default router;
