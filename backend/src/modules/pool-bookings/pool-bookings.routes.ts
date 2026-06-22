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

// POST /api/v1/pool-bookings/checkout — check out a pool cart
router.post('/checkout', requireRole('SuperAdmin', 'Admin', 'FA'), auditLog(), (req: Request, res: Response) =>
    PoolBookingsController.checkout(req as any, res),
);

// PATCH /api/v1/pool-bookings/:id/return — return a pool cart
router.patch('/:id/return', requireRole('SuperAdmin', 'Admin', 'FA'), auditLog(), (req: Request, res: Response) =>
    PoolBookingsController.returnCart(req as any, res),
);

// PATCH /api/v1/pool-bookings/fleet/:id/toggle-pool — mark/unmark cart as pool
router.patch('/fleet/:id/toggle-pool', requireRole('SuperAdmin', 'Admin'), auditLog(), (req: Request, res: Response) =>
    PoolBookingsController.togglePool(req as any, res),
);

export default router;
