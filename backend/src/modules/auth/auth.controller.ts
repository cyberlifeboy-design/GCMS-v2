import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { z } from 'zod';

// Validation schemas
const registerSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    accreditationId: z.string().min(3).max(50),
    role: z.enum(['Admin', 'LCC', 'FocalPoint', 'Contractor']),
    faTrigram: z.string().optional(),
    stadiumId: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
});

export class AuthController {
    /**
     * POST /api/v1/auth/register
     */
    static async register(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = registerSchema.parse(req.body);

            const user = await AuthService.register(validatedData);

            res.status(201).json({
                message: 'User registered successfully',
                user,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation error',
                    details: error.errors,
                });
            } else if (error instanceof Error) {
                res.status(400).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Registration failed' });
            }
        }
    }

    /**
     * POST /api/v1/auth/login
     */
    static async login(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = loginSchema.parse(req.body);

            const result = await AuthService.login(validatedData);

            res.status(200).json({
                message: 'Login successful',
                ...result,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation error',
                    details: error.errors,
                });
            } else if (error instanceof Error) {
                res.status(401).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Login failed' });
            }
        }
    }

    /**
     * POST /api/v1/auth/refresh
     */
    static async refresh(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = refreshTokenSchema.parse(req.body);

            const result = await AuthService.refreshAccessToken(validatedData.refreshToken);

            res.status(200).json({
                message: 'Token refreshed successfully',
                ...result,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({
                    error: 'Validation error',
                    details: error.errors,
                });
            } else if (error instanceof Error) {
                res.status(401).json({ error: error.message });
            } else {
                res.status(500).json({ error: 'Token refresh failed' });
            }
        }
    }

    /**
     * POST /api/v1/auth/logout
     */
    static async logout(req: Request, res: Response): Promise<void> {
        try {
            const { refreshToken } = req.body;
            const userId = (req as any).user?.userId;

            if (!userId) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }

            await AuthService.logout(userId, refreshToken);

            res.status(200).json({ message: 'Logged out successfully' });
        } catch (error) {
            res.status(500).json({ error: 'Logout failed' });
        }
    }

    /**
     * GET /api/v1/auth/me
     */
    static async getCurrentUser(req: Request, res: Response): Promise<void> {
        try {
            const user = (req as any).user;

            if (!user) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }

            res.status(200).json({ user });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get user info' });
        }
    }
}
