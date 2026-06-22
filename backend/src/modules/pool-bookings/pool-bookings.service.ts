import { prisma } from '../../config/database';

const FLEET_INCLUDE = {
    stadium: { select: { id: true, name: true, code: true } },
};

const BOOKING_INCLUDE = {
    fleet: { select: { id: true, carNumber: true, carType: true, stadiumId: true } },
    createdBy: { select: { id: true, name: true } },
    returnedBy: { select: { id: true, name: true } },
};

export class PoolBookingsService {
    async getPoolFleet(stadiumId?: string) {
        const where: any = { isPool: true };
        if (stadiumId) where.stadiumId = stadiumId;

        const carts = await prisma.fleet.findMany({
            where,
            include: {
                ...FLEET_INCLUDE,
                poolBookings: {
                    where: { status: 'Active' },
                    take: 1,
                    include: {
                        createdBy: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { carNumber: 'asc' },
        });

        return carts;
    }

    async getBookings(params: {
        fleetId?: string;
        stadiumId?: string;
        status?: string;
        limit?: number;
    }) {
        const { fleetId, stadiumId, status, limit } = params;
        const where: any = {};
        if (status) where.status = status;
        if (fleetId) {
            where.fleetId = fleetId;
        } else if (stadiumId) {
            where.fleet = { stadiumId };
        }

        return prisma.poolBooking.findMany({
            where,
            include: BOOKING_INCLUDE,
            orderBy: { checkoutAt: 'desc' },
            ...(limit ? { take: limit } : {}),
        });
    }

    async checkout(
        fleetId: string,
        data: {
            driverName: string;
            driverPhone?: string;
            accreditationNumber?: string;
            purpose?: string;
            expectedReturnAt?: Date;
        },
        userId: string,
    ) {
        const cart = await prisma.fleet.findUnique({ where: { id: fleetId } });
        if (!cart) throw new Error('Cart not found');
        if (!cart.isPool) throw new Error('Cart is not a pool cart');
        if (cart.status !== 'Available') throw new Error('Cart is not available — it may already be checked out');

        const [booking] = await prisma.$transaction([
            prisma.poolBooking.create({
                data: { fleetId, ...data, status: 'Active', createdById: userId },
                include: BOOKING_INCLUDE,
            }),
            prisma.fleet.update({
                where: { id: fleetId },
                data: { status: 'Dispatched' },
            }),
        ]);

        return booking;
    }

    async returnCart(bookingId: string, returnNotes: string | undefined, userId: string) {
        const booking = await prisma.poolBooking.findUnique({
            where: { id: bookingId },
        });
        if (!booking) throw new Error('Booking not found');
        if (booking.status !== 'Active') throw new Error('Booking is already closed');

        const [updated] = await prisma.$transaction([
            prisma.poolBooking.update({
                where: { id: bookingId },
                data: {
                    status: 'Returned',
                    returnedAt: new Date(),
                    returnNotes,
                    returnedById: userId,
                },
                include: BOOKING_INCLUDE,
            }),
            prisma.fleet.update({
                where: { id: booking.fleetId },
                data: { status: 'Available' },
            }),
        ]);

        return updated;
    }

    async togglePool(fleetId: string, isPool: boolean, requestorRole: string, requestorStadiumId?: string) {
        const cart = await prisma.fleet.findUnique({ where: { id: fleetId } });
        if (!cart) throw new Error('Cart not found');

        if (requestorRole === 'Admin' && cart.stadiumId !== requestorStadiumId) {
            throw new Error('Access denied');
        }

        if (!isPool) {
            const active = await prisma.poolBooking.findFirst({
                where: { fleetId, status: 'Active' },
            });
            if (active) throw new Error('Cannot remove from pool while cart is checked out');
        }

        return prisma.fleet.update({
            where: { id: fleetId },
            data: { isPool },
        });
    }
}

export const poolBookingsService = new PoolBookingsService();
