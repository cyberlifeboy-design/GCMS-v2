import { Router, Request, Response } from 'express';
import { InvitationsController } from './invitations.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// GET /api/v1/public/invitations/:token - validate an invite link before showing the request form
router.get('/public/invitations/:token', (req: Request, res: Response) => InvitationsController.getByTokenPublic(req, res));

router.use(authenticate);

// POST /api/v1/invitations - invite a user by email (Admin scoped to own venue in the controller)
router.post('/invitations', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.create(req as any, res));

// GET /api/v1/invitations - list invitations
router.get('/invitations', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.getAll(req as any, res));

// POST /api/v1/invitations/:id/revoke - revoke a pending invitation
router.post('/invitations/:id/revoke', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => InvitationsController.revoke(req as any, res));

export default router;
