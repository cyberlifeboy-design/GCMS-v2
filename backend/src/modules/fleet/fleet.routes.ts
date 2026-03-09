import { Router } from 'express';
import { FleetController } from './fleet.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// GET /api/v1/fleet — SuperAdmin, Admin, Observer, FA (each sees different scope)
router.get('/', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), FleetController.getAll);

// GET /api/v1/fleet/my-carts — FA gets their assigned carts
router.get('/my-carts', requireRole('FA', 'Admin', 'SuperAdmin'), FleetController.getMyAssignedCarts);

// GET /api/v1/fleet/:id
router.get('/:id', requireRole('SuperAdmin', 'Admin', 'Observer'), FleetController.getById);

// POST /api/v1/fleet — create single cart
router.post('/', requireRole('SuperAdmin', 'Admin'), auditLog(), FleetController.create);

// POST /api/v1/fleet/bulk-import — xlsx import
router.post(
    '/bulk-import',
    requireRole('SuperAdmin', 'Admin'),
    FleetController.uploadMiddleware,
    auditLog(),
    FleetController.bulkImport
);

// PUT /api/v1/fleet/:id — update cart
router.put('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), FleetController.update);

// POST /api/v1/fleet/:id/assign — assign/unassign FA user
router.post('/:id/assign', requireRole('SuperAdmin', 'Admin'), auditLog(), FleetController.assignUser);

// DELETE /api/v1/fleet/:id
router.delete('/:id', requireRole('SuperAdmin', 'Admin'), auditLog(), FleetController.delete);

export default router;
