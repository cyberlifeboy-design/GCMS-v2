import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuditLogFilters, HandoverFilters, MaintenanceFilters } from '../../types';

interface ActivityLog {
    action: string;
    createdAt: Date;
}

export class ReportsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAuditLogs(filters: AuditLogFilters) {
        return this.prisma.auditLog.findMany({
            where: {
                ...(filters.userId && { userId: filters.userId }),
                ...(filters.action && { action: filters.action }),
                ...(filters.entityType && { entityType: filters.entityType }),
                ...(filters.startDate && filters.endDate && {
                    timestamp: {
                        gte: filters.startDate,
                        lte: filters.endDate,
                    },
                }),
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    async getHandoverReports(filters: HandoverFilters) {
        const where: any = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.action && { action: filters.action }),
            ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            ...(filters.startDate && filters.endDate && {
                timestamp: {
                    gte: filters.startDate,
                    lte: filters.endDate,
                },
            }),
        };

        return this.prisma.handoverLog.findMany({
            where,
            include: {
                fleet: true,
                user: { select: { name: true, email: true } },
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    async getMaintenanceReports(filters: MaintenanceFilters) {
        const where: any = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.reportedById && { reportedById: filters.reportedById }),
            ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
        };

        return this.prisma.maintenanceLog.findMany({
            where,
            include: {
                fleet: true,
            },
            orderBy: { reportedAt: 'desc' },
        });
    }

    async getDashboardStats(filters: { stadiumId?: string } = {}) {
        const where = filters.stadiumId ? { stadiumId: filters.stadiumId } : {};

        // 1. Fleet Overview by Type
        const fleetByType = await this.prisma.fleet.groupBy({
            by: ['carType'],
            where,
            _count: { _all: true },
        });

        // 2. Cart Status Summary
        const fleetByStatus = await this.prisma.fleet.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
        });

        // 3. Active Users
        const activeUsersCount = await this.prisma.user.count({
            where: {
                role: 'FA',
                isActive: true,
                ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            },
        });

        // 4. Activity Timeline
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activityLogs = await this.prisma.handoverLog.findMany({
            where: {
                createdAt: { gte: sevenDaysAgo },
                ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            },
            select: { action: true, createdAt: true },
        });

        // 5. Open Issues Log
        const openIssuesCount = await this.prisma.maintenanceLog.count({
            where: {
                status: { in: ['Open', 'InProgress'] },
                ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            },
        });

        // 6. VAP Carts Summary
        const vapCarts = await this.prisma.fleet.count({
            where: {
                ...where,
                requiresVAP: true,
            },
        });

        return {
            fleetByType: fleetByType.map(f => ({ type: f.carType, count: f._count._all })),
            fleetByStatus: fleetByStatus.map(f => ({ status: f.status, count: f._count._all })),
            activeUsersCount,
            openIssuesCount,
            vapCartsCount: vapCarts,
            activityTimeline: this.processActivityTimeline(activityLogs),
        };
    }

    private processActivityTimeline(logs: ActivityLog[]) {
        const timeline: Record<string, { checkIn: number, checkOut: number }> = {};

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            timeline[dateStr] = { checkIn: 0, checkOut: 0 };
        }

        logs.forEach(log => {
            const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
            if (timeline[dateStr]) {
                if (log.action === 'CheckedIn') timeline[dateStr].checkIn++;
                else if (log.action === 'CheckedOut') timeline[dateStr].checkOut++;
            }
        });

        return Object.entries(timeline).map(([date, counts]) => ({ date, ...counts }));
    }

    async getFleetList(filters: { stadiumId?: string } = {}) {
        const where = filters.stadiumId ? { stadiumId: filters.stadiumId } : {};

        return this.prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true } },
            },
            orderBy: { carNumber: 'asc' },
        });
    }
}

export const reportsService = new ReportsService();
