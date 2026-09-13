import { Response } from 'express';
import { settingsService } from './settings.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';
import { prisma } from '../../config/database';
import { emailService } from '../../services/email.service';
import { notificationService } from '../notifications/notification.service';
import { imageFileFilter } from '../../middleware/uploadFilters';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });

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
    // Corporate SMTP (SuperAdmin only — enforced at route level). smtpPassword
    // is optional and only overwritten when a caller sends a non-empty value —
    // leaving the field blank in the UI keeps whatever is already stored.
    smtpHost: z.string().optional().nullable(),
    smtpPort: coerceOptionalNumber,
    smtpSecure: coerceBoolean.optional(),
    smtpUser: z.string().optional().nullable(),
    smtpPassword: z.string().optional(),
    smtpFromEmail: z.string().optional().nullable(),
    smtpFromName: z.string().optional().nullable(),
});

export class SettingsController {
    static uploadMiddleware = upload.fields([
        { name: 'logo', maxCount: 1 },
        { name: 'header', maxCount: 1 },
        { name: 'footer', maxCount: 1 },
    ]);

    static async get(req: AuthRequest, res: Response) {
        try {
            const settings: any = await settingsService.get();
            // smtpPassword must never leave the server — only whether one is set.
            const { smtpPassword, ...safe } = settings;
            res.status(200).json({ data: { ...safe, smtpPasswordSet: !!smtpPassword } });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get settings' });
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const validatedData: any = updateSettingsSchema.parse(req.body);
            // Blank password in the form means "leave it as-is", not "clear it".
            if (!validatedData.smtpPassword) delete validatedData.smtpPassword;
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

            const settings: any = await settingsService.update(validatedData, req.user?.userId);
            const { smtpPassword, ...safe } = settings;
            res.status(200).json({ ...safe, smtpPasswordSet: !!smtpPassword });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update settings' });
            }
        }
    }

    /** POST /api/v1/settings/smtp/test — SuperAdmin only. Sends a real email through the configured SMTP transport. */
    static async testSmtp(req: AuthRequest, res: Response) {
        try {
            const to = String(req.body?.to || '').trim();
            if (!to) {
                res.status(400).json({ error: 'A recipient email address is required' });
                return;
            }
            await emailService.send({
                to,
                subject: 'GCMS — SMTP test email',
                text: `This is a test email from GCMS, confirming the configured SMTP server can deliver mail.\n\nSent: ${new Date().toLocaleString()}`,
            });
            res.json({ message: `Test email sent to ${to}` });
        } catch (error: any) {
            console.error('SMTP test failed:', error);
            res.status(502).json({ error: error?.message || 'Failed to send test email — check the SMTP settings' });
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
