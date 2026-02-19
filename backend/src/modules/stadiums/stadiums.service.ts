import { PrismaClient, Stadium } from '@prisma/client';
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

export class StadiumsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAll(pagination?: PaginationParams): Promise<PaginatedResult<Stadium>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.stadium.findMany({
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.stadium.count(),
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
        return this.prisma.stadium.findUnique({
            where: { id },
            include: {
                fleet: true,
                users: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                    },
                },
            },
        });
    }

    async create(data: {
        name: string;
        code: string;
        location: string;
    }) {
        // Check if code already exists
        const existing = await this.prisma.stadium.findUnique({
            where: { code: data.code },
        });

        if (existing) {
            throw new Error('Stadium with this code already exists');
        }

        return this.prisma.stadium.create({
            data,
        });
    }

    async update(id: string, data: Partial<{
        name: string;
        code: string;
        location: string;
    }>) {
        return this.prisma.stadium.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        // Check if stadium has associated fleet or users
        const stadium = await this.prisma.stadium.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { fleet: true, users: true },
                },
            },
        });

        if (stadium && (stadium._count.fleet > 0 || stadium._count.users > 0)) {
            throw new Error('Cannot delete stadium with associated fleet or users');
        }

        return this.prisma.stadium.delete({
            where: { id },
        });
    }
}

export const stadiumsService = new StadiumsService();