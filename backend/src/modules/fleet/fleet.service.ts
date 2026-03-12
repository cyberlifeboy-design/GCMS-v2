import { prisma } from '../../config/database';
import { FleetFilters, PaginatedResult, PaginationParams } from '../../types';

export class FleetService {
    async getAll(filters: FleetFilters, pagination?: PaginationParams): Promise<PaginatedResult<any>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            ...(filters.departmentId && { departmentId: filters.departmentId }),
            ...(filters.assignedUserId && { assignedUserId: filters.assignedUserId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.carType && {
                carType: Array.isArray(filters.carType)
                    ? { in: filters.carType }
                    : filters.carType
            }),
            ...(filters.requiresVAP !== undefined && { requiresVAP: filters.requiresVAP }),
        };

        const [data, total] = await Promise.all([
            prisma.fleet.findMany({
                where,
                include: {
                    stadium: true,
                    department: { select: { id: true, name: true } },
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
                department: { select: { id: true, name: true } },
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
        assignedUserId?: string | null;
        departmentId?: string | null;
    }) {
        return prisma.fleet.create({
            data: {
                carNumber: data.carNumber,
                carType: data.carType,
                status: data.status || 'Available',
                requiresVAP: data.requiresVAP ?? false,
                stadiumId: data.stadiumId,
                assignedUserId: data.assignedUserId || null,
                departmentId: data.departmentId || null,
            },
            include: { stadium: true, department: { select: { id: true, name: true } }, assignedUser: { select: { id: true, name: true, phone: true } } },
        });
    }

    async update(id: string, data: Partial<{
        carNumber: string;
        carType: string;
        status: string;
        requiresVAP: boolean;
        stadiumId: string;
        assignedUserId: string | null;
        departmentId: string | null;
    }>) {
        return prisma.fleet.update({
            where: { id },
            data,
            include: { stadium: true, department: { select: { id: true, name: true } }, assignedUser: { select: { id: true, name: true, phone: true } } },
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

    async getAssignmentMatrix(stadiumId?: string) {
        const where: any = {};
        if (stadiumId) where.stadiumId = stadiumId;

        const [fleet, users] = await Promise.all([
            prisma.fleet.findMany({
                where,
                include: {
                    stadium: { select: { id: true, name: true, code: true } },
                    department: { select: { id: true, name: true } },
                    assignedUser: { select: { id: true, name: true, email: true, phone: true, role: true } },
                },
                orderBy: [{ stadium: { name: 'asc' } }, { carNumber: 'asc' }],
            }),
            prisma.user.findMany({
                where: { role: 'FA', isActive: true, ...(stadiumId ? { stadiumId } : {}) },
                select: { id: true, name: true, email: true, phone: true, stadium: { select: { id: true, name: true } } },
                orderBy: { name: 'asc' },
            }),
        ]);

        // Group fleet by stadium for matrix view
        const byStadium = fleet.reduce((acc, cart) => {
            const stadiumKey = cart.stadiumId;
            if (!acc[stadiumKey]) acc[stadiumKey] = { stadium: cart.stadium, carts: [] };
            acc[stadiumKey].carts.push(cart);
            return acc;
        }, {} as Record<string, { stadium: any; carts: any[] }>);

        return { fleet, users, byStadium };
    }

    async bulkAssign(assignments: Array<{ fleetId: string; userId: string | null }>) {
        const results = { success: 0, failed: 0, errors: [] as string[] };

        for (const { fleetId, userId } of assignments) {
            try {
                const newStatus = userId ? 'Assigned' : 'Available';
                await prisma.fleet.update({
                    where: { id: fleetId },
                    data: { assignedUserId: userId, status: newStatus },
                });
                results.success++;
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Cart ${fleetId}: ${err.message}`);
            }
        }

        return results;
    }

    async getAssignmentHistory(filters?: { fleetId?: string; userId?: string; limit?: number }) {
        // Note: Assignment history is tracked via audit logs for Fleet entity changes
        const auditWhere: any = { entityType: 'Fleet' };
        if (filters?.fleetId) auditWhere.entityId = filters.fleetId;

        const logs = await prisma.auditLog.findMany({
            where: auditWhere,
            orderBy: { timestamp: 'desc' },
            take: filters?.limit || 100,
        });

        // Get user info for the logs
        const userIds = logs.map(l => l.userId).filter(Boolean) as string[];
        const uniqueUserIds = [...new Set(userIds)];
        const users = await prisma.user.findMany({
            where: { id: { in: uniqueUserIds } },
            select: { id: true, name: true, email: true, role: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        // Filter to assignment-related changes
        const assignmentLogs = logs.filter(log => {
            const newValue = log.newValue as Record<string, unknown> | null;
            const oldValue = log.oldValue as Record<string, unknown> | null;
            return (
                log.action.includes('assign') ||
                (newValue?.assignedUserId !== undefined) ||
                (oldValue?.assignedUserId !== undefined && newValue?.assignedUserId !== oldValue?.assignedUserId)
            );
        });

        return assignmentLogs.map(log => ({
            id: log.id,
            action: log.action,
            fleetId: log.entityId,
            user: userMap.get(log.userId) || null,
            oldValue: log.oldValue,
            newValue: log.newValue,
            timestamp: log.timestamp,
        }));
    }
}

export const fleetService = new FleetService();
