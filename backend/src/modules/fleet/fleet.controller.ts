import { Response } from 'express';
import { fleetService } from './fleet.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { FleetFilters, PaginationParams } from '../../types';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const CART_TYPES = ['Cargo', 'Accessibility', '6-Seater', '4-Seater'] as const;
const CART_STATUSES = ['Available', 'Assigned', 'Dispatched', 'Under Maintenance'] as const;

const createFleetSchema = z.object({
    carNumber: z.string().min(1),
    carType: z.enum(CART_TYPES),
    status: z.enum(CART_STATUSES).default('Available'),
    requiresVAP: z.boolean().default(false),
    stadiumId: z.string().min(1),
    assignedUserId: z.string().optional(),
});

const updateFleetSchema = createFleetSchema.partial();

export class FleetController {
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const query = req.query as any;
            const { stadiumId, assignedUserId, status, carType, requiresVAP, page, limit } = query;

            // RBAC scoping
            let filterStadiumId = stadiumId as string | undefined;
            let filterAssignedUserId = assignedUserId as string | undefined;

            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            } else if (req.user?.role === 'FA') {
                filterAssignedUserId = req.user.userId;
                filterStadiumId = req.user.stadiumId;
            }

            const filters: FleetFilters = {
                stadiumId: filterStadiumId,
                assignedUserId: filterAssignedUserId,
                status: status as string,
                carType: carType as string,
                requiresVAP: requiresVAP === 'true' ? true : requiresVAP === 'false' ? false : undefined,
            };

            const pagination: PaginationParams = {
                page: page ? parseInt(page as string) : undefined,
                limit: limit ? parseInt(limit as string) : undefined,
            };

            const fleet = await fleetService.getAll(filters, pagination);

            res.status(200).json(fleet);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch fleet' });
        }
    }

    static async getById(req: AuthRequest, res: Response) {
        try {
            const vehicle = await fleetService.getById(req.params['id'] as string);
            if (!vehicle) {
                res.status(404).json({ error: 'Vehicle not found' });
                return;
            }
            res.status(200).json(vehicle);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch vehicle' });
        }
    }

    static async create(req: AuthRequest, res: Response) {
        try {
            const validatedData = createFleetSchema.parse(req.body);

            // Admin can only create in their own stadium
            if (req.user?.role === 'Admin' && validatedData.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'You can only add carts to your own venue' });
                return;
            }

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

    static async update(req: AuthRequest, res: Response) {
        try {
            const validatedData = updateFleetSchema.parse(req.body);
            const vehicle = await fleetService.update(req.params['id'] as string, validatedData);
            res.status(200).json(vehicle);
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                res.status(500).json({ error: 'Failed to update vehicle' });
            }
        }
    }

    static async delete(req: AuthRequest, res: Response) {
        try {
            await fleetService.delete(req.params['id'] as string);
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ error: 'Failed to delete vehicle' });
        }
    }

    static async assignUser(req: AuthRequest, res: Response) {
        try {
            const { userId } = req.body; // null to unassign
            const vehicle = await fleetService.assignUser(req.params['id'] as string, userId || null);
            res.status(200).json(vehicle);
        } catch (error) {
            res.status(500).json({ error: 'Failed to assign user to vehicle' });
        }
    }

    static uploadMiddleware = upload.single('file');

    static async bulkImport(req: AuthRequest, res: Response) {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }

            const stadiumId = req.body.stadiumId;
            if (!stadiumId) {
                res.status(400).json({ error: 'stadiumId is required for bulk import' });
                return;
            }

            // Admin scoped to their own venue
            if (req.user?.role === 'Admin' && stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'You can only import carts to your own venue' });
                return;
            }

            // Parse xlsx
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

            if (rows.length < 2) {
                res.status(400).json({ error: 'File has no data rows' });
                return;
            }

            // Detect header row and map columns
            const headers = (rows[0] as string[]).map(h => String(h || '').toLowerCase().trim());
            const carNumberIdx = headers.findIndex(h => h.includes('car') || h.includes('unit') || h.includes('number'));
            const carTypeIdx = headers.findIndex(h => h.includes('type'));
            const vapIdx = headers.findIndex(h => h.includes('vap'));

            if (carNumberIdx === -1 || carTypeIdx === -1) {
                res.status(400).json({ error: 'Could not find required columns (car number, type) in file' });
                return;
            }

            const TYPE_MAP: Record<string, string> = {
                'cargo': 'Cargo',
                'accessibility': 'Accessibility',
                'accessible': 'Accessibility',
                '6-seater': '6-Seater',
                '6 seater': '6-Seater',
                '6seat': '6-Seater',
                '4-seater': '4-Seater',
                '4 seater': '4-Seater',
                '4seat': '4-Seater',
            };

            const carts = rows.slice(1)
                .filter(row => row[carNumberIdx])
                .map(row => {
                    const rawType = String(row[carTypeIdx] || '').toLowerCase().trim();
                    const carType = TYPE_MAP[rawType] || '4-Seater';
                    const requiresVAP = vapIdx !== -1 && (String(row[vapIdx] || '').toLowerCase() === 'yes' || row[vapIdx] === true || row[vapIdx] === '1');
                    return {
                        carNumber: String(row[carNumberIdx]).trim(),
                        carType,
                        requiresVAP,
                        stadiumId,
                    };
                });

            const results = await fleetService.bulkCreate(carts);
            res.status(200).json({
                message: `Import complete: ${results.created} added, ${results.skipped} skipped (duplicates)`,
                ...results,
            });
        } catch (error: any) {
            res.status(500).json({ error: 'Bulk import failed', details: error.message });
        }
    }

    static async getMyAssignedCarts(req: AuthRequest, res: Response) {
        try {
            const carts = await fleetService.getAssignedToUser(req.user!.userId);
            res.status(200).json({ data: carts });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch assigned carts' });
        }
    }
}
