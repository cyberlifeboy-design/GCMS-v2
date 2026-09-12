import { Router, Request, Response } from 'express';
import { PoolBookingRequestsController } from './pool-booking-requests.controller';
import { authenticate, optionalAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// ============================================
// Public routes (no authentication required)
// optionalAuth attaches req.user when a valid token IS present, so a
// logged-in FA/Admin/SuperAdmin submitting from the in-app Bookings page
// still gets createdById recorded — without requiring a login to submit.
// ============================================

router.post('/public/pool-booking-requests', optionalAuth, (req: Request, res: Response) =>
    PoolBookingRequestsController.createPublic(req as any, res),
);
router.get('/public/pool-booking-requests/venues/:stadiumId/fas', (req: Request, res: Response) =>
    PoolBookingRequestsController.getFAsPublic(req, res),
);
router.get('/public/pool-booking-requests/venues/:stadiumId/available-carts', (req: Request, res: Response) =>
    PoolBookingRequestsController.getAvailableCartsPublic(req, res),
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
