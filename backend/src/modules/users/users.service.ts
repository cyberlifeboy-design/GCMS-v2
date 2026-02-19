import { PrismaClient, User } from '@prisma/client';
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

export class UsersService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAll(pagination?: PaginationParams): Promise<PaginatedResult<User>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                include: { stadium: true },
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.user.count(),
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
        return this.prisma.user.findUnique({
            where: { id },
            include: {
                stadium: true,
            },
        });
    }

    async update(id: string, data: Partial<{
        name: string;
        email: string;
        role: string;
        faTrigram: string;
        stadiumId: string;
        accreditationId: string;
    }>) {
        return this.prisma.user.update({
            where: { id },
            data,
        });
    }

    async delete(id: string) {
        return this.prisma.user.delete({
            where: { id },
        });
    }

    async bulkCreate(users: any[]) {
        const bcrypt = await import('bcrypt');
        const saltRounds = 10;

        // Destructure to exclude password from spread, preventing it from being stored
        const hashedUsers = await Promise.all(
            users.map(async ({ password, ...userData }) => ({
                ...userData,
                passwordHash: await bcrypt.hash(password || 'welcome123', saltRounds),
            }))
        );

        return this.prisma.user.createMany({
            data: hashedUsers,
            skipDuplicates: true,
        });
    }
}

export const usersService = new UsersService();
