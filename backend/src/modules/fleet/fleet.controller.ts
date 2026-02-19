import { Request, Response } from 'express';
import { fleetService } from './fleet.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';

const createFleetSchema = z.object({
    unitNumber: z.string().min(1),
    carType: z.string().min(1),
    keyId: z.string().min(1),
    keyColorCode: z.string().min(1),
    status: z.enum(['Ready', 'In-Use', 'Maintenance', 'Damaged']).default('Ready'),
    vapsPermit: z.string().optional(),
    stadiumId: z.string().min(1),
    assignedToFA: z.string().optional(),
});

const updateFleetSchema = createFleetSchema.partial();

export class FleetController {
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const stadiumId = req.query.stadiumId as string | undefined;
            const faTrigram = req.query.faTrigram as string | undefined;
            const status = req.query.status as string | undefined;

            // RBAC Filtering
            let filterStadiumId = stadiumId;
            let filterFATrigram = faTrigram;

            if (req.user?.role === 'FocalPoint') {
                filterFATrigram = req.user.faTrigram!;
                if (req.user.stadiumId) {
                    filterStadiumId = req.user.stadiumId;
                }
            }

            const fleet = await fleetService.getAll({
                stadiumId: filterStadiumId,
                faTrigram: filterFATrigram,
                status: status as string,
            });

            res.status(200).json(fleet);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch fleet' });
        }
    }

    static async getById(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const vehicle = await fleetService.getById(id);

            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }

            res.status(200).json(vehicle);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch vehicle' });
        }
    }

    static async create(req: Request, res: Response) {
        try {
            const validatedData = createFleetSchema.parse(req.body);
            const vehicle = await fleetService.create(validatedData);
            res.status(201).json(vehicle);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to create vehicle' });
            }
        }
    }

    static async update(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const validatedData = updateFleetSchema.parse(req.body);
            const vehicle = await fleetService.update(id, validatedData);
            res.status(200).json(vehicle);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update vehicle' });
            }
        }
    }

    static async delete(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            await fleetService.delete(id);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete vehicle' });
        }
    }

    static async getAvailable(req: AuthRequest, res: Response) {
        try {
            const faTrigram = req.user?.faTrigram;
            const stadiumId = req.user?.stadiumId;

            if (!faTrigram) {
                res.status(400).json({ error: 'User does not have an assigned Functional Area' });
                return;
            }

            const available = await fleetService.getAvailableByFA(faTrigram, stadiumId || undefined);
            res.status(200).json(available);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch available vehicles' });
        }
    }
}
