import { Request, Response } from 'express';
import { stadiumsService } from './stadiums.service';
import { AuthRequest } from '../../middleware/auth.middleware';

// Helper to safely parse params
const parseParam = (param: unknown): string | undefined => {
    if (!param) return undefined;
    if (Array.isArray(param)) return param[0];
    if (typeof param === 'string') return param;
    return undefined;
};

export class StadiumController {
    static async getAll(req: AuthRequest, res: Response): Promise<void> {
        try {
            const pageParam = parseParam(req.query.page);
            const limitParam = parseParam(req.query.limit);
            const result = await stadiumsService.getAll({
                page: pageParam ? parseInt(pageParam) : undefined,
                limit: limitParam ? parseInt(limitParam) : undefined,
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async getById(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseParam(req.params.id);
            if (!id) {
                res.status(400).json({ error: 'Stadium ID is required' });
                return;
            }
            const stadium = await stadiumsService.getById(id);
            if (!stadium) {
                res.status(404).json({ error: 'Stadium not found' });
                return;
            }
            res.json(stadium);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }

    static async create(req: AuthRequest, res: Response): Promise<void> {
        try {
            const stadium = await stadiumsService.create(req.body);
            res.status(201).json(stadium);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    static async update(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseParam(req.params.id);
            if (!id) {
                res.status(400).json({ error: 'Stadium ID is required' });
                return;
            }
            const stadium = await stadiumsService.update(id, req.body);
            res.json(stadium);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    static async bulkCreate(req: AuthRequest, res: Response): Promise<void> {
        try {
            const { venues } = req.body;
            if (!Array.isArray(venues) || venues.length === 0) {
                res.status(400).json({ error: 'venues array is required' });
                return;
            }
            const result = await stadiumsService.bulkCreate(venues);
            res.status(201).json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }

    static async delete(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseParam(req.params.id);
            if (!id) {
                res.status(400).json({ error: 'Stadium ID is required' });
                return;
            }
            await stadiumsService.delete(id);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
}