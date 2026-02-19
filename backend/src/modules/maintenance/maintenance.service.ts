import { PrismaClient, MaintenanceLog } from '@prisma/client';
import { prisma } from '../../config/database';

export interface PaginationParams {
    page?: number;
    limit?: number;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export class MaintenanceService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async reportIssue(data: {
        fleetId: string;
        reportedBy: string;
        issueDescription: string;
    }) {
        return this.prisma.$transaction(async (tx) => {
            const log = await tx.maintenanceLog.create({
                data: {
                    fleetId: data.fleetId,
                    reportedBy: data.reportedBy,
                    issueDescription: data.issueDescription,
                    status: 'Pending',
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: 'Maintenance' },
            });

            return log;
        });
    }

    async assignToContractor(id: string, contractorId: string) {
        return this.prisma.maintenanceLog.update({
            where: { id },
            data: {
                contractorId,
                status: 'InProgress',
            },
        });
    }

    async reportFix(id: string, data: { fixDescription: string }) {
        return this.prisma.$transaction(async (tx) => {
            const log = await tx.maintenanceLog.update({
                where: { id },
                data: {
                    fixDescription: data.fixDescription,
                    fixedAt: new Date(),
                    status: 'Fixed',
                },
            });

            await tx.fleet.update({
                where: { id: log.fleetId },
                data: { status: 'Ready' },
            });

            return log;
        });
    }

    async getPendingTasks(contractorId?: string, pagination?: PaginationParams): Promise<PaginatedResult<MaintenanceLog>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where = {
            status: { in: ['Pending', 'InProgress'] },
            ...(contractorId && { contractorId }),
        };

        const [data, total] = await Promise.all([
            this.prisma.maintenanceLog.findMany({
                where,
                include: {
                    fleet: { include: { stadium: true } },
                },
                orderBy: { reportedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.maintenanceLog.count({ where }),
        ]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async getHistoryByFleet(fleetId: string, pagination?: PaginationParams): Promise<PaginatedResult<MaintenanceLog>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where = { fleetId };

        const [data, total] = await Promise.all([
            this.prisma.maintenanceLog.findMany({
                where,
                orderBy: { reportedAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.maintenanceLog.count({ where }),
        ]);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
}

export const maintenanceService = new MaintenanceService();
