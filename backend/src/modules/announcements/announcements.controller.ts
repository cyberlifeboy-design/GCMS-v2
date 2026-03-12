import { Request, Response } from 'express';
import { announcementService, CreateAnnouncementData } from './announcements.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const createAnnouncementSchema = z.object({
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(2000),
    type: z.enum(['info', 'warning', 'success', 'error']).optional(),
    targetType: z.enum(['all', 'fas', 'users', 'selected']).optional(),
    targetUserIds: z.array(z.string()).optional(),
    targetRole: z.string().optional().nullable(),
    stadiumId: z.string().optional().nullable(),
    scheduledAt: z.string().optional().nullable().transform(v => v ? new Date(v) : undefined),
    expiresAt: z.string().optional().nullable().transform(v => v ? new Date(v) : undefined),
    sendNow: z.preprocess(v => v === 'true' || v === true, z.boolean()).optional(),
});

const updateAnnouncementSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    message: z.string().min(1).max(2000).optional(),
    type: z.enum(['info', 'warning', 'success', 'error']).optional(),
    targetType: z.enum(['all', 'fas', 'users', 'selected']).optional(),
    targetUserIds: z.array(z.string()).optional(),
    targetRole: z.string().optional().nullable(),
    stadiumId: z.string().optional().nullable(),
    scheduledAt: z.string().optional().nullable().transform(v => v ? new Date(v) : undefined),
    expiresAt: z.string().optional().nullable().transform(v => v ? new Date(v) : undefined),
});

export class AnnouncementController {
    async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createAnnouncementSchema.parse(req.body);
            const sendNow = validatedData.sendNow ?? !validatedData.scheduledAt;
            
            const announcement = await announcementService.create({
                title: validatedData.title,
                message: validatedData.message,
                type: validatedData.type,
                targetType: validatedData.targetType,
                targetUserIds: validatedData.targetUserIds,
                targetRole: validatedData.targetRole ?? undefined,
                stadiumId: validatedData.stadiumId ?? undefined,
                createdBy: req.user?.userId,
                scheduledAt: validatedData.scheduledAt ?? undefined,
                expiresAt: validatedData.expiresAt ?? undefined,
            }, sendNow);

            res.status(201).json({ data: announcement });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to create announcement' });
            }
        }
    }

    async getAll(req: AuthRequest, res: Response) {
        try {
            const pageParam = req.query.page;
            const limitParam = req.query.limit;
            const typeParam = req.query.type;
            const targetTypeParam = req.query.targetType;
            const isActiveParam = req.query.isActive;

            const params: any = {
                page: parseInt(typeof pageParam === 'string' ? pageParam : '1') || 1,
                limit: parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20,
            };

            if (typeof typeParam === 'string') params.type = typeParam;
            if (typeof targetTypeParam === 'string') params.targetType = targetTypeParam;
            if (typeof isActiveParam === 'string') params.isActive = isActiveParam === 'true';

            const result = await announcementService.getAll(params);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getById(req: AuthRequest, res: Response) {
        try {
            const idParam = req.params.id;
            const id: string = typeof idParam === 'string' ? idParam : '';

            const announcement = await announcementService.getById(id);
            if (!announcement) {
                return res.status(404).json({ error: 'Announcement not found' });
            }
            res.json({ data: announcement });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async update(req: AuthRequest, res: Response) {
        try {
            const idParam = req.params.id;
            const id: string = typeof idParam === 'string' ? idParam : '';
            const validatedData = updateAnnouncementSchema.parse(req.body);

            const announcement = await announcementService.update(id, {
                title: validatedData.title,
                message: validatedData.message,
                type: validatedData.type,
                targetType: validatedData.targetType,
                targetUserIds: validatedData.targetUserIds,
                targetRole: validatedData.targetRole ?? undefined,
                stadiumId: validatedData.stadiumId ?? undefined,
                scheduledAt: validatedData.scheduledAt ?? undefined,
                expiresAt: validatedData.expiresAt ?? undefined,
            });

            res.json({ data: announcement });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update announcement' });
            }
        }
    }

    async delete(req: AuthRequest, res: Response) {
        try {
            const idParam = req.params.id;
            const id: string = typeof idParam === 'string' ? idParam : '';

            await announcementService.delete(id);
            res.json({ success: true });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async sendNow(req: AuthRequest, res: Response) {
        try {
            const idParam = req.params.id;
            const id: string = typeof idParam === 'string' ? idParam : '';

            const announcement = await announcementService.sendNow(id);
            res.json({ data: announcement });
        } catch (error: any) {
            if (error.message === 'Announcement already sent') {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: error.message });
            }
        }
    }

    async deactivate(req: AuthRequest, res: Response) {
        try {
            const idParam = req.params.id;
            const id: string = typeof idParam === 'string' ? idParam : '';

            const announcement = await announcementService.deactivate(id);
            res.json({ data: announcement });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getActiveForUser(req: AuthRequest, res: Response) {
        try {
            const userId = req.user?.userId;
            const role = req.user?.role;
            const stadiumId = req.user?.stadiumId;

            if (!userId || !role) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const announcements = await announcementService.getActiveForUser(userId, role, stadiumId);
            res.json({ data: announcements });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const announcementController = new AnnouncementController();