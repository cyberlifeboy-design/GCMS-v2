import { prisma } from '../../config/database';
import { FleetFilters, PaginatedResult, PaginationParams } from '../../types';
import { notificationService } from '../notifications/notification.service';

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
                    stadium: { select: { id: true, name: true, code: true } },
                    department: { select: { id: true, name: true, code: true } },
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
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
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
            include: { stadium: { select: { id: true, name: true, code: true } }, department: { select: { id: true, name: true, code: true } }, assignedUser: { select: { id: true, name: true, phone: true } } },
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
            include: { stadium: { select: { id: true, name: true, code: true } }, department: { select: { id: true, name: true, code: true } }, assignedUser: { select: { id: true, name: true, phone: true } } },
        });
    }

    async delete(id: string) {
        return prisma.fleet.delete({ where: { id } });
    }

    async assignUser(fleetId: string, userId: string | null) {
        const newStatus = userId ? 'Assigned' : 'Available';
        const fleet = await prisma.fleet.update({
            where: { id: fleetId },
            data: { assignedUserId: userId, status: newStatus },
            include: { 
                assignedUser: { select: { id: true, name: true, phone: true } },
                stadium: { select: { id: true, name: true } },
            },
        });

        // Create notification for assignment change
        if (userId) {
            await notificationService.createForRoles(
                {
                    type: 'AssignmentChange',
                    title: 'Cart Assignment',
                    message: `${fleet.carNumber} assigned to ${fleet.assignedUser?.name || 'Unknown'}`,
                    entityType: 'Fleet',
                    entityId: fleetId,
                },
                ['SuperAdmin', 'Admin'],
                fleet.stadiumId || undefined,
            );
        }

        return fleet;
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
            include: { stadium: { select: { id: true, name: true, code: true } }, department: { select: { id: true, name: true, code: true } } },
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
                    department: { select: { id: true, name: true, code: true } },
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

    async getAssignmentHistory(filters?: { fleetId?: string; userId?: string; carNumber?: string; startDate?: Date; endDate?: Date; limit?: number; stadiumId?: string }) {
        // Build audit log query
        const auditWhere: any = { entityType: 'Fleet' };
        if (filters?.fleetId) auditWhere.entityId = filters.fleetId;

        // Date range filter
        if (filters?.startDate || filters?.endDate) {
            auditWhere.timestamp = {};
            if (filters?.startDate) auditWhere.timestamp.gte = filters.startDate;
            if (filters?.endDate) auditWhere.timestamp.lte = filters.endDate;
        }

        // If carNumber filter provided, find matching fleet IDs
        let fleetIdByCarNumber: string | undefined;
        if (filters?.carNumber && !filters.fleetId) {
            const fleet = await prisma.fleet.findFirst({
                where: { carNumber: { equals: filters.carNumber, mode: 'insensitive' } },
                select: { id: true },
            });
            if (fleet) {
                auditWhere.entityId = fleet.id;
                fleetIdByCarNumber = fleet.id;
            } else {
                return []; // No matching car
            }
        }

        // Stadium filter - get all fleet IDs for the stadium
        if (filters?.stadiumId && !filters.fleetId && !filters?.carNumber) {
            const stadiumFleetIds = await prisma.fleet.findMany({
                where: { stadiumId: filters.stadiumId },
                select: { id: true },
            });
            auditWhere.entityId = { in: stadiumFleetIds.map(f => f.id) };
        }

        const logs = await prisma.auditLog.findMany({
            where: auditWhere,
            orderBy: { timestamp: 'desc' },
            take: filters?.limit || 100,
        });

        // Get all unique user IDs from logs (userId from audit, and from old/new values)
        const userIds = new Set<string>();
        logs.forEach(log => {
            if (log.userId) userIds.add(log.userId);
            const oldValue = log.oldValue as Record<string, unknown> | null;
            const newValue = log.newValue as Record<string, unknown> | null;
            if (oldValue?.assignedUserId) userIds.add(oldValue.assignedUserId as string);
            if (newValue?.assignedUserId) userIds.add(newValue.assignedUserId as string);
        });

        // Convert Set to array
        const userIdsArray = Array.from(userIds);

        // Get user details with department info
        const users = await prisma.user.findMany({
            where: { id: { in: userIdsArray } },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                department: { select: { id: true, name: true, code: true } },
                stadium: { select: { id: true, name: true } },
            },
        });
        const userMap = new Map(users.map(u => [u.id, u]));

        // Get fleet details for cart numbers
        const fleetIds = Array.from(new Set(logs.map(l => l.entityId)));
        const fleetItems = await prisma.fleet.findMany({
            where: { id: { in: fleetIds } },
            select: {
                id: true,
                carNumber: true,
                carType: true,
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
        const fleetMap = new Map(fleetItems.map(f => [f.id, f]));

        // Filter to assignment-related changes and enhance with full details
        const assignmentLogs = logs.filter(log => {
            const newValue = log.newValue as Record<string, unknown> | null;
            const oldValue = log.oldValue as Record<string, unknown> | null;
            return (
                log.action.toLowerCase().includes('assign') ||
                (newValue?.assignedUserId !== undefined) ||
                (oldValue?.assignedUserId !== undefined && newValue?.assignedUserId !== oldValue?.assignedUserId)
            );
        });

        return assignmentLogs.map(log => {
            const oldValue = log.oldValue as Record<string, unknown> | null;
            const newValue = log.newValue as Record<string, unknown> | null;
            const fleet = fleetMap.get(log.entityId);
            const assignedByUser = userMap.get(log.userId);
            const oldAssignedUser = oldValue?.assignedUserId ? userMap.get(oldValue.assignedUserId as string) : null;
            const newAssignedUser = newValue?.assignedUserId ? userMap.get(newValue.assignedUserId as string) : null;

            return {
                id: log.id,
                timestamp: log.timestamp,
                action: log.action,
                // Fleet/Cart details
                fleetId: log.entityId,
                carNumber: fleet?.carNumber || null,
                carType: fleet?.carType || null,
                stadium: fleet?.stadium || null,
                // Who performed the action
                assignedBy: assignedByUser ? {
                    id: assignedByUser.id,
                    name: assignedByUser.name,
                    email: assignedByUser.email,
                    role: assignedByUser.role,
                    phone: assignedByUser.phone,
                    department: assignedByUser.department,
                    stadium: assignedByUser.stadium,
                } : null,
                // Previous assignment (who was it assigned to before)
                previousAssignment: oldAssignedUser ? {
                    id: oldAssignedUser.id,
                    name: oldAssignedUser.name,
                    email: oldAssignedUser.email,
                    role: oldAssignedUser.role,
                    phone: oldAssignedUser.phone,
                    department: oldAssignedUser.department,
                } : null,
                // New assignment (who is it assigned to now)
                newAssignment: newAssignedUser ? {
                    id: newAssignedUser.id,
                    name: newAssignedUser.name,
                    email: newAssignedUser.email,
                    role: newAssignedUser.role,
                    phone: newAssignedUser.phone,
                    department: newAssignedUser.department,
                } : null,
                // Raw values for debugging/audit trail
                oldValue: log.oldValue,
                newValue: log.newValue,
                ipAddress: log.ipAddress,
            };
        });
    }
}

export const fleetService = new FleetService();
