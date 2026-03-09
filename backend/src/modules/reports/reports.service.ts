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
        const available = await this.prisma.fleet.count({ where: { status: 'Available' } });
        const assigned = await this.prisma.fleet.count({ where: { status: 'Assigned' } });
        const dispatched = await this.prisma.fleet.count({ where: { status: 'Dispatched' } });
        const underMaintenance = await this.prisma.fleet.count({ where: { status: 'Under Maintenance' } });

        return {
            total: totalFleet,
            available,
            assigned,
            dispatched,
            underMaintenance,
            utilizationRate: totalFleet > 0 ? ((dispatched + assigned) / totalFleet) * 100 : 0,
        };
    }
}

export const reportsService = new ReportsService();
