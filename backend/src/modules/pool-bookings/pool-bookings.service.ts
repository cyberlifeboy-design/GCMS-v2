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

    // NOTE: checkout()/returnCart() were removed alongside their routes — new pool
    // bookings must go through the approval workflow in the pool-booking-requests
    // module. Existing PoolBooking rows remain readable via getBookings().

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
