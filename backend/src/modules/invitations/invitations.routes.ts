import { Router, Request, Response } from 'express';
import { InvitationsController } from './invitations.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// GET /api/v1/public/invitations/:token - validate an invite link before showing the request form
router.get('/public/invitations/:token', (req: Request, res: Response) => InvitationsController.getByTokenPublic(req, res));

// NOTE: authenticate is applied per-route below (not via a blanket
// `router.use(authenticate)`) deliberately — this router is mounted at the
// bare '/api/v1' prefix alongside modules/requests/requests.routes.ts and
// others. Express walks same-prefix routers in mount order, so a blanket
// `.use(authenticate)` here would swallow (401) any request that isn't
// matched by this router's own patterns — including unrelated public
// routes like /api/v1/public/stadiums — before it can fall through to a
// later router. See pool-booking-requests.routes.ts for the same note.

// POST /api/v1/invitations - invite a user by email (Admin scoped to own venue in the controller)
router.post('/invitations', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.create(req as any, res));

// GET /api/v1/invitations - list invitations
router.get('/invitations', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.getAll(req as any, res));

// POST /api/v1/invitations/:id/revoke - revoke a pending invitation
router.post('/invitations/:id/revoke', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.revoke(req as any, res));

export default router;
