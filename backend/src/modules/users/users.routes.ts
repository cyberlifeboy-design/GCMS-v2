import { Router } from 'express';
import { UsersController } from './users.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// List all users — SuperAdmin sees all, Admin sees own venue FA
router.get('/', requireRole('SuperAdmin', 'Admin'), UsersController.getAll);

// Get specific user
router.get('/:id', requireRole('SuperAdmin', 'Admin'), UsersController.getById);

// Create single user
router.post('/', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.create);

// Bulk create
router.post('/bulk', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.bulkCreate);

// Update user
router.put('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.update);

// Activate/deactivate
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.setActive);

// Delete user
router.delete('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.delete);

// User preferences (any authenticated user can update their own preferences)
router.patch('/me/preferences', UsersController.updatePreferences);

export default router;
