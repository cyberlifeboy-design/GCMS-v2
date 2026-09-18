import { Router } from 'express';
import { StadiumController } from './stadiums.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole, checkStadiumAccess } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

/**
 * @route   GET /api/v1/stadiums
 * @desc    Get all stadiums
 * @access  Protected
 */
router.get('/', authenticate, StadiumController.getAll);

/**
 * @route   POST /api/v1/stadiums/bulk
 * @desc    Bulk-create stadiums (skips existing codes)
 * @access  Protected (SuperAdmin only)
 */
router.post('/bulk', authenticate, requireRole('SuperAdmin'), StadiumController.bulkCreate);

/**
 * @route   GET /api/v1/stadiums/:id
 * @desc    Get stadium by ID
 * @access  Protected
 */
router.get('/:id', authenticate, StadiumController.getById);

/**
 * @route   POST /api/v1/stadiums
 * @desc    Create a new stadium
 * @access  Protected (SuperAdmin only)
 */
router.post('/', authenticate, requireRole('SuperAdmin'), StadiumController.create);

/**
 * @route   PUT /api/v1/stadiums/:id
 * @desc    Update a stadium
 * @access  Protected (SuperAdmin only)
 */
router.put('/:id', authenticate, requireRole('SuperAdmin'), StadiumController.update);

/**
 * @route   POST /api/v1/stadiums/:id/admins
 * @desc    Assign (create or promote) a venue Admin by name + email
 * @access  Protected (SuperAdmin only)
 */
router.post('/:id/admins', authenticate, requireRole('SuperAdmin'), auditLog(), StadiumController.assignAdmin);

/**
 * @route   GET /api/v1/stadiums/:id/pool-booking-hours
 * @desc    Get a venue's pool-booking operating hours
 * @access  Protected (SuperAdmin: any venue; Admin: own venue only)
 */
router.get(
    '/:id/pool-booking-hours',
    authenticate,
    requireRole('SuperAdmin', 'Admin'),
    checkStadiumAccess((req) => req.params.id as string),
    StadiumController.getPoolBookingHours,
);

/**
 * @route   PATCH /api/v1/stadiums/:id/pool-booking-hours
 * @desc    Set a venue's pool-booking operating hours
 * @access  Protected (SuperAdmin: any venue; Admin: own venue only)
 */
router.patch(
    '/:id/pool-booking-hours',
    authenticate,
    requireRole('SuperAdmin', 'Admin'),
    checkStadiumAccess((req) => req.params.id as string),
    StadiumController.updatePoolBookingHours,
);

/**
 * @route   DELETE /api/v1/stadiums/:id
 * @desc    Delete a stadium
 * @access  Protected (SuperAdmin only)
 */
router.delete('/:id', authenticate, requireRole('SuperAdmin'), StadiumController.delete);

export default router;