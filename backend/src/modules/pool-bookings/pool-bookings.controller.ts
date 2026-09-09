import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { poolBookingsService } from './pool-bookings.service';
import { resolveStadiumScope } from '../reports/reports.scope';

export class PoolBookingsController {
    static async getPoolFleet(req: AuthRequest, res: Response) {
        try {
            const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);

            const carts = await poolBookingsService.getPoolFleet(stadiumId);
            res.json({ data: carts });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Failed to fetch pool fleet' });
        }
    }

    static async getBookings(req: AuthRequest, res: Response) {
        try {
            const { fleetId, status, limit } = req.query;
            const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);

            const bookings = await poolBookingsService.getBookings({
                fleetId: fleetId as string,
                stadiumId,
                status: status as string,
                limit: limit ? parseInt(limit as string) : undefined,
            });
            res.json({ data: bookings });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Failed to fetch bookings' });
        }
    }

    static async togglePool(req: AuthRequest, res: Response) {
        try {
            const { isPool } = req.body;
            if (typeof isPool !== 'boolean') {
                res.status(400).json({ error: 'isPool must be a boolean' });
                return;
            }
            const cart = await poolBookingsService.togglePool(
                req.params['id'] as string,
                isPool,
                req.user!.role,
                req.user?.stadiumId,
            );
            res.json(cart);
        } catch (err: any) {
            res.status(400).json({ error: err.message || 'Toggle failed' });
        }
    }
}
