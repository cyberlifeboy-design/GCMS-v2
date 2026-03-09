import { Response } from 'express';
import { handoverService } from './handover.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const checkoutSchema = z.object({
    fleetId: z.string().min(1),
    conditionNotes: z.string().optional(),
});

const checkinSchema = z.object({
    fleetId: z.string().min(1),
    conditionNotes: z.string().optional(),
    hasIssue: z.boolean().default(false),
    issueDescription: z.string().optional(),
    photosUrls: z.array(z.string()).optional(),
});

const bulkIdsSchema = z.object({
    fleetIds: z.array(z.string()).min(1),
    conditionNotes: z.string().optional(),
});

export class HandoverController {
    static async checkOut(req: AuthRequest, res: Response) {
        try {
            const validatedData = checkoutSchema.parse(req.body);
            const log = await handoverService.checkOut({
                ...validatedData,
                userId: req.user!.userId,
            });
            res.status(201).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Checkout failed' });
            }
        }
    }

    static async checkIn(req: AuthRequest, res: Response) {
        try {
            const validatedData = checkinSchema.parse(req.body);
            const log = await handoverService.checkIn({
                ...validatedData,
                userId: req.user!.userId,
            });
            res.status(201).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Check-in failed' });
            }
        }
    }

    static async bulkCheckOut(req: AuthRequest, res: Response) {
        try {
            const { fleetIds } = bulkIdsSchema.parse(req.body);
            const results = await handoverService.bulkCheckOut(fleetIds, req.user!.userId);
            res.status(200).json(results);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Bulk checkout failed' });
            }
        }
    }

    static async bulkCheckIn(req: AuthRequest, res: Response) {
        try {
            const { fleetIds, conditionNotes } = bulkIdsSchema.parse(req.body);
            const results = await handoverService.bulkCheckIn(fleetIds, req.user!.userId, conditionNotes);
            res.status(200).json(results);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Bulk check-in failed' });
            }
        }
    }

    static async getHistory(req: AuthRequest, res: Response) {
        try {
            const { fleetId, action } = req.query as any;

            let stadiumId: string | undefined;
            let userId: string | undefined;

            if (req.user?.role === 'Admin') {
                stadiumId = req.user.stadiumId;
            } else if (req.user?.role === 'FA') {
                userId = req.user.userId;
            }

            const history = await handoverService.getHistory({
                stadiumId,
                userId,
                fleetId,
                action,
            });
            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }
}
