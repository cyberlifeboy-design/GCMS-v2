import { Request, Response } from 'express';
import { usersService } from './users.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const updateUserSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(['Admin', 'LCC', 'FocalPoint', 'Contractor']).optional(),
    faTrigram: z.string().optional(),
    stadiumId: z.string().optional(),
    accreditationId: z.string().optional(),
});

export class UsersController {
    static async getAll(req: Request, res: Response) {
        try {
            const users = await usersService.getAll();
            res.status(200).json(users);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const user = await usersService.getById(id as string);

            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const { id } = req.params;
            const validatedData = updateUserSchema.parse(req.body);

            // RBAC: Only admin or self can update
            if (req.user?.role !== 'Admin' && req.user?.userId !== id) {
                res.status(403).json({ error: 'Not authorized to update this user' });
                return;
            }

            const user = await usersService.update(id as string, validatedData);
            res.status(200).json(user);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update user' });
            }
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            await usersService.delete(id as string);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }

    static async bulkCreate(req: Request, res: Response) {
        try {
            const users = z.array(z.object({
                name: z.string(),
                email: z.string().email(),
                password: z.string().min(6).optional(),
                role: z.enum(['Admin', 'LCC', 'FocalPoint', 'Contractor']),
                accreditationId: z.string(),
                faTrigram: z.string().optional(),
                stadiumId: z.string().optional(),
            })).parse(req.body);

            const result = await usersService.bulkCreate(users);
            res.status(201).json({
                message: `Successfully processed ${users.length} users`,
                count: result.count
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to bulk create users' });
            }
        }
    }
}
