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
//
// NOTE: authenticate is applied per-route below (not via a blanket
// `router.use(authenticate)`) deliberately — this router is mounted at the
// bare '/api/v1' prefix alongside modules/requests/requests.routes.ts and
// others. Express walks same-prefix routers in mount order, so a blanket
// `.use(authenticate)` here would swallow (401) any request that isn't
// matched by this router's own patterns — including unrelated public
// routes like /api/v1/public/stadiums — before it can fall through to a
// later router. See pool-booking-requests.routes.ts for the same note.
// ============================================

router.get('/access-requests', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getAll(req as any, res));
router.get('/access-requests/:id', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.getById(req as any, res));
router.post('/access-requests/:id/approve', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.approve(req as any, res));
router.post('/access-requests/:id/reject', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => AccessRequestsController.reject(req as any, res));
router.delete('/access-requests/:id', authenticate, requireRole('SuperAdmin'), (req: Request, res: Response) => AccessRequestsController.delete(req as any, res));

export default router;
