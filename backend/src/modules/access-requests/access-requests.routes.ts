import { Router, Request, Response } from 'express';
import { AccessRequestsController } from './access-requests.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// ============================================
// Public routes (no authentication required)
// ============================================

// POST /api/v1/public/access-requests - submit a self-service or invite-originated access request
router.post('/public/access-requests', (req: Request, res: Response) => AccessRequestsController.createPublic(req, res));

// GET /api/v1/public/access-requests/:token - confirmation page lookup
router.get('/public/access-requests/:token', (req: Request, res: Response) => AccessRequestsController.getByTokenPublic(req, res));

// ============================================
// Admin routes (authentication required)
// ============================================

router.use(authenticate);

router.get('/access-requests', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getAll(req as any, res));
router.get('/access-requests/:id', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getById(req as any, res));
router.post('/access-requests/:id/approve', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.approve(req as any, res));
router.post('/access-requests/:id/reject', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.reject(req as any, res));
router.delete('/access-requests/:id', requireRole('SuperAdmin'), (req: Request, res: Response) => AccessRequestsController.delete(req as any, res));

export default router;
