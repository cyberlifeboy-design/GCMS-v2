import { Response } from 'express';
import { usersService } from './users.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const ROLES = ['SuperAdmin', 'Admin', 'FA', 'Observer'] as const;

const createUserSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6).optional(),
    role: z.enum(ROLES),
    phone: z.string().optional(),
    stadiumId: z.string().optional(),
});

const updateUserSchema = z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    role: z.enum(ROLES).optional(),
    phone: z.string().optional(),
    stadiumId: z.string().optional(),
    isActive: z.boolean().optional(),
});

export class UsersController {
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { role, isActive } = req.query as any;

            let filterStadiumId: string | undefined;

            // Admin only sees users at their own venue
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const users = await usersService.getAll({
                role,
                stadiumId: filterStadiumId,
                isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
            });

            // Admin sees only FA users and themselves
            if (req.user?.role === 'Admin') {
                users.data = users.data.filter((u: any) =>
                    u.role === 'FA' || u.id === req.user!.userId
                );
            }

            res.status(200).json(users);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    }

    static async getById(req: AuthRequest, res: Response) {
        try {
            const id = String(req.params['id'] || '');
            const user = await usersService.getById(id);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch user' });
        }
    }

    static async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createUserSchema.parse(req.body);

            // Admin can only create FA users at their own venue
            if (req.user?.role === 'Admin') {
                if (validatedData.role !== 'FA') {
                    res.status(403).json({ error: 'Admin can only create FA users' });
                    return;
                }
                validatedData.stadiumId = req.user.stadiumId;
            }

            const user = await usersService.create(validatedData as any);
            res.status(201).json(user);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Failed to create user' });
            }
        }
    }

    static async update(req: AuthRequest, res: Response) {
        try {
            const id = String(req.params['id'] || '');
            const validatedData = updateUserSchema.parse(req.body);

            // Admin can only update FA at own venue
            if (req.user?.role === 'Admin') {
                const target = await usersService.getById(id);
                if (!target || target.role !== 'FA' || target.stadiumId !== req.user.stadiumId) {
                    res.status(403).json({ error: 'You can only edit FA users at your venue' });
                    return;
                }
                // Admin cannot change role away from FA
                if (validatedData.role && validatedData.role !== 'FA') {
                    res.status(403).json({ error: 'Admin cannot change role' });
                    return;
                }
            }

            const user = await usersService.update(id, validatedData);
            res.status(200).json(user);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update user' });
            }
        }
    }

    static async setActive(req: AuthRequest, res: Response) {
        try {
            const id = String(req.params['id'] || '');
            const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

            // Admin can only deactivate FA at own venue
            if (req.user?.role === 'Admin') {
                const target = await usersService.getById(id);
                if (!target || target.role !== 'FA' || target.stadiumId !== req.user.stadiumId) {
                    res.status(403).json({ error: 'You can only manage FA users at your venue' });
                    return;
                }
            }

            const user = await usersService.setActive(id, isActive);
            res.status(200).json(user);
        } catch (error) {
            res.status(500).json({ error: 'Failed to update user status' });
        }
    }

    static async delete(req: AuthRequest, res: Response) {
        try {
            const id = String(req.params['id'] || '');
            if (req.user?.userId === id) {
                res.status(400).json({ error: 'Cannot delete your own account' });
                return;
            }

            // Admin can only delete FA at own venue
            if (req.user?.role === 'Admin') {
                const target = await usersService.getById(id);
                if (!target || target.role !== 'FA' || target.stadiumId !== req.user.stadiumId) {
                    res.status(403).json({ error: 'You can only delete FA users at your venue' });
                    return;
                }
            }

            await usersService.delete(id);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete user' });
        }
    }

    static async bulkCreate(req: AuthRequest, res: Response) {
        try {
            const schema = z.array(z.object({
                name: z.string(),
                email: z.string().email(),
                password: z.string().optional(),
                role: z.enum(ROLES),
                phone: z.string().optional(),
                stadiumId: z.string().optional(),
            }));
            const users = schema.parse(req.body);

            const result = await usersService.bulkCreate(users as any);
            res.status(201).json({
                message: `Created: ${result.created}, Skipped: ${result.skipped}`,
                ...result,
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
