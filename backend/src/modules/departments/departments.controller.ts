import { Response } from 'express';
import { departmentsService } from './departments.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { z } from 'zod';

const createDeptSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    stadiumId: z.string().min(1),
});

const createBulkDeptSchema = z.object({
    name: z.string().min(1),
    code: z.string().optional(),
    stadiumIds: z.array(z.string().min(1)).min(1),
});

export class DepartmentsController {
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            // Admin only sees their venue
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const depts = await departmentsService.getAll({ stadiumId: filterStadiumId });
            res.status(200).json({ data: depts });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch departments' });
        }
    }

    static async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createDeptSchema.parse(req.body);

            // Admin only in their venue
            if (req.user?.role === 'Admin' && validatedData.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'You can only create departments in your own venue' });
                return;
            }

            const dept = await departmentsService.create(validatedData);
            res.status(201).json(dept);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to create department' });
            }
        }
    }

    static async createBulk(req: AuthRequest, res: Response) {
        try {
            // Only SuperAdmin can create departments across multiple stadiums
            if (req.user?.role !== 'SuperAdmin') {
                res.status(403).json({ error: 'Only SuperAdmin can create departments across multiple venues' });
                return;
            }

            const validatedData = createBulkDeptSchema.parse(req.body);

            const departments = await departmentsService.createBulk(validatedData);
            res.status(201).json({ data: departments, count: departments.length });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to create departments' });
            }
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const id = req.params['id'] as string;
            const dept = await departmentsService.update(id, req.body);
            res.status(200).json(dept);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update department' });
        }
    }

    static async delete(req: AuthRequest, res: Response) {
        try {
            await departmentsService.delete(req.params['id'] as string);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete department' });
        }
    }
}
