import { Response } from 'express';
import { z } from 'zod';
import { notificationTemplatesService } from './notification-templates.service';
import { AuthRequest } from '../../middleware/auth.middleware';

const updateSchema = z.object({
    emailEnabled: z.boolean().optional(),
    emailSubject: z.string().optional().nullable(),
    emailBody: z.string().optional().nullable(),
    pushEnabled: z.boolean().optional(),
    pushTitle: z.string().optional().nullable(),
    pushMessage: z.string().optional().nullable(),
});

export class NotificationTemplatesController {
    /** GET /api/v1/notification-templates — SuperAdmin only */
    static async list(_req: AuthRequest, res: Response) {
        try {
            const templates = await notificationTemplatesService.list();
            res.json({
                data: templates.map((t) => ({ ...t, variables: t.variables ? JSON.parse(t.variables) : [] })),
            });
        } catch (error) {
            console.error('List notification templates error:', error);
            res.status(500).json({ error: 'Failed to load notification templates' });
        }
    }

    /** PUT /api/v1/notification-templates/:key — SuperAdmin only */
    static async update(req: AuthRequest, res: Response) {
        try {
            const data = updateSchema.parse(req.body);
            const updated = await notificationTemplatesService.update(req.params.key as string, data, req.user?.userId);
            res.json({ data: { ...updated, variables: updated.variables ? JSON.parse(updated.variables) : [] } });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
                return;
            }
            const err = error as Error & { code?: string };
            if (err.code === 'P2025') {
                res.status(404).json({ error: 'Template not found' });
                return;
            }
            console.error('Update notification template error:', error);
            res.status(500).json({ error: 'Failed to update notification template' });
        }
    }

    /** POST /api/v1/notification-templates/:key/reset — SuperAdmin only */
    static async reset(req: AuthRequest, res: Response) {
        try {
            const updated = await notificationTemplatesService.resetToDefault(req.params.key as string, req.user?.userId);
            res.json({ data: { ...updated, variables: updated.variables ? JSON.parse(updated.variables) : [] } });
        } catch (error) {
            const err = error as Error;
            console.error('Reset notification template error:', error);
            res.status(400).json({ error: err.message || 'Failed to reset template' });
        }
    }
}
