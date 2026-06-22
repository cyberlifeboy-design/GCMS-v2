import { Response } from 'express';
import { maintenanceService } from './maintenance.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const reportIssueSchema = z.object({
    fleetId: z.string().min(1),
    issueType: z.string().optional(),
    issueDescription: z.string().min(1),
});

const updateStatusSchema = z.object({
    status: z.enum(['Open', 'InProgress', 'Resolved', 'PendingQuotation', 'PendingApproval']),
    resolutionNotes: z.string().optional(),
});

const submitCostSchema = z.object({
    fixCost: z.number().min(0),
    quotationDescription: z.string().min(1, 'Work description is required'),
    quotationTimeline: z.string().optional(),
});

const rejectSchema = z.object({
    rejectionReason: z.string().min(1, 'Rejection reason is required'),
});

export class MaintenanceController {
    static uploadMiddleware = upload.array('photos', 5);

    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, fleetId, page, limit } = req.query as any;

            let stadiumId: string | undefined;
            let reportedById: string | undefined;

            if (req.user?.role === 'Admin' && req.user.stadiumId) {
                stadiumId = req.user.stadiumId;
            } else if (req.user?.role === 'FA') {
                reportedById = req.user.userId;
            }

            const logs = await maintenanceService.getAll({ stadiumId, status, fleetId, reportedById }, {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            });
            res.status(200).json(logs);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch maintenance logs' });
        }
    }

    static async getById(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const log = await maintenanceService.getById(id);
            if (!log) {
                res.status(404).json({ error: 'Maintenance log not found' });
                return;
            }
            res.status(200).json(log);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch maintenance log' });
        }
    }

    static async escalateToContracts(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const log = await maintenanceService.escalateToContracts(id, req.user!.userId);
            res.status(200).json(log);
        } catch (error: any) {
            res.status(400).json({ error: error.message || 'Failed to escalate to Contracts' });
        }
    }

    static async requestQuotation(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const log = await maintenanceService.requestQuotation(id);
            res.status(200).json(log);
        } catch (error) {
            res.status(500).json({ error: 'Failed to request quotation' });
        }
    }

    static async submitCost(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const data = submitCostSchema.parse(req.body);
            const log = await maintenanceService.submitCost(id, data);
            res.status(200).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to submit quotation' });
            }
        }
    }

    static async approveCost(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const log = await maintenanceService.approveCost(id, req.user!.userId);
            res.status(200).json(log);
        } catch (error) {
            res.status(500).json({ error: 'Failed to approve cost' });
        }
    }

    static async rejectQuotation(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const { rejectionReason } = rejectSchema.parse(req.body);
            const log = await maintenanceService.rejectQuotation(id, rejectionReason, req.user!.userId);
            res.status(200).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to reject quotation' });
            }
        }
    }

    static async getPdfReport(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.headers['host'];
            const apiBaseUrl = `${protocol}://${host}`;

            const html = await maintenanceService.generatePdfReport(id, apiBaseUrl);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.status(200).send(html);
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Failed to generate report' });
        }
    }

    static async getByFleet(req: AuthRequest, res: Response) {
        try {
            const fleetId = req.params['fleetId'] as string;

            if (req.user?.role === 'Admin' && req.user.stadiumId) {
                const { prisma } = await import('../../config/database');
                const fleet = await prisma.fleet.findUnique({
                    where: { id: fleetId },
                    select: { stadiumId: true },
                });
                if (!fleet || fleet.stadiumId !== req.user.stadiumId) {
                    res.status(403).json({ error: 'Access denied' });
                    return;
                }
            }

            const history = await maintenanceService.getByFleet(fleetId);
            res.status(200).json({ data: history });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch fleet history' });
        }
    }

    static async reportIssue(req: AuthRequest, res: Response) {
        try {
            const validatedData = reportIssueSchema.parse(req.body);
            const userId = req.user!.userId;

            let photosUrls: string[] = [];
            if (req.files && Array.isArray(req.files) && req.files.length > 0) {
                const filenames = (req.files as Express.Multer.File[]).map(
                    (f, i) => `maint_${validatedData.fleetId}_${Date.now()}_${i}${getExt(f.originalname)}`
                );
                const buffers = (req.files as Express.Multer.File[]).map(f => f.buffer);
                photosUrls = await maintenanceService.uploadPhotos(filenames, buffers);
            }

            const log = await maintenanceService.reportIssue({
                fleetId: validatedData.fleetId,
                reportedById: userId,
                issueType: validatedData.issueType,
                issueDescription: validatedData.issueDescription,
                photosUrls,
            });

            res.status(201).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to report issue' });
            }
        }
    }

    static async updateStatus(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const validatedData = updateStatusSchema.parse(req.body);
            const log = await maintenanceService.updateStatus(id, validatedData);
            res.status(200).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update status' });
            }
        }
    }

    static async exportCsv(req: AuthRequest, res: Response) {
        try {
            let stadiumId = req.query.stadiumId as string | undefined;
            if (req.user?.role === 'Admin' && req.user.stadiumId) stadiumId = req.user.stadiumId;
            const status = req.query.status as string | undefined;

            const csv = await maintenanceService.exportToCsv({ stadiumId, status });
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="maintenance-report.csv"');
            res.status(200).send(csv);
        } catch (error) {
            res.status(500).json({ error: 'Export failed' });
        }
    }
}

function getExt(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}
