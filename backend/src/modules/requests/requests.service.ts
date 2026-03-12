import { prisma } from '../../config/database';
import crypto from 'crypto';
import { notificationService } from '../notifications/notification.service';

export interface CreateCarRequestData {
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    departmentId: string;
    stadiumId: string;
    cargoCount: number;
    fourSeaterCount: number;
    sixSeaterCount: number;
    accessibilityCount: number;
    notes?: string;
}

export interface CarRequestFilters {
    status?: string;
    stadiumId?: string;
    departmentId?: string;
}

export class RequestsService {
    /**
     * Generate a unique request token
     */
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Create a new car request (public)
     */
    async createRequest(data: CreateCarRequestData) {
        const requestToken = this.generateRequestToken();
        
        const request = await prisma.carRequest.create({
            data: {
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                requesterPhone: data.requesterPhone,
                departmentId: data.departmentId,
                stadiumId: data.stadiumId,
                cargoCount: data.cargoCount,
                fourSeaterCount: data.fourSeaterCount,
                sixSeaterCount: data.sixSeaterCount,
                accessibilityCount: data.accessibilityCount,
                notes: data.notes,
                requestToken,
                status: 'Pending',
            },
            include: {
                stadium: { select: { name: true } },
                department: { select: { name: true } },
            },
        });

        // Create notifications for admins about new request
        await notificationService.createForRoles(
            {
                type: 'CarRequest',
                title: 'New Car Request',
                message: `${data.requesterName} (${request.department?.name}) requested ${data.cargoCount + data.fourSeaterCount + data.sixSeaterCount + data.accessibilityCount} carts`,
                entityType: 'CarRequest',
                entityId: request.id,
            },
            ['SuperAdmin', 'Admin'],
            data.stadiumId,
        );

        return request;
    }

    /**
     * Get a request by its public token
     */
    async getByToken(token: string) {
        return prisma.carRequest.findUnique({
            where: { requestToken: token },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
    }

    /**
     * Get a request by ID
     */
    async getById(id: string) {
        return prisma.carRequest.findUnique({
            where: { id },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
    }

    /**
     * Get all requests with filters
     */
    async getAll(filters: CarRequestFilters, page?: number, limit?: number) {
        const where: any = {};

        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.stadiumId) {
            where.stadiumId = filters.stadiumId;
        }
        if (filters.departmentId) {
            where.departmentId = filters.departmentId;
        }

        const [data, total] = await Promise.all([
            prisma.carRequest.findMany({
                where,
                include: {
                    stadium: { select: { id: true, name: true } },
                    department: { select: { id: true, name: true } },
                    reviewedBy: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip: page && limit ? (page - 1) * limit : undefined,
                take: limit,
            }),
            prisma.carRequest.count({ where }),
        ]);

        return { data, total };
    }

    /**
     * Approve a request
     */
    async approveRequest(id: string, reviewedById: string, reviewNotes?: string) {
        const request = await prisma.carRequest.update({
            where: { id },
            data: {
                status: 'Approved',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
            },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        // Create notification
        await notificationService.createForRoles(
            {
                type: 'RequestApproved',
                title: 'Car Request Approved',
                message: `Request from ${request.requesterName} (${request.department?.name}) approved`,
                entityType: 'CarRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        return request;
    }

    /**
     * Reject a request
     */
    async rejectRequest(id: string, reviewedById: string, reviewNotes?: string) {
        const request = await prisma.carRequest.update({
            where: { id },
            data: {
                status: 'Rejected',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
            },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        // Create notification
        await notificationService.createForRoles(
            {
                type: 'RequestRejected',
                title: 'Car Request Rejected',
                message: `Request from ${request.requesterName} (${request.department?.name}) rejected`,
                entityType: 'CarRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        return request;
    }

    /**
     * Delete a request (SuperAdmin only)
     */
    async deleteRequest(id: string) {
        return prisma.carRequest.delete({
            where: { id },
        });
    }

    /**
     * Update request quantities (Admin/SuperAdmin can edit before approving)
     */
    async updateQuantities(
        id: string,
        data: {
            cargoCount?: number;
            fourSeaterCount?: number;
            sixSeaterCount?: number;
            accessibilityCount?: number;
        }
    ) {
        return prisma.carRequest.update({
            where: { id },
            data: {
                cargoCount: data.cargoCount,
                fourSeaterCount: data.fourSeaterCount,
                sixSeaterCount: data.sixSeaterCount,
                accessibilityCount: data.accessibilityCount,
            },
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
    }
}

export const requestsService = new RequestsService();