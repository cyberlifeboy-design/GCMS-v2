import { Router, Request, Response } from 'express';
import { RequestsController } from './requests.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// ============================================
// Public routes (no authentication required)
// ============================================

// POST /api/v1/public/requests - Submit a car request
router.post('/public/requests', (req: Request, res: Response) => RequestsController.createPublic(req, res));

// GET /api/v1/public/requests/:token - View request by token (confirmation page)
router.get('/public/requests/:token', (req: Request, res: Response) => RequestsController.getByTokenPublic(req, res));

// ============================================
// Admin routes (authentication required)
// ============================================

// Apply authentication to all routes below
router.use(authenticate);

// GET /api/v1/requests - Get all requests (filtered by role)
router.get('/requests', requireRole('SuperAdmin', 'Admin', 'Observer'), (req: Request, res: Response) => RequestsController.getAll(req as any, res));

// GET /api/v1/requests/:id - Get request by ID
router.get('/requests/:id', requireRole('SuperAdmin', 'Admin', 'Observer'), (req: Request, res: Response) => RequestsController.getById(req as any, res));

// POST /api/v1/requests/:id/approve - Approve a request
router.post('/requests/:id/approve', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.approve(req as any, res));

// POST /api/v1/requests/:id/reject - Reject a request
router.post('/requests/:id/reject', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.reject(req as any, res));

// PATCH /api/v1/requests/:id/quantities - Update request quantities (edit before approve)
router.patch('/requests/:id/quantities', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.updateQuantities(req as any, res));

// DELETE /api/v1/requests/:id - Delete a request (SuperAdmin only)
router.delete('/requests/:id', requireRole('SuperAdmin'), (req: Request, res: Response) => RequestsController.delete(req as any, res));

export default router;