import { prisma } from '../../config/database';
import crypto from 'crypto';
import { notificationService } from '../notifications/notification.service';

export interface CreatePoolBookingRequestData {
    stadiumId: string;
    fleetId: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    faUserId: string;
    bookingType: 'Single' | 'Recurring';
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    createdById?: string;
}

export interface AmendPoolBookingRequestData {
    fleetId?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    faUserId?: string;
    status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
}

const BOOKING_INCLUDE = {
    stadium: { select: { id: true, name: true, code: true } },
    fleet: { select: { id: true, carNumber: true, carType: true } },
    faUser: { select: { id: true, name: true } },
    reviewedBy: { select: { id: true, name: true } },
    createdByUser: { select: { id: true, name: true } },
};

export class PoolBookingRequestsService {
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Pool carts at a venue with no *Approved* booking overlapping the given window.
     */
    async getAvailableCarts(
        stadiumId: string,
        startDate: string,
        endDate: string,
        startTime: string,
        endTime: string,
        excludeBookingId?: string,
    ) {
        const carts = await prisma.fleet.findMany({
            where: { stadiumId, isPool: true },
            select: { id: true, carNumber: true, carType: true },
            orderBy: { carNumber: 'asc' },
        });
        if (carts.length === 0) return [];

        const overlapping = await prisma.poolBookingRequest.findMany({
            where: {
                fleetId: { in: carts.map((c) => c.id) },
                status: 'Approved',
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            },
            select: { fleetId: true, startDate: true, endDate: true, startTime: true, endTime: true },
        });

        const busyFleetIds = new Set(
            overlapping
                .filter(
                    (b) =>
                        startDate <= b.endDate &&
                        endDate >= b.startDate &&
                        startTime < b.endTime &&
                        endTime > b.startTime,
                )
                .map((b) => b.fleetId),
        );

        return carts.filter((c) => !busyFleetIds.has(c.id));
    }

    async getFAsForStadium(stadiumId: string) {
        return prisma.user.findMany({
            where: { stadiumId, role: 'FA', isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Finds an existing Approved booking on the same cart whose date range and
     * daily time window overlap the given one. Returns null if there's no conflict.
     */
    async findConflict(
        fleetId: string,
        startDate: string,
        endDate: string,
        startTime: string,
        endTime: string,
        excludeId?: string,
    ) {
        const candidates = await prisma.poolBookingRequest.findMany({
            where: {
                fleetId,
                status: 'Approved',
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            include: BOOKING_INCLUDE,
        });
        return (
            candidates.find(
                (b) =>
                    startDate <= b.endDate &&
                    endDate >= b.startDate &&
                    startTime < b.endTime &&
                    endTime > b.startTime,
            ) || null
        );
    }

    /**
     * Cross-field integrity: the chosen cart must be a pool cart at the chosen venue.
     * Without this a crafted request could pair venue A's stadiumId with venue B's
     * cart, which venue-scoped RBAC would then treat as venue A's booking.
     */
    private async assertFleetBelongsToStadium(fleetId: string, stadiumId: string) {
        const fleet = await prisma.fleet.findUnique({
            where: { id: fleetId },
            select: { id: true, stadiumId: true, isPool: true },
        });
        if (!fleet || fleet.stadiumId !== stadiumId || !fleet.isPool) {
            throw new Error("Selected cart does not belong to this venue's pool");
        }
    }

    /** Cross-field integrity: the chosen FA must be an FA assigned to the chosen venue. */
    private async assertFABelongsToStadium(faUserId: string, stadiumId: string) {
        const user = await prisma.user.findUnique({
            where: { id: faUserId },
            select: { id: true, role: true, stadiumId: true },
        });
        if (!user || user.role !== 'FA' || user.stadiumId !== stadiumId) {
            throw new Error('Selected FA is not assigned to this venue');
        }
    }

    async create(data: CreatePoolBookingRequestData) {
        await this.assertFleetBelongsToStadium(data.fleetId, data.stadiumId);
        await this.assertFABelongsToStadium(data.faUserId, data.stadiumId);

        const requestToken = this.generateRequestToken();

        const booking = await prisma.poolBookingRequest.create({
            data: {
                stadiumId: data.stadiumId,
                fleetId: data.fleetId,
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                requesterPhone: data.requesterPhone,
                faUserId: data.faUserId,
                bookingType: data.bookingType,
                startDate: data.startDate,
                endDate: data.endDate,
                startTime: data.startTime,
                endTime: data.endTime,
                purpose: data.purpose,
                requestToken,
                createdById: data.createdById,
                status: 'Pending',
            },
            include: BOOKING_INCLUDE,
        });

        const message = `${data.requesterName} requested ${booking.fleet.carNumber} at ${booking.stadium.name}`;
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Pool Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['Admin'],
            data.stadiumId,
        );
        // SuperAdmins typically have no stadiumId set, so notify them without a stadium filter.
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Pool Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['SuperAdmin'],
        );

        return booking;
    }

    async getByToken(token: string) {
        return prisma.poolBookingRequest.findUnique({ where: { requestToken: token }, include: BOOKING_INCLUDE });
    }

    async getById(id: string) {
        return prisma.poolBookingRequest.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    }

    async getAll(filters: { status?: string; stadiumId?: string }) {
        const where: Record<string, unknown> = {};
        if (filters.status) where.status = filters.status;
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        return prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
    }

    async approve(id: string, reviewedById: string, reviewComment?: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Pending') throw new Error('Booking has already been reviewed');

        const conflict = await this.findConflict(
            existing.fleetId,
            existing.startDate,
            existing.endDate,
            existing.startTime,
            existing.endTime,
            existing.id,
        );
        if (conflict) {
            const err = new Error('This cart already has an approved booking that overlaps this date/time') as Error & { status: number; conflict: unknown };
            err.status = 409;
            err.conflict = conflict;
            throw err;
        }

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: { status: 'Approved', reviewedById, reviewedAt: new Date(), reviewComment },
            include: BOOKING_INCLUDE,
        });

        if (updated.createdById) {
            await notificationService.create({
                type: 'PoolBookingApproved',
                title: 'Pool Booking Approved',
                message: `Your pool booking for ${updated.fleet.carNumber} at ${updated.stadium.name} was approved`,
                entityType: 'PoolBookingRequest',
                entityId: id,
                userId: updated.createdById,
            });
        }

        return updated;
    }

    async reject(id: string, reviewedById: string, reviewComment: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Pending') throw new Error('Booking has already been reviewed');

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: { status: 'Rejected', reviewedById, reviewedAt: new Date(), reviewComment },
            include: BOOKING_INCLUDE,
        });

        if (updated.createdById) {
            await notificationService.create({
                type: 'PoolBookingRejected',
                title: 'Pool Booking Rejected',
                message: `Your pool booking for ${updated.fleet.carNumber} at ${updated.stadium.name} was rejected`,
                entityType: 'PoolBookingRequest',
                entityId: id,
                userId: updated.createdById,
            });
        }

        return updated;
    }

    async amend(id: string, data: AmendPoolBookingRequestData, reviewedById: string, reviewComment?: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');

        // amend can't move a booking to another venue, so any replacement cart/FA
        // must belong to the booking's existing venue.
        if (data.fleetId) await this.assertFleetBelongsToStadium(data.fleetId, existing.stadiumId);
        if (data.faUserId) await this.assertFABelongsToStadium(data.faUserId, existing.stadiumId);

        const merged = { ...existing, ...data };

        if (merged.status === 'Approved') {
            const conflict = await this.findConflict(
                merged.fleetId,
                merged.startDate,
                merged.endDate,
                merged.startTime,
                merged.endTime,
                id,
            );
            if (conflict) {
                const err = new Error('This cart already has an approved booking that overlaps this date/time') as Error & { status: number; conflict: unknown };
                err.status = 409;
                err.conflict = conflict;
                throw err;
            }
        }

        // Reviewer metadata records a formal review decision, so it is only stamped
        // when the caller is actually changing the review status. A plain
        // schedule/cart/FA edit on a still-Pending booking leaves reviewedById,
        // reviewedAt and reviewComment untouched.
        const reviewFields =
            data.status !== undefined
                ? {
                      reviewedById,
                      reviewedAt: new Date(),
                      ...(reviewComment !== undefined ? { reviewComment } : {}),
                  }
                : {};

        return prisma.poolBookingRequest.update({
            where: { id },
            data: {
                ...data,
                ...reviewFields,
            },
            include: BOOKING_INCLUDE,
        });
    }
}

export const poolBookingRequestsService = new PoolBookingRequestsService();
