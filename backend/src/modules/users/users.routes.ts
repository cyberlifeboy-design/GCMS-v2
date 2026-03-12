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

// Import users from car requests (FA Focal Point users)
router.post('/import-requests', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.importFromRequests);

// Update user
router.put('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.update);

// Activate/deactivate
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.setActive);

// Block/unblock
router.patch('/:id/blocked', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.setBlocked);

// Delete user
router.delete('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), UsersController.delete);

// User preferences (any authenticated user can update their own preferences)
router.patch('/me/preferences', UsersController.updatePreferences);

export default router;
