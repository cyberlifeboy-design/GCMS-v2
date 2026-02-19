import { Router } from 'express';
import { FleetController } from './fleet.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

// All fleet routes require authentication
router.use(authenticate);

// GET /api/v1/fleet - List all (Admin/LCC only)
router.get(
    '/',
    requireRole('Admin', 'LCC', 'FocalPoint'), // FocalPoint can list but will be filtered by controller
    auditLog(),
    FleetController.getAll
);

// GET /api/v1/fleet/available - Available cars for the current FocalPoint FA
router.get(
    '/available',
    requireRole('FocalPoint', 'Admin'),
    auditLog(),
    FleetController.getAvailable
);

// GET /api/v1/fleet/:id - Get specific car
router.get(
    '/:id',
    requireRole('Admin', 'LCC', 'FocalPoint'),
    auditLog(),
    FleetController.getById
);

// POST /api/v1/fleet - Create (Admin only)
router.post(
    '/',
    requireRole('Admin'),
    auditLog(),
    FleetController.create
);

// PUT /api/v1/fleet/:id - Update (Admin only)
router.put(
    '/:id',
    requireRole('Admin'),
    auditLog(),
    FleetController.update
);

// DELETE /api/v1/fleet/:id - Delete (Admin only)
router.delete(
    '/:id',
    requireRole('Admin'),
    auditLog(),
    FleetController.delete
);

export default router;
