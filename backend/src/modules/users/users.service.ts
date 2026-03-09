import { prisma } from '../../config/database';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export interface PaginationParams {
    page?: number;
    limit?: number;
}

function generateSecurePassword(): string {
    // Generate a secure random password: 12 chars, mixed case, numbers, symbols
    const length = 16;
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    const all = lowercase + uppercase + numbers + symbols;

    let password = '';
    // Ensure at least one of each type
    password += lowercase[crypto.randomInt(0, lowercase.length)];
    password += uppercase[crypto.randomInt(0, uppercase.length)];
    password += numbers[crypto.randomInt(0, numbers.length)];
    password += symbols[crypto.randomInt(0, symbols.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
        password += all[crypto.randomInt(0, all.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => crypto.randomInt(0, 2) - 1).join('');
}

export class UsersService {
    async getAll(filters: {
        role?: string;
        stadiumId?: string;
        isActive?: boolean;
    }, pagination?: PaginationParams) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.role && { role: filters.role }),
            ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            ...(filters.isActive !== undefined && { isActive: filters.isActive }),
        };

        const [data, total] = await Promise.all([
            prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    phone: true,
                    isActive: true,
                    stadiumId: true,
                    stadium: { select: { id: true, name: true } },
                    createdAt: true,
                },
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            prisma.user.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async getById(id: string) {
        return prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                isActive: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true } },
                createdAt: true,
            },
        });
    }

    async create(data: {
        name: string;
        email: string;
        password?: string;
        role: string;
        phone?: string;
        stadiumId?: string;
    }) {
        const exists = await prisma.user.findUnique({ where: { email: data.email } });
        if (exists) throw new Error('User with this email already exists');

        // Use provided password or generate a secure random one
        const password = data.password || generateSecurePassword();
        const passwordHash = await bcrypt.hash(password, 10);
        return prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash,
                role: data.role,
                phone: data.phone,
                stadiumId: data.stadiumId,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                isActive: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true } },
                createdAt: true,
            },
        });
    }

    async update(id: string, data: Partial<{
        name: string;
        email: string;
        role: string;
        phone: string;
        stadiumId: string;
        isActive: boolean;
    }>) {
        return prisma.user.update({
            where: { id },
            data,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                isActive: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true } },
                updatedAt: true,
            },
        });
    }

    async setActive(id: string, isActive: boolean) {
        return prisma.user.update({
            where: { id },
            data: { isActive },
            select: { id: true, name: true, isActive: true },
        });
    }

    async delete(id: string) {
        return prisma.user.delete({ where: { id } });
    }

    async bulkCreate(users: Array<{
        name: string;
        email: string;
        password?: string;
        role: string;
        phone?: string;
        stadiumId?: string;
    }>) {
        const results = { created: 0, skipped: 0, errors: [] as string[] };
        for (const u of users) {
            try {
                // create() now auto-generates secure password if not provided
                await this.create(u);
                results.created++;
            } catch (err: any) {
                if (err.message.includes('already exists')) {
                    results.skipped++;
                } else {
                    results.errors.push(`${u.email}: ${err.message}`);
                }
            }
        }
        return results;
    }
}

export const usersService = new UsersService();
