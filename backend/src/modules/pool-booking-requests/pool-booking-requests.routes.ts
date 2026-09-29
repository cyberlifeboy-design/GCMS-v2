import { Router, Request, Response } from 'express';
import { PoolBookingRequestsController } from './pool-booking-requests.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { submissionLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();

// ============================================
// Booking submission + availability — login required (security review 2026-09-29:
// the old unauthenticated /public/* versions let anyone submit bookings in any
// SC/LOC user's name and flood the queue). Requester name/email are taken from the
// signed-in account in the controller, never from the request body.
// ============================================

router.post('/pool-booking-requests', authenticate, submissionLimiter, (req: Request, res: Response) =>
    PoolBookingRequestsController.createPublic(req as any, res),
);
router.post('/pool-booking-requests/instant', authenticate, submissionLimiter, (req: Request, res: Response) =>
    PoolBookingRequestsController.createInstantPublic(req as any, res),
);
router.post('/pool-booking-requests/recurring', authenticate, submissionLimiter, (req: Request, res: Response) =>
    PoolBookingRequestsController.createRecurringPublic(req as any, res),
);
router.get('/pool-booking-requests/venues/:stadiumId/fas', authenticate, (req: Request, res: Response) =>
    PoolBookingRequestsController.getFAsPublic(req, res),
);
router.get('/pool-booking-requests/venues/:stadiumId/available-carts', authenticate, (req: Request, res: Response) =>
    PoolBookingRequestsController.getAvailableCartsPublic(req, res),
);
router.post('/pool-booking-requests/venues/:stadiumId/available-carts-multi', authenticate, (req: Request, res: Response) =>
    PoolBookingRequestsController.getAvailableCartsMultiPublic(req, res),
);
router.get('/pool-booking-requests/venues/:stadiumId/instant-available-carts', authenticate, (req: Request, res: Response) =>
    PoolBookingRequestsController.getInstantAvailableCartsPublic(req, res),
);

// ============================================
// Tracking links (emailed to the requester) — stay public: the 256-bit random
// token is the credential.
// ============================================
router.patch('/public/pool-booking-requests/:token/collect', (req: Request, res: Response) =>
    PoolBookingRequestsController.markKeyCollectedPublic(req, res),
);
router.get('/public/pool-booking-requests/:token', (req: Request, res: Response) =>
    PoolBookingRequestsController.getByTokenPublic(req, res),
);

// ============================================
// Authenticated routes — review queue
//
// NOTE: authenticate is applied per-route below (not via a blanket
// `router.use(authenticate)`) deliberately. This router is mounted at the
// bare '/api/v1' prefix alongside modules/requests/requests.routes.ts,
// which is mounted the same way and itself does `router.use(authenticate)`
// for everything past its own public routes. Express walks same-prefix
// routers in mount order, so a blanket `.use(authenticate)` here would
// swallow (401) any request that isn't matched by this router's own
// patterns — including unrelated public routes like
// /api/v1/public/requests/:token — before it can fall through to the
// next router. Scoping authenticate to each matched route avoids that.
// ============================================

router.get('/pool-booking-requests', authenticate, requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), (req: Request, res: Response) =>
    PoolBookingRequestsController.getAll(req as any, res),
);
// History routes are registered right after the exact-match list route and before
// any ':id' patterns so "/history" is never captured as an id.
router.get('/pool-booking-requests/history', authenticate, requireRole('SuperAdmin', 'Admin', 'Observer', 'FA', 'Contracts', 'MaintenanceTeam'), (req: Request, res: Response) =>
    PoolBookingRequestsController.history(req as any, res),
);
router.get('/pool-booking-requests/history/export', authenticate, requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), (req: Request, res: Response) =>
    PoolBookingRequestsController.exportHistory(req as any, res),
);
router.patch('/pool-booking-requests/:id/approve', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.approve(req as any, res),
);
router.patch('/pool-booking-requests/:id/return', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.markReturned(req as any, res),
);
router.patch('/pool-booking-requests/:id/reject', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.reject(req as any, res),
);
router.patch('/pool-booking-requests/:id/collect', authenticate, requireRole('SuperAdmin', 'Admin', 'FA'), (req: Request, res: Response) =>
    PoolBookingRequestsController.markKeyCollected(req as any, res),
);
router.patch('/pool-booking-requests/:id', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.amend(req as any, res),
);
router.post('/pool-booking-requests/:id/extension', authenticate, requireRole('FA'), (req: Request, res: Response) =>
    PoolBookingRequestsController.requestExtension(req as any, res),
);
router.patch('/pool-booking-requests/:id/extension', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.reviewExtension(req as any, res),
);

export default router;
