import { prisma } from '../../config/database';
import crypto from 'crypto';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';

export interface CreateCarRequestData {
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    accreditationNumber?: string;
    requestType?: string;
    departmentId: string;
    stadiumId: string;
    cargoCount: number;
    fourSeaterCount: number;
    sixSeaterCount: number;
    accessibilityCount: number;
    justification?: string;
    notes?: string;
}

export interface CarRequestFilters {
    status?: string;
    stadiumId?: string;
    departmentId?: string;
    requestType?: string;
}

export class RequestsService {
    /**
     * Generate a unique request token
     */
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Tell the requester (external email + in-app if they have an account) that
     * their request has been approved or rejected. Best-effort — a failing email
     * must never break the review action.
     */
    private async notifyRequester(args: {
        email: string; name: string; status: 'Approved' | 'Rejected';
        reviewNotes?: string; reference: string;
    }) {
        const subject = `Car request ${args.status}: ${args.reference}`;
        const body =
            `Hello ${args.name},\n\n` +
            `Your car request (${args.reference}) has been ${args.status.toLowerCase()}.\n` +
            (args.reviewNotes ? `\nReviewer notes: ${args.reviewNotes}\n` : '') +
            `\nThank you,\nGCMS`;
        try {
            await emailService.send({ to: args.email, subject, text: body });
        } catch (e) {
            console.error('Requester email failed:', e);
        }
        const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });
        if (user) {
            await notificationService.create({
                type: args.status === 'Approved' ? 'RequestApproved' : 'RequestRejected',
                title: `Car request ${args.status}`,
                message: `${args.reference} — ${args.status}${args.reviewNotes ? `: ${args.reviewNotes}` : ''}`,
                entityType: 'CarRequest',
                entityId: args.reference,
                userId: user.id,
            });
        }
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
                accreditationNumber: data.accreditationNumber,
                requestType: data.requestType || 'one-time',
                departmentId: data.departmentId,
                stadiumId: data.stadiumId,
                cargoCount: data.cargoCount,
                fourSeaterCount: data.fourSeaterCount,
                sixSeaterCount: data.sixSeaterCount,
                accessibilityCount: data.accessibilityCount,
                justification: data.justification,
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
     * Get a request by its human-friendly number + the requester's own email —
     * the email check keeps requestNumber (a small sequential int) from being an
     * open enumeration vector into other departments' requests.
     */
    async getByNumberAndEmail(requestNumber: number, email: string) {
        return prisma.carRequest.findFirst({
            where: { requestNumber, requesterEmail: { equals: email } },
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
    }

    /** Admin/SuperAdmin asks the requester for more detail on their car request. */
    async emailRequester(id: string, message: string) {
        const request = await prisma.carRequest.findUnique({ where: { id } });
        if (!request) throw new Error('Request not found');

        await emailService.send({
            to: request.requesterEmail,
            subject: `More information needed on your car request`,
            text:
                `Hello ${request.requesterName},\n\n` +
                `The Logistics team needs more information about your car request:\n\n` +
                `${message}\n\n` +
                `Please reply to this email with the details.\n\nThank you,\nGCMS`,
        });

        return request;
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
        if (filters.requestType) {
            where.requestType = filters.requestType;
        }

        const [data, total] = await Promise.all([
            prisma.carRequest.findMany({
                where,
                include: {
                    stadium: { select: { id: true, name: true } },
                    department: { select: { id: true, name: true, code: true } },
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

        await this.notifyRequester({
            email: request.requesterEmail,
            name: request.requesterName,
            status: 'Approved',
            reviewNotes,
            reference: request.id,
        });

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

        await this.notifyRequester({
            email: request.requesterEmail,
            name: request.requesterName,
            status: 'Rejected',
            reviewNotes,
            reference: request.id,
        });

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