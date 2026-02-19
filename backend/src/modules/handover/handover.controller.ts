import { Response } from 'express';
import { handoverService } from './handover.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const checkoutSchema = z.object({
    fleetId: z.string().min(1),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    conditionNotes: z.string().optional(),
    signatureBase64: z.string().optional(),
});

const checkinSchema = checkoutSchema.extend({
    isMaintenanceRequired: z.boolean().default(false),
});

export class HandoverController {
    static async checkOut(req: AuthRequest, res: Response) {
        try {
            const validatedData = checkoutSchema.parse(req.body);
            const userId = req.user!.userId;

            const log = await handoverService.checkOut({
                ...validatedData,
                userId,
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
            const userId = req.user!.userId;

            const log = await handoverService.checkIn({
                ...validatedData,
                userId,
            });

            res.status(201).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Checkin failed' });
            }
        }
    }

    static async getMyHistory(req: AuthRequest, res: Response) {
        try {
            const userId = req.user!.userId;
            const history = await handoverService.getMyHandoverHistory(userId);
            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }

    static async getAllHistory(req: AuthRequest, res: Response) {
        try {
            const { stadiumId, faTrigram, fleetId } = req.query;

            // RBAC Filtering for non-admins
            let filterStadiumId = stadiumId as string | undefined;
            let filterFATrigram = faTrigram as string | undefined;

            if (req.user?.role === 'FocalPoint') {
                filterFATrigram = req.user.faTrigram!;
                if (req.user.stadiumId) {
                    filterStadiumId = req.user.stadiumId;
                }
            }

            const history = await handoverService.getAllHistory({
                stadiumId: filterStadiumId,
                faTrigram: filterFATrigram,
                fleetId: fleetId as string,
            });

            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }
}
