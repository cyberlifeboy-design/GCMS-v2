import { PrismaClient, Fleet } from '@prisma/client';
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

export class FleetService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAll(filters: {
        stadiumId?: string;
        faTrigram?: string;
        status?: string;
    }, pagination?: PaginationParams): Promise<PaginatedResult<Fleet>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where = {
            ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            ...(filters.faTrigram && { assignedToFA: filters.faTrigram }),
            ...(filters.status && { status: filters.status }),
        };

        const [data, total] = await Promise.all([
            this.prisma.fleet.findMany({
                where,
                include: { stadium: true },
                skip,
                take: limit,
                orderBy: { unitNumber: 'asc' },
            }),
            this.prisma.fleet.count({ where }),
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

    async getById(id: string) {
        return this.prisma.fleet.findUnique({
            where: { id },
            include: {
                stadium: true,
            },
        });
    }

    async create(data: {
        unitNumber: string;
        carType: string;
        keyId: string;
        keyColorCode: string;
        status: string;
        vapsPermit?: string;
        stadiumId: string;
        assignedToFA?: string;
    }) {
        return this.prisma.fleet.create({
            data,
        });
    }

    async update(id: string, data: Partial<{
        unitNumber: string;
        carType: string;
        keyId: string;
        keyColorCode: string;
        status: string;
        vapsPermit: string;
        stadiumId: string;
        assignedToFA: string;
    }>) {
        return this.prisma.fleet.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        return this.prisma.fleet.delete({
            where: { id },
        });
    }

    async getAvailableByFA(faTrigram: string, stadiumId?: string) {
        return this.prisma.fleet.findMany({
            where: {
                assignedToFA: faTrigram,
                status: 'Ready',
                ...(stadiumId && { stadiumId }),
            },
            include: {
                stadium: true,
            },
        });
    }
}

export const fleetService = new FleetService();
