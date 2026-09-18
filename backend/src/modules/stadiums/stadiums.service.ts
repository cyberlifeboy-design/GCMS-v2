import { PrismaClient, Stadium } from '@prisma/client';
import { prisma } from '../../config/database';
import { resolveMapsLinkCoords } from '../../services/geocode.service';
import { usersService } from '../users/users.service';
import { resolveVenueAdminAssignment } from './venue-admin-assignment';

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
        latitude?: number | null;
        longitude?: number | null;
    }) {
        // Check if code already exists
        const existing = await this.prisma.stadium.findUnique({
            where: { code: data.code },
        });

        if (existing) {
            throw new Error('Stadium with this code already exists');
        }

        // The venue's location is entered as a pasted Google Maps share link — derive the
        // marker coordinate from it unless the caller already pinned one explicitly.
        let { latitude, longitude } = data;
        if (latitude == null && longitude == null) {
            const resolved = await resolveMapsLinkCoords(data.location);
            if (resolved) ({ latitude, longitude } = resolved);
        }

        return this.prisma.stadium.create({
            data: { ...data, latitude, longitude },
        });
    }

    async update(id: string, data: Partial<{
        name: string;
        code: string;
        location: string;
        isActive: boolean;
        latitude: number | null;
        longitude: number | null;
    }>) {
        const patch = { ...data };
        if (patch.location && patch.latitude === undefined && patch.longitude === undefined) {
            const resolved = await resolveMapsLinkCoords(patch.location);
            if (resolved) { patch.latitude = resolved.latitude; patch.longitude = resolved.longitude; }
        }
        return this.prisma.stadium.update({
            where: { id },
            data: patch,
        });
    }

    /** SuperAdmin convenience action: turn a name+email into this venue's Admin,
     * reusing the same temp-password/welcome-email path a fresh user create goes through. */
    async assignAdmin(stadiumId: string, data: { name: string; email: string }) {
        const stadium = await this.prisma.stadium.findUnique({ where: { id: stadiumId }, select: { id: true } });
        if (!stadium) throw new Error('Stadium not found');

        const existingUser = await this.prisma.user.findUnique({
            where: { email: data.email },
            select: { id: true, role: true },
        });

        const decision = resolveVenueAdminAssignment(existingUser);
        if (decision.action === 'blocked') throw new Error(decision.reason);

        if (decision.action === 'promote') {
            const user = await usersService.update(decision.userId, { name: data.name, role: 'Admin', stadiumId });
            return { user, promoted: true };
        }

        const user = await usersService.create({ name: data.name, email: data.email, role: 'Admin', stadiumId });
        return { user, promoted: false };
    }

    async getPoolBookingHours(id: string) {
        const stadium = await this.prisma.stadium.findUnique({
            where: { id },
            select: { id: true, name: true, poolBookingStartTime: true, poolBookingEndTime: true },
        });
        if (!stadium) throw new Error('Stadium not found');
        return stadium;
    }

    async updatePoolBookingHours(id: string, data: { poolBookingStartTime: string | null; poolBookingEndTime: string | null }) {
        // Pre-check so a bad id yields a clean 'Stadium not found' (matching
        // getPoolBookingHours) instead of a raw Prisma P2025 message.
        const existing = await this.prisma.stadium.findUnique({ where: { id }, select: { id: true } });
        if (!existing) throw new Error('Stadium not found');

        return this.prisma.stadium.update({
            where: { id },
            data,
            select: { id: true, name: true, poolBookingStartTime: true, poolBookingEndTime: true },
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
            const resolved = await resolveMapsLinkCoords(venue.location);
            await this.prisma.stadium.create({ data: { ...venue, ...resolved } });
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