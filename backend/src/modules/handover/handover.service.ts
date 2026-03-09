import { prisma } from '../../config/database';

export class HandoverService {
    async checkIn(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
    }) {
        const vehicle = await prisma.fleet.findUnique({ where: { id: data.fleetId } });
        if (!vehicle) throw new Error('Vehicle not found');

        const allowedStatuses = ['Available', 'Assigned'];
        if (!allowedStatuses.includes(vehicle.status)) {
            throw new Error(`Vehicle is not available for check-in (Current status: ${vehicle.status})`);
        }

        await prisma.$transaction(async (tx) => {
            await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedIn',
                    conditionNotes: data.conditionNotes,
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: 'Dispatched' },
            });
        });

        // Fetch the created log with relations after transaction completes
        const log = await prisma.handoverLog.findFirst({
            where: {
                fleetId: data.fleetId,
                userId: data.userId,
                action: 'CheckedIn',
            },
            orderBy: { timestamp: 'desc' },
            include: {
                fleet: { select: { id: true, carNumber: true, carType: true, status: true } },
                user: { select: { id: true, name: true, email: true } },
            },
        });

        return log;
    }

    async checkOut(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
        hasIssue?: boolean;
        issueDescription?: string;
        photosUrls?: string[];
    }) {
        const vehicle = await prisma.fleet.findUnique({ where: { id: data.fleetId } });
        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'Dispatched') {
            throw new Error(`Vehicle is not Dispatched (Current status: ${vehicle.status})`);
        }

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedOut',
                    conditionNotes: data.conditionNotes,
                    photosUrls: data.photosUrls || [],
                },
                include: {
                    fleet: { select: { carNumber: true, carType: true } },
                    user: { select: { name: true } },
                },
            });

            const nextStatus = data.hasIssue ? 'Under Maintenance' : 'Available';
            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: nextStatus },
            });

            // Create maintenance log if issue reported
            if (data.hasIssue && data.issueDescription) {
                await tx.maintenanceLog.create({
                    data: {
                        fleetId: data.fleetId,
                        reportedById: data.userId,
                        issueDescription: data.issueDescription,
                        photosUrls: data.photosUrls || [],
                        status: 'Open',
                    },
                });
                await tx.handoverLog.create({
                    data: {
                        fleetId: data.fleetId,
                        userId: data.userId,
                        action: 'IssueReported',
                        conditionNotes: data.issueDescription,
                        photosUrls: data.photosUrls || [],
                    },
                });
            }

            return log;
        });
    }

    async bulkCheckIn(fleetIds: string[], userId: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };

        for (const fleetId of fleetIds) {
            try {
                await this.checkIn({ fleetId, userId });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async bulkCheckOut(fleetIds: string[], userId: string, conditionNotes?: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };

        for (const fleetId of fleetIds) {
            try {
                await this.checkOut({ fleetId, userId, conditionNotes });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async getHistory(filters: {
        stadiumId?: string;
        userId?: string;
        fleetId?: string;
        action?: string;
    }, pagination?: { page?: number; limit?: number }) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.action && { action: filters.action }),
        };

        if (filters.stadiumId) {
            where.fleet = { stadiumId: filters.stadiumId };
        }

        const [data, total] = await Promise.all([
            prisma.handoverLog.findMany({
                where,
                include: {
                    fleet: {
                        include: { stadium: { select: { id: true, name: true } } },
                    },
                    user: { select: { id: true, name: true, email: true, role: true } },
                },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
            }),
            prisma.handoverLog.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }
}

export const handoverService = new HandoverService();
