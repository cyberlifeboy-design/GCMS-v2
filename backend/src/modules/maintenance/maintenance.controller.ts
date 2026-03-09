import { Response } from 'express';
import { maintenanceService } from './maintenance.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const reportIssueSchema = z.object({
    fleetId: z.string().min(1),
    issueDescription: z.string().min(1),
});

const updateStatusSchema = z.object({
    status: z.enum(['Open', 'InProgress', 'Resolved']),
    resolutionNotes: z.string().optional(),
});

export class MaintenanceController {
    static uploadMiddleware = upload.array('photos', 5);

    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, fleetId, page, limit } = req.query as any;

            // RBAC scoping  
            let stadiumId: string | undefined;
            if (req.user?.role === 'Admin') {
                stadiumId = req.user.stadiumId;
            }

            const logs = await maintenanceService.getAll({ stadiumId, status, fleetId }, {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
            });
            res.status(200).json(logs);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch maintenance logs' });
        }
    }

    static async getByFleet(req: AuthRequest, res: Response) {
        try {
            const history = await maintenanceService.getByFleet(req.params['fleetId'] as string);
            res.status(200).json({ data: history });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch fleet history' });
        }
    }

    static async reportIssue(req: AuthRequest, res: Response) {
        try {
            const validatedData = reportIssueSchema.parse(req.body);
            const userId = req.user!.userId;

            // Upload photos if present
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
            if (req.user?.role === 'Admin') stadiumId = req.user.stadiumId;
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
