import { prisma } from '../../config/database';
import { notificationService } from '../notifications/notification.service';

export interface PoolStatusByStadium {
    stadiumId: string;
    stadiumName: string;
    stadiumCode: string;
    total: number;
    available: number;
    assigned: number;
    dispatched: number;
    underMaintenance: number;
}

export interface PoolDashboardData {
    stadiums: PoolStatusByStadium[];
    userAssignedCarts?: Array<{
        id: string;
        carNumber: string;
        carType: string;
        status: string;
        stadiumId: string;
        stadiumName: string;
        departmentId?: string;
        departmentName?: string;
    }>;
    recentActivity: Array<{
        id: string;
        action: string;
        carNumber: string;
        userName: string;
        timestamp: Date;
        stadiumName: string;
    }>;
}

export class HandoverService {
    async checkIn(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
    }) {
        const vehicle = await prisma.fleet.findUnique({ 
            where: { id: data.fleetId },
            include: { stadium: true }
        });
        if (!vehicle) throw new Error('Vehicle not found');

        const allowedStatuses = ['Available', 'Assigned'];
        if (!allowedStatuses.includes(vehicle.status)) {
            throw new Error(`Vehicle is not available for check-in (Current status: ${vehicle.status})`);
        }

        const result = await prisma.$transaction(async (tx) => {
            await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedIn',
                    conditionNotes: data.conditionNotes,
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { 
                    status: 'Dispatched',
                    assignedUserId: data.userId, // Track who has the cart
                },
            });

            return { vehicle };
        });

        // Fetch the created log with relations after transaction completes
        const log = await prisma.handoverLog.findFirst({
            where: {
                fleetId: data.fleetId,
                userId: data.userId,
                action: 'CheckedIn',
            },
            orderBy: { timestamp: 'desc' },
            include: {
                fleet: { select: { id: true, carNumber: true, carType: true, status: true, stadium: { select: { id: true, name: true } } } },
                user: { select: { id: true, name: true, email: true, role: true } },
            },
        });

        // Create notification for check-in
        if (log) {
            const user = log.user;
            const stadiumId = log.fleet?.stadium?.id;
            
            await notificationService.createForRoles(
                {
                    type: 'CheckIn',
                    title: 'Cart Checked In',
                    message: `${user.name} checked out ${log.fleet?.carNumber || 'cart'}`,
                    entityType: 'HandoverLog',
                    entityId: log.id,
                },
                ['SuperAdmin', 'Admin'],
                stadiumId,
            );
        }

        return log;
    }

    async checkOut(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
        hasIssue?: boolean;
        issueDescription?: string;
        photosUrls?: string[];
    }) {
        const vehicle = await prisma.fleet.findUnique({ 
            where: { id: data.fleetId },
            include: { stadium: true }
        });
        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'Dispatched') {
            throw new Error(`Vehicle is not Dispatched (Current status: ${vehicle.status})`);
        }

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedOut',
                    conditionNotes: data.conditionNotes,
                    photosUrls: data.photosUrls || [],
                },
                include: {
                    fleet: { select: { carNumber: true, carType: true, stadium: { select: { id: true, name: true } } } },
                    user: { select: { id: true, name: true, email: true, role: true } },
                },
            });

            const nextStatus = data.hasIssue ? 'Under Maintenance' : 'Available';
            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { 
                    status: nextStatus,
                    assignedUserId: null, // Clear assignment when returned
                },
            });

            // Create maintenance log if issue reported
            if (data.hasIssue && data.issueDescription) {
                await tx.maintenanceLog.create({
                    data: {
                        fleetId: data.fleetId,
                        reportedById: data.userId,
                        issueDescription: data.issueDescription,
                        photosUrls: data.photosUrls || [],
                        status: 'Open',
                    },
                });
                await tx.handoverLog.create({
                    data: {
                        fleetId: data.fleetId,
                        userId: data.userId,
                        action: 'IssueReported',
                        conditionNotes: data.issueDescription,
                        photosUrls: data.photosUrls || [],
                    },
                });
            }

            return log;
        }).then(async (log) => {
            // Create notification for check-out
            const stadiumId = log.fleet?.stadium?.id;
            await notificationService.createForRoles(
                {
                    type: 'CheckOut',
                    title: 'Cart Returned',
                    message: `${log.user.name} returned ${log.fleet?.carNumber || 'cart'}${data.hasIssue ? ' (with issue)' : ''}`,
                    entityType: 'HandoverLog',
                    entityId: log.id,
                },
                ['SuperAdmin', 'Admin'],
                stadiumId,
            );

            return log;
        });
    }

    async bulkCheckIn(fleetIds: string[], userId: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };

        for (const fleetId of fleetIds) {
            try {
                await this.checkIn({ fleetId, userId });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async bulkCheckOut(fleetIds: string[], userId: string, conditionNotes?: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };

        for (const fleetId of fleetIds) {
            try {
                await this.checkOut({ fleetId, userId, conditionNotes });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async getHistory(filters: {
        stadiumId?: string;
        userId?: string;
        fleetId?: string;
        action?: string;
    }, pagination?: { page?: number; limit?: number }) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.action && { action: filters.action }),
        };

        if (filters.stadiumId) {
            where.fleet = { stadiumId: filters.stadiumId };
        }

        const [data, total] = await Promise.all([
            prisma.handoverLog.findMany({
                where,
                include: {
                    fleet: {
                        include: { stadium: { select: { id: true, name: true } } },
                    },
                    user: { select: { id: true, name: true, email: true, role: true } },
                },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
            }),
            prisma.handoverLog.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    /**
     * Get pool status for all stadiums
     * Shows total, available, assigned, dispatched, and maintenance counts per stadium
     */
    async getPoolStatusByStadium(): Promise<PoolStatusByStadium[]> {
        const stadiums = await prisma.stadium.findMany({
            where: { isActive: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });

        const fleet = await prisma.fleet.findMany({
            select: {
                stadiumId: true,
                status: true,
            },
        });

        // Aggregate counts by stadium
        const statusByStadium: Record<string, PoolStatusByStadium> = {};

        for (const stadium of stadiums) {
            statusByStadium[stadium.id] = {
                stadiumId: stadium.id,
                stadiumName: stadium.name,
                stadiumCode: stadium.code,
                total: 0,
                available: 0,
                assigned: 0,
                dispatched: 0,
                underMaintenance: 0,
            };
        }

        for (const cart of fleet) {
            const stadiumStatus = statusByStadium[cart.stadiumId];
            if (stadiumStatus) {
                stadiumStatus.total++;
                switch (cart.status) {
                    case 'Available':
                        stadiumStatus.available++;
                        break;
                    case 'Assigned':
                        stadiumStatus.assigned++;
                        break;
                    case 'Dispatched':
                        stadiumStatus.dispatched++;
                        break;
                    case 'Under Maintenance':
                        stadiumStatus.underMaintenance++;
                        break;
                }
            }
        }

        return Object.values(statusByStadium);
    }

    /**
     * Get pool dashboard data
     * Returns pool status by stadium, user's assigned carts (for FA), and recent activity
     */
    async getPoolDashboard(user: { userId: string; role: string; stadiumId?: string }): Promise<PoolDashboardData> {
        const stadiums = await this.getPoolStatusByStadium();

        // Filter stadiums by user's stadium for Admin
        let filteredStadiums = stadiums;
        if (user.role === 'Admin' && user.stadiumId) {
            filteredStadiums = stadiums.filter(s => s.stadiumId === user.stadiumId);
        }

        // Get user's assigned carts for FA users
        let userAssignedCarts: PoolDashboardData['userAssignedCarts'] = undefined;
        if (user.role === 'FA') {
            const assigned = await prisma.fleet.findMany({
                where: { assignedUserId: user.userId },
                select: {
                    id: true,
                    carNumber: true,
                    carType: true,
                    status: true,
                    stadiumId: true,
                    stadium: { select: { name: true } },
                    departmentId: true,
                    department: { select: { name: true } },
                },
                orderBy: { carNumber: 'asc' },
            });

            userAssignedCarts = assigned.map(cart => ({
                id: cart.id,
                carNumber: cart.carNumber,
                carType: cart.carType,
                status: cart.status,
                stadiumId: cart.stadiumId,
                stadiumName: cart.stadium.name,
                departmentId: cart.departmentId || undefined,
                departmentName: cart.department?.name || undefined,
            }));
        }

        // Get recent activity (last 50 actions)
        const activityWhere: any = {};
        if (user.role === 'Admin' && user.stadiumId) {
            activityWhere.fleet = { stadiumId: user.stadiumId };
        } else if (user.role === 'FA') {
            activityWhere.userId = user.userId;
        }

        const recentLogs = await prisma.handoverLog.findMany({
            where: activityWhere,
            include: {
                fleet: { include: { stadium: { select: { name: true } } } },
                user: { select: { name: true } },
            },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });

        const recentActivity = recentLogs.map(log => ({
            id: log.id,
            action: log.action,
            carNumber: log.fleet?.carNumber || 'Unknown',
            userName: log.user?.name || 'Unknown',
            timestamp: log.timestamp,
            stadiumName: log.fleet?.stadium?.name || 'Unknown',
        }));

        return {
            stadiums: filteredStadiums,
            userAssignedCarts,
            recentActivity,
        };
    }

    /**
     * Get carts available in pool for a specific stadium
     * Available = carts with status 'Available' or 'Assigned' (not dispatched)
     */
    async getAvailableInPool(stadiumId: string, user: { userId: string; role: string; departmentId?: string }) {
        const where: any = {
            stadiumId,
            status: { in: ['Available', 'Assigned'] },
        };

        // FA users can only see carts from their department or unassigned
        if (user.role === 'FA' && user.departmentId) {
            where.OR = [
                { departmentId: user.departmentId },
                { departmentId: null }, // Unassigned carts are available to all FA
            ];
        }

        return prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                assignedUser: { select: { id: true, name: true, phone: true, email: true, role: true } },
            },
            orderBy: { carNumber: 'asc' },
        });
    }

    /**
     * Get carts currently in use (dispatched) for a specific stadium
     */
    async getInUse(stadiumId: string, user: { userId: string; role: string }) {
        const where: any = {
            stadiumId,
            status: 'Dispatched',
        };

        // FA users can only see their own dispatched carts
        if (user.role === 'FA') {
            where.assignedUserId = user.userId;
        }

        return prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                assignedUser: { select: { id: true, name: true, phone: true, email: true, role: true } },
            },
            orderBy: { carNumber: 'asc' },
        });
    }
}

export const handoverService = new HandoverService();
