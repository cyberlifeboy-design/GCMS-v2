import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';

export class ReportsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAuditLogs(filters: any) {
        return this.prisma.auditLog.findMany({
            where: filters,
            orderBy: { timestamp: 'desc' },
        });
    }

    async getHandoverReports(filters: any) {
        return this.prisma.handoverLog.findMany({
            where: filters,
            include: {
                fleet: true,
                user: { select: { name: true, email: true } },
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    async getMaintenanceReports(filters: any) {
        return this.prisma.maintenanceLog.findMany({
            where: filters,
            include: {
                fleet: true,
            },
            orderBy: { reportedAt: 'desc' },
        });
    }

    async getUtilizationStats() {
        const totalFleet = await this.prisma.fleet.count();
        const inUse = await this.prisma.fleet.count({ where: { status: 'In-Use' } });
        const maintenance = await this.prisma.fleet.count({ where: { status: 'Maintenance' } });
        const ready = await this.prisma.fleet.count({ where: { status: 'Ready' } });

        return {
            total: totalFleet,
            inUse,
            maintenance,
            ready,
            utilizationRate: totalFleet > 0 ? (inUse / totalFleet) * 100 : 0,
        };
    }
}

export const reportsService = new ReportsService();
