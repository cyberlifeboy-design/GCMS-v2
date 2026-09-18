import { prisma } from '../../config/database';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { notificationService } from '../notifications/notification.service';
import { emailService, textToSimpleHtml } from '../../services/email.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';
import { resolveApprovalDepartment } from './approval-department';

export interface CreateAccessRequestData {
    name: string;
    email: string;
    phone?: string;
    stadiumId: string;
    departmentId: string;
    source: 'sso' | 'invite';
    invitationId?: string;
}

export interface AccessRequestFilters {
    status?: string;
    stadiumId?: string;
    departmentId?: string;
}

export class AccessRequestsService {
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    private async notifyRequester(args: {
        email: string; name: string; status: 'Approved' | 'Rejected'; reviewNotes?: string;
    }) {
        const key = args.status === 'Approved' ? 'access_request_approved' : 'access_request_rejected';
        const reviewNotesLine = args.reviewNotes ? `\n${args.status === 'Approved' ? 'Notes' : 'Reason'}: ${args.reviewNotes}\n` : '';
        try {
            const rendered = await notificationTemplatesService.renderEmail(key, { name: args.name, reviewNotesLine });
            if (rendered) {
                await emailService.send({ to: args.email, subject: rendered.subject, text: rendered.body, html: textToSimpleHtml(rendered.body) });
            }
        } catch (e) {
            console.error('Access request requester email failed:', e);
        }
    }

    /** Emails the venue's Admin(s) and every SuperAdmin that a new request needs review — alongside the existing in-app notification. */
    private async notifyReviewers(request: { name: string; stadiumId: string; stadium?: { name: string } | null; department?: { name: string } | null }) {
        try {
            const reviewers = await prisma.user.findMany({
                where: { isActive: true, OR: [{ role: 'SuperAdmin' }, { role: 'Admin', stadiumId: request.stadiumId }] },
                select: { email: true },
            });
            if (reviewers.length === 0) return;

            const reviewUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/access-requests`;
            const rendered = await notificationTemplatesService.renderEmail('access_request_received', {
                requesterName: request.name,
                departmentName: request.department?.name || '',
                stadiumName: request.stadium?.name || '',
                reviewUrl,
            });
            if (!rendered) return;

            await Promise.all(reviewers.map(r =>
                emailService.send({ to: r.email, subject: rendered.subject, text: rendered.body, html: textToSimpleHtml(rendered.body) })
            ));
        } catch (e) {
            console.error('Access request reviewer email failed:', e);
        }
    }

    /** Re-validates venue/department are active — never trust a client-supplied id blindly. */
    private async assertVenueAndDepartmentActive(stadiumId: string, departmentId: string) {
        const [stadium, department] = await Promise.all([
            prisma.stadium.findUnique({ where: { id: stadiumId } }),
            prisma.department.findUnique({ where: { id: departmentId } }),
        ]);
        if (!stadium || !stadium.isActive) throw new Error('VENUE_NOT_ACTIVE');
        if (!department || !department.isActive || department.stadiumId !== stadiumId) throw new Error('DEPARTMENT_NOT_ACTIVE');
    }

    async createRequest(data: CreateAccessRequestData) {
        await this.assertVenueAndDepartmentActive(data.stadiumId, data.departmentId);

        const existingPending = await prisma.accessRequest.findFirst({
            where: { email: data.email, status: 'Pending' },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
        if (existingPending) return existingPending;

        const requestToken = this.generateRequestToken();
        const request = await prisma.accessRequest.create({
            data: {
                name: data.name,
                email: data.email,
                phone: data.phone,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                source: data.source,
                invitationId: data.invitationId,
                requestToken,
                status: 'Pending',
            },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequest',
                title: 'New Account Access Request',
                message: `${data.name} requested access to ${request.department?.name} at ${request.stadium?.name}`,
                entityType: 'AccessRequest',
                entityId: request.id,
            },
            ['SuperAdmin', 'Admin'],
            data.stadiumId,
        );
        await this.notifyReviewers(request);

        return request;
    }

    async getByToken(token: string) {
        return prisma.accessRequest.findUnique({
            where: { requestToken: token },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
            },
        });
    }

    async getById(id: string) {
        return prisma.accessRequest.findUnique({
            where: { id },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true, code: true } },
                reviewedBy: { select: { id: true, name: true } },
            },
        });
    }

    async getAll(filters: AccessRequestFilters, page?: number, limit?: number) {
        const where: any = {};
        if (filters.status) where.status = filters.status;
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.departmentId) where.departmentId = filters.departmentId;

        const [data, total] = await Promise.all([
            prisma.accessRequest.findMany({
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
            prisma.accessRequest.count({ where }),
        ]);

        return { data, total };
    }

    /** Approves the request, creating the User if one doesn't already exist for that email.
     * `departmentIdOverride` lets the reviewer confirm or change the department the
     * requester picked (defaulting to what was requested) before the account is created. */
    async approveRequest(id: string, reviewedById: string, reviewNotes?: string, departmentIdOverride?: string) {
        const existing = await prisma.accessRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Request not found');

        const overrideDept = departmentIdOverride && departmentIdOverride !== existing.departmentId
            ? await prisma.department.findUnique({ where: { id: departmentIdOverride } })
            : null;
        const resolution = resolveApprovalDepartment(existing.departmentId, existing.stadiumId, overrideDept);
        if ('error' in resolution) throw new Error(resolution.error);
        const departmentId = resolution.departmentId;

        let user = await prisma.user.findUnique({ where: { email: existing.email } });
        if (!user) {
            const randomPassword = crypto.randomBytes(32).toString('hex');
            const passwordHash = await bcrypt.hash(randomPassword, 10);
            user = await prisma.user.create({
                data: {
                    name: existing.name,
                    email: existing.email,
                    phone: existing.phone,
                    passwordHash,
                    role: 'FA',
                    authProvider: 'microsoft',
                    stadiumId: existing.stadiumId,
                    departmentId,
                    exportPreferences: JSON.stringify({}),
                    grantedPages: JSON.stringify([]),
                },
            });
        } else if (user.departmentId !== departmentId) {
            user = await prisma.user.update({ where: { id: user.id }, data: { departmentId } });
        }

        const request = await prisma.accessRequest.update({
            where: { id },
            data: {
                status: 'Approved',
                reviewedById,
                reviewedAt: new Date(),
                reviewNotes,
                createdUserId: user.id,
            },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequestApproved',
                title: 'Account Access Request Approved',
                message: `${request.name} (${request.department?.name}) approved`,
                entityType: 'AccessRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        await this.notifyRequester({ email: request.email, name: request.name, status: 'Approved', reviewNotes });

        return request;
    }

    async rejectRequest(id: string, reviewedById: string, reviewNotes?: string) {
        const request = await prisma.accessRequest.update({
            where: { id },
            data: { status: 'Rejected', reviewedById, reviewedAt: new Date(), reviewNotes },
            include: {
                stadium: { select: { name: true, id: true } },
                department: { select: { name: true } },
                reviewedBy: { select: { name: true } },
            },
        });

        await notificationService.createForRoles(
            {
                type: 'AccessRequestRejected',
                title: 'Account Access Request Rejected',
                message: `${request.name} (${request.department?.name}) rejected`,
                entityType: 'AccessRequest',
                entityId: id,
            },
            ['SuperAdmin', 'Admin'],
            request.stadiumId || undefined,
        );

        await this.notifyRequester({ email: request.email, name: request.name, status: 'Rejected', reviewNotes });

        return request;
    }

    async deleteRequest(id: string) {
        return prisma.accessRequest.delete({ where: { id } });
    }
}

export const accessRequestsService = new AccessRequestsService();
