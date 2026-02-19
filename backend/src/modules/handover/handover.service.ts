import { PrismaClient, HandoverLog } from '@prisma/client';
import { prisma } from '../../config/database';
import { uploadSignature } from '../../config/storage';

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

export class HandoverService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async checkOut(data: {
        fleetId: string;
        userId: string;
        latitude?: number;
        longitude?: number;
        conditionNotes?: string;
        signatureBase64?: string;
    }) {
        // 1. Verify car exists and is Ready
        const vehicle = await this.prisma.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'Ready') throw new Error(`Vehicle is not Ready (Current status: ${vehicle.status})`);

        // 2. Handle signature if provided
        let signatureUrl: string | undefined;
        if (data.signatureBase64) {
            const fileName = `sig_out_${data.fleetId}_${Date.now()}.png`;
            const buffer = Buffer.from(data.signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            signatureUrl = await uploadSignature(fileName, buffer);
        }

        // 3. Create HandoverLog and update Fleet status
        return this.prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckOut',
                    latitude: data.latitude,
                    longitude: data.longitude,
                    conditionNotes: data.conditionNotes,
                    signatureUrl,
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: 'In-Use' },
            });

            return log;
        });
    }

    async checkIn(data: {
        fleetId: string;
        userId: string;
        latitude?: number;
        longitude?: number;
        conditionNotes?: string;
        signatureBase64?: string;
        isMaintenanceRequired?: boolean;
    }) {
        // 1. Verify car exists and is In-Use
        const vehicle = await this.prisma.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'In-Use') throw new Error(`Vehicle is not In-Use (Current status: ${vehicle.status})`);

        // 2. Handle signature
        let signatureUrl: string | undefined;
        if (data.signatureBase64) {
            const fileName = `sig_in_${data.fleetId}_${Date.now()}.png`;
            const buffer = Buffer.from(data.signatureBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
            signatureUrl = await uploadSignature(fileName, buffer);
        }

        // 3. Create HandoverLog and update Fleet status
        return this.prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckIn',
                    latitude: data.latitude,
                    longitude: data.longitude,
                    conditionNotes: data.conditionNotes,
                    signatureUrl,
                },
            });

            const nextStatus = data.isMaintenanceRequired ? 'Maintenance' : 'Ready';
            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: nextStatus },
            });

            return log;
        });
    }

    async getMyHandoverHistory(userId: string, pagination?: PaginationParams): Promise<PaginatedResult<HandoverLog>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where = { userId };

        const [data, total] = await Promise.all([
            this.prisma.handoverLog.findMany({
                where,
                include: { fleet: true },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.handoverLog.count({ where }),
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

    async getAllHistory(filters: {
        stadiumId?: string;
        faTrigram?: string;
        fleetId?: string;
    }, pagination?: PaginationParams): Promise<PaginatedResult<HandoverLog>> {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 50;
        const skip = (page - 1) * limit;

        const where = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            fleet: {
                ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
                ...(filters.faTrigram && { assignedToFA: filters.faTrigram }),
            },
        };

        const [data, total] = await Promise.all([
            this.prisma.handoverLog.findMany({
                where,
                include: {
                    fleet: { include: { stadium: true } },
                    user: { select: { name: true, email: true, role: true } },
                },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.handoverLog.count({ where }),
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
}

export const handoverService = new HandoverService();
