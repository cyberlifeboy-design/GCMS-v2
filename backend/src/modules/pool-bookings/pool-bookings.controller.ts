import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { poolBookingsService } from './pool-bookings.service';

const checkoutSchema = z.object({
    fleetId: z.string().min(1),
    driverName: z.string().min(1, 'Driver name is required'),
    driverPhone: z.string().optional(),
    accreditationNumber: z.string().optional(),
    purpose: z.string().optional(),
    expectedReturnAt: z.string().datetime({ offset: true }).optional(),
});

const returnSchema = z.object({
    returnNotes: z.string().optional(),
});

export class PoolBookingsController {
    static async getPoolFleet(req: AuthRequest, res: Response) {
        try {
            let stadiumId = req.query.stadiumId as string | undefined;
            if (req.user?.role === 'Admin') stadiumId = req.user.stadiumId;

            const carts = await poolBookingsService.getPoolFleet(stadiumId);
            res.json({ data: carts });
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'Failed to fetch pool fleet' });
        }
    }

    static async getBookings(req: AuthRequest, res: Response) {
        try {
            const { fleetId, status, limit } = req.query;
            let stadiumId = req.query.stadiumId as string | undefined;
            if (req.user?.role === 'Admin') stadiumId = req.user.stadiumId;

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

    static async checkout(req: AuthRequest, res: Response) {
        try {
            const body = checkoutSchema.parse(req.body);
            const booking = await poolBookingsService.checkout(
                body.fleetId,
                {
                    driverName: body.driverName,
                    driverPhone: body.driverPhone,
                    accreditationNumber: body.accreditationNumber,
                    purpose: body.purpose,
                    expectedReturnAt: body.expectedReturnAt ? new Date(body.expectedReturnAt) : undefined,
                },
                req.user!.userId,
            );
            res.status(201).json(booking);
        } catch (err: any) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: err.errors });
            } else {
                res.status(400).json({ error: err.message || 'Checkout failed' });
            }
        }
    }

    static async returnCart(req: AuthRequest, res: Response) {
        try {
            const { returnNotes } = returnSchema.parse(req.body);
            const booking = await poolBookingsService.returnCart(
                req.params['id'] as string,
                returnNotes,
                req.user!.userId,
            );
            res.json(booking);
        } catch (err: any) {
            if (err instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: err.errors });
            } else {
                res.status(400).json({ error: err.message || 'Return failed' });
            }
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
