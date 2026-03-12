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
        return prisma.carRequest.update({
            where: { id },
            data: {
                status: 'Approved',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
            },
            include: {
                stadium: { select: { name: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });
    }

    /**
     * Reject a request
     */
    async rejectRequest(id: string, reviewedById: string, reviewNotes?: string) {
        return prisma.carRequest.update({
            where: { id },
            data: {
                status: 'Rejected',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
            },
            include: {
                stadium: { select: { name: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });
    }

    /**
     * Delete a request (SuperAdmin only)
     */
    async deleteRequest(id: string) {
        return prisma.carRequest.delete({
            where: { id },
        });
    }
}

export const requestsService = new RequestsService();