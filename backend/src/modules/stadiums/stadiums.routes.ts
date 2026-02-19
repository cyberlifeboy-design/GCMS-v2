import { Router } from 'express';
import { StadiumController } from './stadiums.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

/**
 * @route   GET /api/v1/stadiums
 * @desc    Get all stadiums
 * @access  Protected
 */
router.get('/', authenticate, StadiumController.getAll);

/**
 * @route   GET /api/v1/stadiums/:id
 * @desc    Get stadium by ID
 * @access  Protected
 */
router.get('/:id', authenticate, StadiumController.getById);

/**
 * @route   POST /api/v1/stadiums
 * @desc    Create a new stadium
 * @access  Protected (Admin only)
 */
router.post('/', authenticate, requireRole('Admin'), StadiumController.create);

/**
 * @route   PUT /api/v1/stadiums/:id
 * @desc    Update a stadium
 * @access  Protected (Admin only)
 */
router.put('/:id', authenticate, requireRole('Admin'), StadiumController.update);

/**
 * @route   DELETE /api/v1/stadiums/:id
 * @desc    Delete a stadium
 * @access  Protected (Admin only)
 */
router.delete('/:id', authenticate, requireRole('Admin'), StadiumController.delete);

export default router;