import { Request, Response } from 'express';
import { maintenanceService } from './maintenance.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const reportIssueSchema = z.object({
    fleetId: z.string().min(1),
    issueDescription: z.string().min(1),
});

const assignContractorSchema = z.object({
    contractorId: z.string().min(1),
});

const reportFixSchema = z.object({
    fixDescription: z.string().min(1),
});

export class MaintenanceController {
    static async reportIssue(req: AuthRequest, res: Response) {
        try {
            const validatedData = reportIssueSchema.parse(req.body);
            const userId = req.user!.userId;

            const log = await maintenanceService.reportIssue({
                ...validatedData,
                reportedBy: userId,
            });

            res.status(201).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to report issue' });
            }
        }
    }

    static async assignToContractor(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { contractorId } = assignContractorSchema.parse(req.body);

            const log = await maintenanceService.assignToContractor(id as string, contractorId);
            res.status(200).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to assign contractor' });
            }
        }
    }

    static async reportFix(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = reportFixSchema.parse(req.body);

            const log = await maintenanceService.reportFix(id as string, validatedData);
            res.status(200).json(log);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to report fix' });
            }
        }
    }

    static async getPendingTasks(req: AuthRequest, res: Response) {
        try {
            const role = req.user?.role;
            const userId = req.user?.userId;

            // Contractors only see their assigned tasks
            const contractorId = role === 'Contractor' ? userId : undefined;

            const tasks = await maintenanceService.getPendingTasks(contractorId);
            res.status(200).json(tasks);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch pending tasks' });
        }
    }

    static async getHistoryByFleet(req: Request, res: Response) {
        try {
            const { fleetId } = req.params;
            const history = await maintenanceService.getHistoryByFleet(fleetId as string);
            res.status(200).json(history);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch maintenance history' });
        }
    }
}
