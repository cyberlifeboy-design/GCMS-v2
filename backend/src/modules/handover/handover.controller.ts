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

const fleetIdOnlySchema = z.object({
    fleetId: z.string().min(1),
});

export class HandoverController {
    static uploadMiddleware = upload.array('photos', 5);

    static async signHandover(req: AuthRequest, res: Response) {
        try {
            const { fleetId } = fleetIdOnlySchema.parse(req.body);
            const userId = req.user!.userId;
            const log = await handoverService.signHandover({ fleetId, userId });
            res.status(200).json(log);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async requestHandback(req: AuthRequest, res: Response) {
        try {
            const { fleetId } = fleetIdOnlySchema.parse(req.body);
            const userId = req.user!.userId;
            const log = await handoverService.requestHandback({ fleetId, userId });
            res.status(200).json(log);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async acceptHandback(req: AuthRequest, res: Response) {
        try {
            const { fleetId } = fleetIdOnlySchema.parse(req.body);
            const adminId = req.user!.userId;
            
            if (req.user?.role !== 'Admin' && req.user?.role !== 'SuperAdmin') {
                return res.status(403).json({ error: 'Only admins can accept handbacks' });
            }

            const log = await handoverService.acceptHandback({ fleetId, adminId });
            res.status(200).json(log);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
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
            let departmentId: string | undefined;

            if (req.user?.role === 'Admin') {
                stadiumId = req.user.stadiumId;
            } else if (req.user?.role === 'FA') {
                userId = query.userId as string; // Allow FAs to filter by user if they want
                departmentId = req.user.departmentId;
            }

            const filters: HandoverFilters & { departmentId?: string } = {
                stadiumId,
                userId,
                departmentId,
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

    static async getPoolStatus(req: AuthRequest, res: Response) {
        try {
            const status = await handoverService.getPoolStatusByStadium();
            res.status(200).json(status);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch pool status' });
        }
    }

    static async getPoolDashboard(req: AuthRequest, res: Response) {
        try {
            const user = {
                userId: req.user!.userId,
                role: req.user!.role,
                stadiumId: req.user!.stadiumId,
                departmentId: req.user!.departmentId,
            };
            const dashboard = await handoverService.getPoolDashboard(user);
            res.status(200).json(dashboard);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch pool dashboard' });
        }
    }

    static async getAvailableInPool(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.params;
            const user = {
                userId: req.user!.userId,
                role: req.user!.role,
                departmentId: req.user!.departmentId,
            };
            const available = await handoverService.getAvailableInPool(stadiumId as string, user);
            res.status(200).json({ data: available });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch available carts' });
        }
    }

    // ── Handover Form Handlers ────────────────────────────────────────────────

    static async createHandoverForm(req: AuthRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'Admin' && role !== 'SuperAdmin') {
                return res.status(403).json({ error: 'Only admins can create handover forms' });
            }
            const form = await handoverService.createHandoverForm({
                ...req.body,
                adminId: req.user!.userId,
            });
            res.status(201).json(form);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async getHandoverForm(req: AuthRequest, res: Response) {
        try {
            const fleetId = req.params.fleetId;
            const form = await handoverService.getHandoverForm(fleetId);
            res.status(200).json(form ?? null);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async getPendingHandovers(req: AuthRequest, res: Response) {
        try {
            const role = req.user?.role;
            if (role !== 'Admin' && role !== 'SuperAdmin') {
                return res.status(403).json({ error: 'Admins only' });
            }
            const data = await handoverService.getPendingHandovers({
                role: req.user!.role,
                stadiumId: req.user!.stadiumId,
            });
            res.status(200).json(data);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    static async userSignHandoverForm(req: AuthRequest, res: Response) {
        try {
            const result = await handoverService.userSignHandoverForm({
                fleetId: req.body.fleetId,
                userId: req.user!.userId,
                userSignatureData: req.body.userSignatureData,
                tc1: req.body.tc1,
                tc2: req.body.tc2,
                tc3: req.body.tc3,
                finalName: req.body.finalName,
                finalDate: req.body.finalDate,
                finalSignatureData: req.body.finalSignatureData,
            });
            res.status(200).json(result);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    static async getInUse(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.params;
            const user = {
                userId: req.user!.userId,
                role: req.user!.role,
            };
            const inUse = await handoverService.getInUse(stadiumId as string, user);
            res.status(200).json({ data: inUse });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch in-use carts' });
        }
    }
}

function getExt(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}
