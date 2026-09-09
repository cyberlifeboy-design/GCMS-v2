import { Response } from 'express';
import { settingsService } from './settings.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';
import { prisma } from '../../config/database';
import { emailService } from '../../services/email.service';
import { notificationService } from '../notifications/notification.service';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Helper to coerce FormData string values to proper types
const coerceBoolean = z.preprocess((val) => {
    if (typeof val === 'string') return val === 'true';
    return val;
}, z.boolean());

const coerceNumber = z.preprocess((val) => {
    if (typeof val === 'string') {
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? undefined : parsed;
    }
    return val;
}, z.number().int());

const coerceOptionalNumber = z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    if (typeof val === 'string') {
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? undefined : parsed;
    }
    return val;
}, z.number().int().optional());

const coerceDate = z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return null;
    if (typeof val === 'string') {
        try {
            const date = new Date(val);
            return isNaN(date.getTime()) ? null : date;
        } catch {
            return null;
        }
    }
    return val;
}, z.date().nullable().optional());

const updateSettingsSchema = z.object({
    tournamentName: z.string().min(1).optional(),
    footerText: z.string().optional(),
    maintenanceNotificationEmails: z.string().optional().nullable(),
    handoverTimeoutMinutes: coerceNumber.optional(),
    defaultStadiumId: z.string().optional().nullable(),
    // Feature toggles
    enableMaintenanceReports: coerceBoolean.optional(),
    enableHandoverPhotos: coerceBoolean.optional(),
    enableFleetManagement: coerceBoolean.optional(),
    enableCarRequests: coerceBoolean.optional(),
    enableUserImport: coerceBoolean.optional(),
    enableBulkOperations: coerceBoolean.optional(),
    enableAdvancedReports: coerceBoolean.optional(),
    enableAssignmentMatrix: coerceBoolean.optional(),
    // System announcement (legacy)
    systemAnnouncement: z.string().optional().nullable(),
    announcementExpiry: coerceDate,
    // Handover duration settings
    handoverDefaultDurationDays: coerceOptionalNumber,
    handoverEventStartDate: coerceDate,
    handoverEventEndDate: coerceDate,
    enableHandoverReminder: coerceBoolean.optional(),
    handoverReminderHoursBefore: coerceOptionalNumber,
    // Timezone settings
    timezone: z.string().optional().nullable(),
    // Request window control
    requestWindowMode: z.enum(['open', 'closed', 'scheduled']).optional(),
    requestWindowStart: coerceDate,
    requestWindowEnd: coerceDate,
    requestWindowClosedMessage: z.string().optional().nullable(),
    // Handover T&C (SuperAdmin only — enforced at route level)
    handoverTcEnTitle: z.string().optional().nullable(),
    handoverTcEnBody: z.string().optional().nullable(),
    handoverTcArTitle: z.string().optional().nullable(),
    handoverTcArBody: z.string().optional().nullable(),
    handoverTcCheckboxes: z.string().optional().nullable(),
});

export class SettingsController {
    static uploadMiddleware = upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'header', maxCount: 1 },
        { name: 'footer', maxCount: 1 },
    ]);

    static async get(req: AuthRequest, res: Response) {
        try {
            const settings = await settingsService.get();
            res.status(200).json({ data: settings });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get settings' });
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const validatedData: any = updateSettingsSchema.parse(req.body);
            const files = req.files as Record<string, Express.Multer.File[]> | undefined;

            // Upload branding assets if provided
            if (files?.logo?.[0]) {
                const f = files.logo[0];
                validatedData.logoUrl = await settingsService.uploadBrandingAsset(
                    `logo_${Date.now()}${getExt(f.originalname)}`,
                    f.buffer,
                    f.mimetype
                );
            }
            if (files?.header?.[0]) {
                const f = files.header[0];
                validatedData.headerUrl = await settingsService.uploadBrandingAsset(
                    `header_${Date.now()}${getExt(f.originalname)}`,
                    f.buffer,
                    f.mimetype
                );
            }
            if (files?.footer?.[0]) {
                const f = files.footer[0];
                validatedData.footerUrl = await settingsService.uploadBrandingAsset(
                    `footer_${Date.now()}${getExt(f.originalname)}`,
                    f.buffer,
                    f.mimetype
                );
            }

            const settings = await settingsService.update(validatedData, req.user?.userId);
            res.status(200).json(settings);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update settings' });
            }
        }
    }

    /** POST /api/v1/settings/request-window/announce — email + notify all active FA that the window is open. */
    static async announceWindow(_req: AuthRequest, res: Response) {
        try {
            const state = await settingsService.getRequestWindowState();
            const closesLine = state.closesAt
                ? ` Submit your requests by ${new Date(state.closesAt).toLocaleString()}.`
                : '';
            const recipients = await prisma.user.findMany({
                where: { isActive: true, role: { in: ['FA'] } },
                select: { id: true, email: true, name: true },
            });
            const subject = 'Requirement collection is now open';
            const text = `The GCMS request window is now open.${closesLine}\n\nSubmit at: ${process.env.FRONTEND_URL || ''}/request`;
            for (const u of recipients) {
                try {
                    await emailService.send({ to: u.email, subject, text });
                } catch (e) {
                    console.error('announce email failed', u.email, e);
                }
            }
            if (recipients.length) {
                await notificationService.createForUsers(
                    {
                        type: 'RequestWindowOpen',
                        title: subject,
                        message: `The request window is open.${closesLine}`,
                        entityType: 'SystemSettings',
                        entityId: 'request-window',
                    },
                    recipients.map((u) => u.id),
                );
            }
            res.json({ notified: recipients.length });
        } catch (error) {
            console.error('announceWindow error:', error);
            res.status(500).json({ error: 'Failed to announce the window' });
        }
    }
}

function getExt(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}
