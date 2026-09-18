import { prisma } from '../../config/database';
import crypto from 'crypto';
import { emailService, textToSimpleHtml } from '../../services/email.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';
import { checkInvitationValidity } from './invitation-validity';

export interface CreateInvitationData {
    email: string;
    stadiumId?: string;
    departmentId?: string;
    invitedById: string;
}

export class InvitationsService {
    async create(data: CreateInvitationData) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invitation = await prisma.invitation.create({
            data: {
                email: data.email,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                invitedById: data.invitedById,
                token,
                status: 'Pending',
                expiresAt,
            },
        });

        const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/access-request?invite=${token}`;
        try {
            const rendered = await notificationTemplatesService.renderEmail('invitation_sent', { inviteLink: link });
            if (rendered) {
                await emailService.send({ to: data.email, subject: rendered.subject, text: rendered.body, html: textToSimpleHtml(rendered.body) });
            }
        } catch (e) {
            console.error('Invitation email failed:', e);
        }

        return invitation;
    }

    async getAll(filters: { stadiumId?: string; status?: string }) {
        const where: any = {};
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.status) where.status = filters.status;
        return prisma.invitation.findMany({
            where,
            include: {
                invitedBy: { select: { id: true, name: true } },
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getByToken(token: string) {
        return prisma.invitation.findUnique({
            where: { token },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
        });
    }

    async getById(id: string) {
        return prisma.invitation.findUnique({
            where: { id },
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
            },
        });
    }

    /** Validates a token for the public access-request form; throws with a machine-readable reason. */
    async validateForSubmission(token: string) {
        const invitation = await prisma.invitation.findUnique({ where: { token } });
        if (!invitation) throw new Error('INVITATION_NOT_FOUND');

        const validity = checkInvitationValidity(invitation, new Date());
        if (!validity.valid) throw new Error(validity.reason);

        return invitation;
    }

    async markUsed(id: string) {
        return prisma.invitation.update({ where: { id }, data: { status: 'Used' } });
    }

    async revoke(id: string) {
        return prisma.invitation.update({ where: { id }, data: { status: 'Revoked' } });
    }
}

export const invitationsService = new InvitationsService();
