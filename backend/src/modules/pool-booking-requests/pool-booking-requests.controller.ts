import { Response, Request } from 'express';
import { z } from 'zod';
import { poolBookingRequestsService } from './pool-booking-requests.service';
import { AuthRequest } from '../../middleware/auth.middleware';

const createSchema = z.object({
    stadiumId: z.string().min(1),
    fleetId: z.string().min(1),
    requesterName: z.string().min(1),
    requesterEmail: z.string().email(),
    requesterPhone: z.string().min(1),
    faUserId: z.string().min(1),
    bookingType: z.enum(['Single', 'Recurring']),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
    purpose: z.string().optional(),
});

const approveSchema = z.object({
    comment: z.string().optional(),
});

const rejectSchema = z.object({
    comment: z.string().min(1, 'A comment is required when rejecting a booking'),
});

const amendSchema = z.object({
    fleetId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    faUserId: z.string().optional(),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled']).optional(),
    comment: z.string().optional(),
});

export class PoolBookingRequestsController {
    /** POST /api/v1/public/pool-booking-requests */
    static async createPublic(req: AuthRequest, res: Response) {
        try {
            const data = createSchema.parse(req.body);
            if (data.endDate < data.startDate) {
                res.status(400).json({ error: 'End date cannot be before start date' });
                return;
            }
            if (data.endTime <= data.startTime) {
                res.status(400).json({ error: 'End time must be after start time' });
                return;
            }
            const booking = await poolBookingRequestsService.create({ ...data, createdById: req.user?.userId });
            res.status(201).json({ message: 'Booking request submitted', data: booking });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Create pool booking request error:', error);
                res.status(500).json({ error: 'Failed to submit booking request' });
            }
        }
    }

    /** GET /api/v1/public/pool-booking-requests/:token */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const booking = await poolBookingRequestsService.getByToken(req.params.token as string);
            if (!booking) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            res.json({ data: booking });
        } catch (error) {
            console.error('Get pool booking request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch booking request' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/fas */
    static async getFAsPublic(req: Request, res: Response) {
        try {
            const fas = await poolBookingRequestsService.getFAsForStadium(req.params.stadiumId as string);
            res.json({ data: fas });
        } catch (error) {
            console.error('Get FAs for stadium error:', error);
            res.status(500).json({ error: 'Failed to fetch FAs' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/available-carts */
    static async getAvailableCartsPublic(req: Request, res: Response) {
        try {
            const { startDate, endDate, startTime, endTime, excludeBookingId } = req.query;
            if (!startDate || !endDate || !startTime || !endTime) {
                res.status(400).json({ error: 'startDate, endDate, startTime and endTime are required' });
                return;
            }
            const carts = await poolBookingRequestsService.getAvailableCarts(
                req.params.stadiumId as string,
                startDate as string,
                endDate as string,
                startTime as string,
                endTime as string,
                excludeBookingId as string | undefined,
            );
            res.json({ data: carts });
        } catch (error) {
            console.error('Get available carts error:', error);
            res.status(500).json({ error: 'Failed to fetch available carts' });
        }
    }

    /** GET /api/v1/pool-booking-requests */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId } = req.query;
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }
            const data = await poolBookingRequestsService.getAll({ status: status as string, stadiumId: filterStadiumId });
            res.json({ data });
        } catch (error) {
            console.error('Get all pool booking requests error:', error);
            res.status(500).json({ error: 'Failed to fetch booking requests' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/approve */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = approveSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.approve(id, req.user!.userId, comment);
            res.json({ message: 'Booking approved', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else {
                console.error('Approve pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to approve booking' });
            }
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/reject */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = rejectSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.reject(id, req.user!.userId, comment);
            res.json({ message: 'Booking rejected', data: booking });
        } catch (error) {
            const err = error as Error;
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to reject booking' });
            }
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id */
    static async amend(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const data = amendSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const { comment, ...rest } = data;
            const booking = await poolBookingRequestsService.amend(id, rest, req.user!.userId, comment);
            res.json({ message: 'Booking updated', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else {
                console.error('Amend pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to update booking' });
            }
        }
    }
}
