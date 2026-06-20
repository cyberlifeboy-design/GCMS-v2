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

export interface FleetStats {
    total: number;
    cargo: number;
    fourSeater: number;
    sixSeater: number;
    accessibility: number;
}

export interface StadiumWithFleetStats extends Stadium {
    fleetStats: FleetStats;
}

export class StadiumsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAll(pagination?: PaginationParams): Promise<PaginatedResult<StadiumWithFleetStats>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const [stadiums, total] = await Promise.all([
            this.prisma.stadium.findMany({
                orderBy: { name: 'asc' },
                skip,
                take: limit,
            }),
            this.prisma.stadium.count(),
        ]);

        // Get fleet counts per stadium
        const stadiumIds = stadiums.map(s => s.id);
        const fleetCounts = await this.prisma.fleet.groupBy({
            by: ['stadiumId', 'carType'],
            _count: { id: true },
            where: { stadiumId: { in: stadiumIds } },
        });

        // Build a map of stadiumId -> fleet stats
        const fleetStatsMap = new Map<string, FleetStats>();
        for (const stadium of stadiums) {
            fleetStatsMap.set(stadium.id, { total: 0, cargo: 0, fourSeater: 0, sixSeater: 0, accessibility: 0 });
        }

        for (const count of fleetCounts) {
            const stats = fleetStatsMap.get(count.stadiumId);
            if (stats) {
                stats.total += count._count.id;
                const carType = count.carType.toLowerCase();
                if (carType === 'cargo') stats.cargo += count._count.id;
                else if (carType === '4-seater' || carType === '4seater') stats.fourSeater += count._count.id;
                else if (carType === '6-seater' || carType === '6seater') stats.sixSeater += count._count.id;
                else if (carType === 'accessibility') stats.accessibility += count._count.id;
            }
        }

        // Attach fleet stats to each stadium
        const data: StadiumWithFleetStats[] = stadiums.map(stadium => ({
            ...stadium,
            fleetStats: fleetStatsMap.get(stadium.id)!,
        }));

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
        isActive: boolean;
    }>) {
        return this.prisma.stadium.update({
            where: { id },
            data,
        });
    }

    async bulkCreate(venues: { name: string; code: string; location: string }[]): Promise<{ created: number; skipped: number; details: { name: string; code: string; status: 'created' | 'skipped' }[] }> {
        const existing = await this.prisma.stadium.findMany({ select: { code: true } });
        const existingCodes = new Set(existing.map(s => s.code.toUpperCase()));

        const details: { name: string; code: string; status: 'created' | 'skipped' }[] = [];
        let created = 0;

        for (const venue of venues) {
            if (existingCodes.has(venue.code.toUpperCase())) {
                details.push({ name: venue.name, code: venue.code, status: 'skipped' });
                continue;
            }
            await this.prisma.stadium.create({ data: venue });
            details.push({ name: venue.name, code: venue.code, status: 'created' });
            created++;
        }

        return { created, skipped: venues.length - created, details };
    }

    async delete(id: string) {
        // Check if stadium has associated data
        const stadium = await this.prisma.stadium.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { fleet: true, users: true },
                },
                departments: {
                    include: {
                        _count: { select: { users: true, fleet: true } },
                    },
                },
            },
        });

        if (!stadium) {
            throw new Error('Stadium not found');
        }

        if (stadium._count.fleet > 0 || stadium._count.users > 0) {
            throw new Error(`Cannot delete stadium with ${stadium._count.fleet} carts and ${stadium._count.users} users assigned. Make it inactive instead.`);
        }

        // Check if any departments have users or carts
        const deptWithData = stadium.departments.find(d => d._count.users > 0 || d._count.fleet > 0);
        if (deptWithData) {
            throw new Error(`Cannot delete stadium: department "${deptWithData.name}" has associated users or carts. Make it inactive instead.`);
        }

        // Cascade delete empty departments first
        if (stadium.departments.length > 0) {
            await this.prisma.department.deleteMany({
                where: { stadiumId: id },
            });
        }

        return this.prisma.stadium.delete({
            where: { id },
        });
    }
}

export const stadiumsService = new StadiumsService();