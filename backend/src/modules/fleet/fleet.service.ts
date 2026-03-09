import { prisma } from '../../config/database';
import { FleetFilters, PaginatedResult, PaginationParams } from '../../types';

export class FleetService {
    async getAll(filters: FleetFilters, pagination?: PaginationParams): Promise<PaginatedResult<any>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            ...(filters.assignedUserId && { assignedUserId: filters.assignedUserId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.carType && { carType: filters.carType }),
            ...(filters.requiresVAP !== undefined && { requiresVAP: filters.requiresVAP }),
        };

        const [data, total] = await Promise.all([
            prisma.fleet.findMany({
                where,
                include: {
                    stadium: true,
                    assignedUser: {
                        select: { id: true, name: true, phone: true, email: true, role: true },
                    },
                },
                skip,
                take: limit,
                orderBy: { carNumber: 'asc' },
            }),
            prisma.fleet.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async getById(id: string) {
        return prisma.fleet.findUnique({
            where: { id },
            include: {
                stadium: true,
                assignedUser: {
                    select: { id: true, name: true, phone: true, email: true, role: true },
                },
            },
        });
    }

    async create(data: {
        carNumber: string;
        carType: string;
        status?: string;
        requiresVAP?: boolean;
        stadiumId: string;
        assignedUserId?: string;
    }) {
        return prisma.fleet.create({
            data: {
                carNumber: data.carNumber,
                carType: data.carType,
                status: data.status || 'Available',
                requiresVAP: data.requiresVAP ?? false,
                stadiumId: data.stadiumId,
                assignedUserId: data.assignedUserId,
            },
            include: { stadium: true, assignedUser: { select: { id: true, name: true, phone: true } } },
        });
    }

    async update(id: string, data: Partial<{
        carNumber: string;
        carType: string;
        status: string;
        requiresVAP: boolean;
        stadiumId: string;
        assignedUserId: string | null;
    }>) {
        return prisma.fleet.update({
            where: { id },
            data,
            include: { stadium: true, assignedUser: { select: { id: true, name: true, phone: true } } },
        });
    }

    async delete(id: string) {
        return prisma.fleet.delete({ where: { id } });
    }

    async assignUser(fleetId: string, userId: string | null) {
        const newStatus = userId ? 'Assigned' : 'Available';
        return prisma.fleet.update({
            where: { id: fleetId },
            data: { assignedUserId: userId, status: newStatus },
            include: { assignedUser: { select: { id: true, name: true, phone: true } } },
        });
    }

    async bulkCreate(carts: Array<{
        carNumber: string;
        carType: string;
        requiresVAP?: boolean;
        stadiumId: string;
    }>) {
        const results = { created: 0, skipped: 0, errors: [] as string[] };

        for (const cart of carts) {
            try {
                await prisma.fleet.create({
                    data: {
                        carNumber: cart.carNumber,
                        carType: cart.carType,
                        status: 'Available',
                        requiresVAP: cart.requiresVAP ?? false,
                        stadiumId: cart.stadiumId,
                    },
                });
                results.created++;
            } catch (err: any) {
                if (err.code === 'P2002') {
                    results.skipped++;
                } else {
                    results.errors.push(`Cart ${cart.carNumber}: ${err.message}`);
                }
            }
        }

        return results;
    }

    async getAssignedToUser(userId: string) {
        return prisma.fleet.findMany({
            where: { assignedUserId: userId },
            include: { stadium: true },
            orderBy: { carNumber: 'asc' },
        });
    }
}

export const fleetService = new FleetService();
