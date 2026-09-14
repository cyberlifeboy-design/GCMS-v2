import { Response, Request } from 'express';
import { z } from 'zod';
import { invitationsService } from './invitations.service';
import { checkInvitationValidity } from './invitation-validity';
import { AuthRequest } from '../../middleware/auth.middleware';

const createInvitationSchema = z.object({
    email: z.string().email('Valid email is required'),
    stadiumId: z.string().optional(),
    departmentId: z.string().optional(),
});

export function invitationErrorMessage(code: string): string {
    switch (code) {
        case 'INVITATION_NOT_FOUND': return 'This invitation link is invalid.';
        case 'INVITATION_ALREADY_USED': return 'This invitation link has already been used.';
        case 'INVITATION_REVOKED': return 'This invitation has been revoked.';
        case 'INVITATION_EXPIRED': return 'This invitation link has expired.';
        default: return 'This invitation link is invalid.';
    }
}

export class InvitationsController {
    static async create(req: AuthRequest, res: Response) {
        try {
            const data = createInvitationSchema.parse(req.body);

            // For Admins, always scope to their own stadium
            if (req.user?.role === 'Admin') {
                if (data.stadiumId && data.stadiumId !== req.user.stadiumId) {
                    res.status(403).json({ error: 'You can only invite users to your own venue' });
                    return;
                }
                data.stadiumId = req.user.stadiumId;
            }

            const invitation = await invitationsService.create({ ...data, invitedById: req.user!.userId });
            res.status(201).json({ message: 'Invitation sent', data: invitation });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Create invitation error:', error);
                res.status(500).json({ error: 'Failed to create invitation' });
            }
        }
    }

    static async getAll(req: AuthRequest, res: Response) {
        try {
            const stadiumId = req.user?.role === 'Admin' ? req.user.stadiumId : (req.query.stadiumId as string | undefined);
            const invitations = await invitationsService.getAll({ stadiumId, status: req.query.status as string | undefined });
            res.status(200).json({ data: invitations });
        } catch (error) {
            console.error('Get invitations error:', error);
            res.status(500).json({ error: 'Failed to fetch invitations' });
        }
    }

    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const token = req.params.token as string;
            const invitation = await invitationsService.getByToken(token);
            if (!invitation) {
                res.status(404).json({ error: invitationErrorMessage('INVITATION_NOT_FOUND') });
                return;
            }

            const validity = checkInvitationValidity(invitation, new Date());
            if (!validity.valid) {
                res.status(400).json({ error: invitationErrorMessage(validity.reason || '') });
                return;
            }

            res.status(200).json({ data: invitation });
        } catch (error) {
            console.error('Get invitation by token error:', error);
            res.status(500).json({ error: 'Failed to fetch invitation' });
        }
    }

    static async revoke(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const invitation = await invitationsService.getById(id);

            if (!invitation) {
                res.status(404).json({ error: 'Invitation not found' });
                return;
            }

            // Admin can only revoke invitations in their own stadium
            if (req.user?.role === 'Admin' && invitation.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'You can only revoke invitations for your own venue' });
                return;
            }

            await invitationsService.revoke(id);
            res.status(200).json({ message: 'Invitation revoked' });
        } catch (error) {
            console.error('Revoke invitation error:', error);
            res.status(500).json({ error: 'Failed to revoke invitation' });
        }
    }
}
