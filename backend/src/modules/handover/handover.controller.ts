import { Response } from 'express';
import { handoverService } from './handover.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';
import { HandoverFilters, PaginationParams } from '../../types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const checkinSchema = z.object({
    fleetId: z.string().min(1),
    conditionNotes: z.string().optional(),
});

const checkoutSchema = z.object({
    fleetId: z.string().min(1),
    conditionNotes: z.string().optional(),
    hasIssue: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(false)),
    issueDescription: z.string().optional(),
});

const bulkIdsSchema = z.object({
    fleetIds: z.array(z.string()).min(1),
    conditionNotes: z.string().optional(),
});

export class HandoverController {
    static uploadMiddleware = upload.array('photos', 5);

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
                res.status(500).json({ error: 'Check-in failed' });
            }
        }
    }

    static async checkOut(req: AuthRequest, res: Response) {
        try {
            const validatedData = checkoutSchema.parse(req.body);
            const userId = req.user!.userId;

            // Handle photo uploads if present
            let photosUrls: string[] = [];
            if (req.files && Array.isArray(req.files) && req.files.length > 0) {
                const { maintenanceService } = await import('../maintenance/maintenance.service');
                const filenames = (req.files as Express.Multer.File[]).map(
                    (f, i) => `handover_${validatedData.fleetId}_${Date.now()}_${i}${getExt(f.originalname)}`
                );
                const buffers = (req.files as Express.Multer.File[]).map(f => f.buffer);
                photosUrls = await maintenanceService.uploadPhotos(filenames, buffers);
            }

            const log = await handoverService.checkOut({
                ...validatedData,
                userId,
                photosUrls,
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

    static async bulkCheckIn(req: AuthRequest, res: Response) {
        try {
            const { fleetIds } = bulkIdsSchema.parse(req.body);
            const results = await handoverService.bulkCheckIn(fleetIds, req.user!.userId);
            res.status(200).json(results);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Bulk check-in failed' });
            }
        }
    }

    static async bulkCheckOut(req: AuthRequest, res: Response) {
        try {
            const { fleetIds, conditionNotes } = bulkIdsSchema.parse(req.body);
            const results = await handoverService.bulkCheckOut(fleetIds, req.user!.userId, conditionNotes);
            res.status(200).json(results);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Bulk checkout failed' });
            }
        }
    }

    static async getHistory(req: AuthRequest, res: Response) {
        try {
            const query = req.query as any;
            const { fleetId, action, page, limit } = query;

            let stadiumId: string | undefined;
            let userId: string | undefined;

            if (req.user?.role === 'Admin') {
                stadiumId = req.user.stadiumId;
            } else if (req.user?.role === 'FA') {
                userId = req.user.userId;
            }

            const filters: HandoverFilters = {
                stadiumId,
                userId,
                fleetId: fleetId as string,
                action: action as string,
            };

            const pagination: PaginationParams = {
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
            };

            const history = await handoverService.getHistory(filters, pagination);
            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch history' });
        }
    }
}

function getExt(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}
