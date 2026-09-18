import { prisma } from '../../config/database';
import crypto from 'crypto';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';
import { deriveBookingState } from './booking-state';

export interface CreatePoolBookingRequestData {
    stadiumId: string;
    fleetId: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    departmentId: string;
    bookingType: 'Single';
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    createdById?: string;
}

export interface CreateInstantBookingRequestData {
    stadiumId: string;
    fleetId: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    departmentId: string;
    purpose?: string;
    createdById?: string;
}

export interface BookingSlot {
    date: string; // "YYYY-MM-DD"
    startTime: string; // "HH:mm"
    endTime: string; // "HH:mm"
}

export interface CreateRecurringBookingRequestData {
    stadiumId: string;
    fleetId: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    departmentId: string;
    purpose?: string;
    createdById?: string;
    slots: BookingSlot[];
}

const INSTANT_COLLECTION_WINDOW_MINUTES = 10;

function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    faUser: { select: { id: true, name: true, accreditationNumber: true, phone: true } },
    department: { select: { id: true, name: true, code: true, focalPointName: true, focalPointEmail: true } },
    reviewedBy: { select: { id: true, name: true } },
    returnedBy: { select: { id: true, name: true } },
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

    /**
     * Same as getAvailableCarts, but for a Recurring booking made of several
     * independent date/time slots that must all share ONE cart. A cart is only
     * "available" here if it's free for EVERY slot (intersection) — i.e. excluded
     * as soon as it's busy for any single slot.
     */
    async getAvailableCartsForSlots(stadiumId: string, slots: { startDate: string; endDate: string; startTime: string; endTime: string }[]) {
        const carts = await prisma.fleet.findMany({
            where: { stadiumId, isPool: true },
            select: { id: true, carNumber: true, carType: true },
            orderBy: { carNumber: 'asc' },
        });
        if (carts.length === 0 || slots.length === 0) return [];

        const overlapping = await prisma.poolBookingRequest.findMany({
            where: { fleetId: { in: carts.map((c) => c.id) }, status: 'Approved' },
            select: { fleetId: true, startDate: true, endDate: true, startTime: true, endTime: true },
        });

        const busyFleetIds = new Set(
            overlapping
                .filter((b) =>
                    slots.some(
                        (s) =>
                            s.startDate <= b.endDate &&
                            s.endDate >= b.startDate &&
                            s.startTime < b.endTime &&
                            s.endTime > b.startTime,
                    ),
                )
                .map((b) => b.fleetId),
        );

        return carts.filter((c) => !busyFleetIds.has(c.id));
    }

    /**
     * Pool carts at a venue that are free RIGHT NOW for an instant booking — i.e. not
     * currently the subject of an Approved booking whose window covers this moment.
     * Unlike getAvailableCarts (which checks a chosen future window), this has no
     * window to check against, so it looks at "is any Approved booking active now".
     */
    async getInstantAvailableCarts(stadiumId: string) {
        const carts = await prisma.fleet.findMany({
            where: { stadiumId, isPool: true },
            select: { id: true, carNumber: true, carType: true },
            orderBy: { carNumber: 'asc' },
        });
        if (carts.length === 0) return [];

        const now = new Date();
        const nowDate = formatDate(now);
        const nowTime = formatTime(now);

        const approved = await prisma.poolBookingRequest.findMany({
            where: { fleetId: { in: carts.map((c) => c.id) }, status: 'Approved', returnedAt: null },
            select: { fleetId: true, startDate: true, endDate: true, startTime: true, endTime: true },
        });

        const busyFleetIds = new Set(
            approved
                .filter(
                    (b) =>
                        (nowDate > b.startDate || (nowDate === b.startDate && nowTime >= b.startTime)) &&
                        (nowDate < b.endDate || (nowDate === b.endDate && nowTime <= b.endTime)),
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

    /**
     * Cross-field integrity: the chosen department must be an active department at
     * the chosen venue. Returns the department (with its focal point user id, which
     * may be null — not every department has a linked FA user) so the caller can
     * derive faUserId without a second query.
     */
    private async assertDepartmentBelongsToStadium(departmentId: string, stadiumId: string) {
        const department = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, stadiumId: true, isActive: true, focalPointId: true },
        });
        if (!department || department.stadiumId !== stadiumId || !department.isActive) {
            throw new Error('Selected department is not active at this venue');
        }
        return department;
    }

    /** Admin-only amend path: reassigning a booking's FA directly still needs this — the public form no longer uses it. */
    private async assertFABelongsToStadium(faUserId: string, stadiumId: string) {
        const user = await prisma.user.findUnique({
            where: { id: faUserId },
            select: { id: true, role: true, stadiumId: true },
        });
        if (!user || user.role !== 'FA' || user.stadiumId !== stadiumId) {
            throw new Error('Selected FA is not assigned to this venue');
        }
    }

    /** Throws a 409 shaped like approve()'s conflict error when the cart is already booked (Approved) over this window. */
    private async assertNoApprovedConflict(fleetId: string, startDate: string, endDate: string, startTime: string, endTime: string) {
        const conflict = await this.findConflict(fleetId, startDate, endDate, startTime, endTime);
        if (conflict) {
            const err = new Error(
                `This cart already has an approved booking that overlaps ${startDate}${endDate !== startDate ? `–${endDate}` : ''} ${startTime}–${endTime}`,
            ) as Error & { status: number; conflict: unknown };
            err.status = 409;
            err.conflict = conflict;
            throw err;
        }
    }

    async create(data: CreatePoolBookingRequestData) {
        await this.assertFleetBelongsToStadium(data.fleetId, data.stadiumId);
        const department = await this.assertDepartmentBelongsToStadium(data.departmentId, data.stadiumId);
        await this.assertNoApprovedConflict(data.fleetId, data.startDate, data.endDate, data.startTime, data.endTime);

        const requestToken = this.generateRequestToken();

        const booking = await prisma.poolBookingRequest.create({
            data: {
                stadiumId: data.stadiumId,
                fleetId: data.fleetId,
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                requesterPhone: data.requesterPhone,
                departmentId: data.departmentId,
                faUserId: department.focalPointId,
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

    /**
     * Instant booking: no date/time is chosen — the requester wants a car right now.
     * A wide-open 24h window is stamped so the existing overlap/derived-state logic
     * (built for scheduled bookings) still applies; the real end is whenever an admin
     * marks it returned, exactly like a scheduled booking.
     */
    async createInstant(data: CreateInstantBookingRequestData) {
        await this.assertFleetBelongsToStadium(data.fleetId, data.stadiumId);
        const department = await this.assertDepartmentBelongsToStadium(data.departmentId, data.stadiumId);
        // Instant carts are only ever offered from getInstantAvailableCarts, but re-check
        // here too to close the race window between "listed as free" and "submitted".
        const stillFree = await this.getInstantAvailableCarts(data.stadiumId);
        if (!stillFree.some((c) => c.id === data.fleetId)) {
            const err = new Error('This cart was just booked by someone else — please pick another available cart') as Error & { status: number };
            err.status = 409;
            throw err;
        }

        const now = new Date();
        const startDate = formatDate(now);
        const startTime = formatTime(now);
        const endMoment = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const endDate = formatDate(endMoment);
        const endTime = startTime;

        const requestToken = this.generateRequestToken();

        const booking = await prisma.poolBookingRequest.create({
            data: {
                stadiumId: data.stadiumId,
                fleetId: data.fleetId,
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                requesterPhone: data.requesterPhone,
                departmentId: data.departmentId,
                faUserId: department.focalPointId,
                bookingType: 'Instant',
                startDate,
                endDate,
                startTime,
                endTime,
                purpose: data.purpose,
                requestToken,
                createdById: data.createdById,
                status: 'Pending',
            },
            include: BOOKING_INCLUDE,
        });

        const message = `${data.requesterName} requested an instant booking for ${booking.fleet.carNumber} at ${booking.stadium.name}`;
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Instant Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['Admin'],
            data.stadiumId,
        );
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Instant Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['SuperAdmin'],
        );

        return booking;
    }

    /**
     * Recurring booking: one cart, multiple independent date/time slots (not
     * necessarily contiguous, not necessarily the same time of day). Creates one
     * PoolBookingRequest row per slot — reusing every existing approve/reject/amend/
     * extension code path unchanged — tagged with a shared recurringGroupId.
     *
     * No overbooking / no double-booking: every slot is checked against currently
     * Approved bookings on the chosen cart BEFORE any row is written, and the whole
     * submission is rejected atomically if any slot conflicts (matches create()'s
     * single-slot behaviour, just applied per slot).
     */
    async createRecurring(data: CreateRecurringBookingRequestData) {
        if (data.slots.length < 2) throw new Error('A recurring booking needs at least two dates — use a single booking otherwise');

        await this.assertFleetBelongsToStadium(data.fleetId, data.stadiumId);
        const department = await this.assertDepartmentBelongsToStadium(data.departmentId, data.stadiumId);

        const sorted = [...data.slots].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
        for (const s of sorted) {
            if (s.endTime <= s.startTime) throw new Error(`End time must be after start time for ${s.date}`);
        }
        for (let i = 0; i < sorted.length; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[i]!.date === sorted[j]!.date && sorted[i]!.startTime < sorted[j]!.endTime && sorted[i]!.endTime > sorted[j]!.startTime) {
                    throw new Error(`Two selected slots overlap on ${sorted[i]!.date} — please adjust the times`);
                }
            }
        }
        for (const s of sorted) {
            await this.assertNoApprovedConflict(data.fleetId, s.date, s.date, s.startTime, s.endTime);
        }

        const recurringGroupId = crypto.randomBytes(12).toString('hex');

        const bookings = await prisma.$transaction(
            sorted.map((s) =>
                prisma.poolBookingRequest.create({
                    data: {
                        stadiumId: data.stadiumId,
                        fleetId: data.fleetId,
                        requesterName: data.requesterName,
                        requesterEmail: data.requesterEmail,
                        requesterPhone: data.requesterPhone,
                        departmentId: data.departmentId,
                        faUserId: department.focalPointId,
                        bookingType: 'Recurring',
                        startDate: s.date,
                        endDate: s.date,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        purpose: data.purpose,
                        requestToken: this.generateRequestToken(),
                        createdById: data.createdById,
                        recurringGroupId,
                        status: 'Pending',
                    },
                    include: BOOKING_INCLUDE,
                }),
            ),
        );

        const first = bookings[0]!;
        const message = `${data.requesterName} requested a ${bookings.length}-date recurring booking for ${first.fleet.carNumber} at ${first.stadium.name}`;
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Recurring Booking Request', message, entityType: 'PoolBookingRequest', entityId: first.id },
            ['Admin'],
            data.stadiumId,
        );
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Recurring Booking Request', message, entityType: 'PoolBookingRequest', entityId: first.id },
            ['SuperAdmin'],
        );

        return { recurringGroupId, bookings };
    }

    /** Requester (or venue staff) confirms the key has physically been collected — stops the 10-minute auto-cancel clock. */
    async markKeyCollected(id: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.bookingType !== 'Instant') throw new Error('Only instant bookings track key collection');
        if (existing.status !== 'Approved') throw new Error('Booking is not in an approved state');
        if (existing.keyCollectedAt) return existing;

        return prisma.poolBookingRequest.update({
            where: { id },
            data: { keyCollectedAt: new Date() },
            include: BOOKING_INCLUDE,
        });
    }

    async getByToken(token: string) {
        return prisma.poolBookingRequest.findUnique({ where: { requestToken: token }, include: BOOKING_INCLUDE });
    }

    async getById(id: string) {
        return prisma.poolBookingRequest.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    }

    async getAll(filters: { status?: string; stadiumId?: string; derivedState?: string }) {
        const where: Record<string, unknown> = {};
        if (filters.status) where.status = filters.status;
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        const rows = await prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
        const now = new Date();
        const decorated = rows.map((r) => ({ ...r, derivedState: deriveBookingState(r, now) }));
        return filters.derivedState
            ? decorated.filter((r) => r.derivedState === filters.derivedState)
            : decorated;
    }

    /**
     * History view: same rows as getAll but with date-range / car / text filters,
     * ordered by the booking window (most recent first).
     */
    async getHistory(filters: {
        stadiumId?: string; fleetId?: string; status?: string; derivedState?: string;
        fromDate?: string; toDate?: string; q?: string;
    }) {
        const where: Record<string, any> = {};
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.fleetId) where.fleetId = filters.fleetId;
        if (filters.status) where.status = filters.status;
        if (filters.fromDate || filters.toDate) {
            where.startDate = {
                ...(filters.fromDate ? { gte: filters.fromDate } : {}),
                ...(filters.toDate ? { lte: filters.toDate } : {}),
            };
        }
        if (filters.q) {
            where.OR = [
                { requesterName: { contains: filters.q } },
                { requesterEmail: { contains: filters.q } },
                { requesterPhone: { contains: filters.q } },
            ];
        }
        const rows = await prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { startDate: 'desc' } });
        const now = new Date();
        const decorated = rows.map((r) => ({ ...r, derivedState: deriveBookingState(r, now) }));
        return filters.derivedState
            ? decorated.filter((r) => r.derivedState === filters.derivedState)
            : decorated;
    }

    async markReturned(id: string, userId: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Approved') throw new Error('Only an approved booking can be returned');
        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: { status: 'Completed', returnedAt: new Date(), returnedById: userId },
            include: BOOKING_INCLUDE,
        });
        return { ...updated, derivedState: deriveBookingState(updated, new Date()) };
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

        const instantWarningLine =
            updated.bookingType === 'Instant'
                ? ` Collect the key within ${INSTANT_COLLECTION_WINDOW_MINUTES} minutes or this booking will be automatically cancelled and the car returned to the pool.`
                : '';
        if (updated.createdById) {
            const push = await notificationTemplatesService.renderPush('pool_booking_approved', {
                carNumber: updated.fleet.carNumber,
                stadiumName: updated.stadium.name,
                instantWarningLine,
            });
            if (push) {
                await notificationService.create({
                    type: 'PoolBookingApproved',
                    title: push.title,
                    message: push.message,
                    entityType: 'PoolBookingRequest',
                    entityId: id,
                    userId: updated.createdById,
                });
            }
        }
        await this.notifyBookingRequester(updated, 'approved', reviewComment);

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
            const push = await notificationTemplatesService.renderPush('pool_booking_rejected', {
                carNumber: updated.fleet.carNumber,
                stadiumName: updated.stadium.name,
            });
            if (push) {
                await notificationService.create({
                    type: 'PoolBookingRejected',
                    title: push.title,
                    message: push.message,
                    entityType: 'PoolBookingRequest',
                    entityId: id,
                    userId: updated.createdById,
                });
            }
        }
        await this.notifyBookingRequester(updated, 'rejected', reviewComment);

        return updated;
    }

    /** Best-effort email to the (possibly no-login) requester on approve/reject. */
    private async notifyBookingRequester(
        booking: { requesterEmail: string; requesterName: string; fleet: { carNumber: string }; stadium: { name: string }; bookingType?: string },
        status: 'approved' | 'rejected',
        reviewComment?: string,
    ) {
        try {
            const reviewCommentLine = reviewComment ? `\n\nReviewer notes: ${reviewComment}` : '';
            const vars = {
                carNumber: booking.fleet.carNumber,
                stadiumName: booking.stadium.name,
                requesterName: booking.requesterName,
                reviewCommentLine,
            };
            const rendered =
                status === 'approved'
                    ? await notificationTemplatesService.renderEmail('pool_booking_approved', {
                          ...vars,
                          approvedInstructionsBlock:
                              `\n\nPlease collect the car key and ensure the car is returned to the charging station ` +
                              `once you are done, and hand back the key to the venue's logistics representative.` +
                              (booking.bookingType === 'Instant'
                                  ? ` If the request is not attended and the key has not been collected within ` +
                                    `${INSTANT_COLLECTION_WINDOW_MINUTES} minutes, this booking will be automatically ` +
                                    `cancelled and the car will return to the pool due to demand from other users.`
                                  : ''),
                      })
                    : await notificationTemplatesService.renderEmail('pool_booking_rejected', vars);
            if (rendered) {
                await emailService.send({ to: booking.requesterEmail, subject: rendered.subject, text: rendered.body });
            }
        } catch (e) {
            console.error('Pool booking requester email failed:', e);
        }
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

    /** FA requests more time on an Approved pool booking. Only Admin/SuperAdmin can approve it. */
    async requestExtension(id: string, requestedById: string, newEndDate: string, newEndTime: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id }, include: BOOKING_INCLUDE });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Approved') throw new Error('Only an approved booking can request an extension');
        if (existing.faUserId !== requestedById) throw new Error('Only the assigned Focal Point can request an extension for this booking');

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: {
                extensionRequestedEndDate: newEndDate,
                extensionRequestedEndTime: newEndTime,
                extensionRequestedAt: new Date(),
                extensionStatus: 'Pending',
            },
            include: BOOKING_INCLUDE,
        });

        const message = `${updated.faUser?.name ?? updated.requesterName} requested an extension on ${updated.fleet.carNumber} until ${newEndDate} ${newEndTime}`;
        await notificationService.createForRoles(
            { type: 'PoolBookingExtensionRequested', title: 'Pool Booking Extension Requested', message, entityType: 'PoolBookingRequest', entityId: id },
            ['Admin'],
            existing.stadiumId,
        );
        await notificationService.createForRoles(
            { type: 'PoolBookingExtensionRequested', title: 'Pool Booking Extension Requested', message, entityType: 'PoolBookingRequest', entityId: id },
            ['SuperAdmin'],
        );

        return updated;
    }

    /** Admin/SuperAdmin approves or rejects a pending extension request. */
    async reviewExtension(id: string, approve: boolean, reviewedById: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.extensionStatus !== 'Pending') throw new Error('There is no pending extension request on this booking');

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: approve
                ? {
                      endDate: existing.extensionRequestedEndDate!,
                      endTime: existing.extensionRequestedEndTime!,
                      extensionStatus: 'Approved',
                      // window changed — let the reminder poller re-evaluate it
                      reminderSentAt: null,
                      overdueNotifiedAt: null,
                  }
                : { extensionStatus: 'Rejected' },
            include: BOOKING_INCLUDE,
        });

        await notificationService.create({
            type: approve ? 'PoolBookingExtensionApproved' : 'PoolBookingExtensionRejected',
            title: approve ? 'Extension approved' : 'Extension rejected',
            message: approve
                ? `Your extension for ${updated.fleet.carNumber} was approved — new return time ${updated.endDate} ${updated.endTime}`
                : `Your extension request for ${updated.fleet.carNumber} was rejected. Please return the car as scheduled.`,
            entityType: 'PoolBookingRequest',
            entityId: id,
            // Reaching reviewExtension means requestExtension already matched faUserId
            // against a real logged-in FA user, so it's never actually null here.
            userId: updated.faUserId ?? undefined,
        });

        return updated;
    }

    /**
     * In-process reminder scan (called on an interval from server.ts). For every
     * Approved booking: notify FA + Admin once as the return time approaches, and
     * once more if it has passed with no return/extension — no external scheduler needed.
     *
     * Azure Container Apps can run multiple replicas, each with its own interval timer,
     * so two replicas can race to notify the same booking in the same poll window. Each
     * branch below "claims" the row with a conditional `updateMany` (only succeeds if
     * the flag is still null) *before* sending anything, so only the replica that wins
     * the race sends notifications — count === 0 means another replica already claimed it.
     */
    async scanReminders(minutesBefore: number) {
        const now = new Date();
        const approved = await prisma.poolBookingRequest.findMany({
            where: { status: 'Approved' },
            include: BOOKING_INCLUDE,
        });

        for (const b of approved) {
            const endAt = new Date(`${b.endDate}T${b.endTime}:00`);
            if (Number.isNaN(endAt.getTime())) continue;
            const msUntilEnd = endAt.getTime() - now.getTime();

            if (!b.reminderSentAt && msUntilEnd > 0 && msUntilEnd <= minutesBefore * 60 * 1000) {
                const claimed = await prisma.poolBookingRequest.updateMany({
                    where: { id: b.id, reminderSentAt: null },
                    data: { reminderSentAt: now },
                });
                if (claimed.count === 0) continue; // another replica already sent this one

                const message = `${b.fleet.carNumber} is due back at ${b.endDate} ${b.endTime}. Return it or request an extension.`;
                if (b.faUserId) {
                    await notificationService.create({
                        type: 'PoolBookingReminder', title: 'Pool cart due soon', message,
                        entityType: 'PoolBookingRequest', entityId: b.id, userId: b.faUserId,
                    });
                }
                await notificationService.createForRoles(
                    { type: 'PoolBookingReminder', title: 'Pool cart due soon', message: `${message} (FA: ${b.faUser?.name ?? '—'})`, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['Admin'], b.stadiumId,
                );
                await notificationService.createForRoles(
                    { type: 'PoolBookingReminder', title: 'Pool cart due soon', message: `${message} (FA: ${b.faUser?.name ?? '—'})`, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['SuperAdmin'],
                );
            } else if (!b.overdueNotifiedAt && msUntilEnd <= 0) {
                const claimed = await prisma.poolBookingRequest.updateMany({
                    where: { id: b.id, overdueNotifiedAt: null },
                    data: { overdueNotifiedAt: now },
                });
                if (claimed.count === 0) continue;

                const message = `${b.fleet.carNumber} was due back at ${b.endDate} ${b.endTime} and has not been returned.`;
                if (b.faUserId) {
                    await notificationService.create({
                        type: 'PoolBookingOverdue', title: 'Pool cart overdue', message,
                        entityType: 'PoolBookingRequest', entityId: b.id, userId: b.faUserId,
                    });
                }
                await notificationService.createForRoles(
                    { type: 'PoolBookingOverdue', title: 'Pool cart overdue', message: `${message} (FA: ${b.faUser?.name ?? '—'})`, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['Admin'], b.stadiumId,
                );
                await notificationService.createForRoles(
                    { type: 'PoolBookingOverdue', title: 'Pool cart overdue', message: `${message} (FA: ${b.faUser?.name ?? '—'})`, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['SuperAdmin'],
                );
            }
        }
    }

    /**
     * In-process scan (called on an interval from server.ts, same pattern as
     * scanReminders): any Approved Instant booking whose key hasn't been collected
     * within INSTANT_COLLECTION_WINDOW_MINUTES of Admin approval is auto-cancelled,
     * returning the car to the pool for other requesters.
     */
    async scanInstantExpiry() {
        const now = new Date();
        const candidates = await prisma.poolBookingRequest.findMany({
            where: { status: 'Approved', bookingType: 'Instant', keyCollectedAt: null, reviewedAt: { not: null } },
            include: BOOKING_INCLUDE,
        });

        for (const b of candidates) {
            if (!b.reviewedAt) continue;
            const deadline = b.reviewedAt.getTime() + INSTANT_COLLECTION_WINDOW_MINUTES * 60 * 1000;
            if (now.getTime() < deadline) continue;

            const claimed = await prisma.poolBookingRequest.updateMany({
                where: { id: b.id, status: 'Approved', keyCollectedAt: null },
                data: {
                    status: 'Cancelled',
                    autoCancelledAt: now,
                    reviewComment: `Auto-cancelled — key not collected within ${INSTANT_COLLECTION_WINDOW_MINUTES} minutes of approval.`,
                },
            });
            if (claimed.count === 0) continue; // another replica already claimed/collected it

            const vars = {
                carNumber: b.fleet.carNumber,
                requesterName: b.requesterName,
                stadiumName: b.stadium.name,
                collectionWindowMinutes: String(INSTANT_COLLECTION_WINDOW_MINUTES),
            };
            const push = await notificationTemplatesService.renderPush('instant_booking_auto_cancelled', vars);
            if (push) {
                await notificationService.createForRoles(
                    { type: 'PoolBookingAutoCancelled', title: push.title, message: push.message, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['Admin'], b.stadiumId,
                );
                await notificationService.createForRoles(
                    { type: 'PoolBookingAutoCancelled', title: push.title, message: push.message, entityType: 'PoolBookingRequest', entityId: b.id },
                    ['SuperAdmin'],
                );
            }
            try {
                const rendered = await notificationTemplatesService.renderEmail('instant_booking_auto_cancelled', vars);
                if (rendered) {
                    await emailService.send({ to: b.requesterEmail, subject: rendered.subject, text: rendered.body });
                }
            } catch (e) {
                console.error('Instant booking auto-cancel email failed:', e);
            }
        }
    }
}

export const poolBookingRequestsService = new PoolBookingRequestsService();
