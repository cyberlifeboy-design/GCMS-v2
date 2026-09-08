import { Router, Request, Response } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { PoolBookingsController } from './pool-bookings.controller';

const router = Router();
router.use(authenticate);

// GET /api/v1/pool-bookings/fleet — list all pool carts with active booking info
router.get('/fleet', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), (req: Request, res: Response) =>
    PoolBookingsController.getPoolFleet(req as any, res),
);

// GET /api/v1/pool-bookings — list bookings (filterable by fleetId, status, stadiumId)
router.get('/', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), (req: Request, res: Response) =>
    PoolBookingsController.getBookings(req as any, res),
);

// NOTE: the immediate no-approval checkout/return routes were removed — every pool
// booking now goes through the approval workflow in the pool-booking-requests module.
// The routes below are read-only history plus the pool-flag toggle.

// PATCH /api/v1/pool-bookings/fleet/:id/toggle-pool — mark/unmark cart as pool
router.patch('/fleet/:id/toggle-pool', requireRole('SuperAdmin', 'Admin'), auditLog(), (req: Request, res: Response) =>
    PoolBookingsController.togglePool(req as any, res),
);

export default router;
