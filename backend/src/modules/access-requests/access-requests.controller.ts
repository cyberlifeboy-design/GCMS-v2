import { Response, Request } from 'express';
import { z } from 'zod';
import { accessRequestsService } from './access-requests.service';
import { invitationsService } from '../invitations/invitations.service';
import { invitationErrorMessage } from '../invitations/invitations.controller';
import { AuthRequest } from '../../middleware/auth.middleware';

const createAccessRequestSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Valid email is required'),
    phone: z.string().optional(),
    stadiumId: z.string().min(1, 'Venue is required'),
    departmentId: z.string().min(1, 'Department is required'),
    invitationToken: z.string().optional(),
});

const reviewSchema = z.object({ reviewNotes: z.string().optional() });

function createErrorMessage(code: string): string {
    switch (code) {
        case 'VENUE_NOT_ACTIVE': return 'The selected venue is no longer active.';
        case 'DEPARTMENT_NOT_ACTIVE': return 'The selected department is no longer active at this venue.';
        default: return 'Failed to submit request';
    }
}

export class AccessRequestsController {
    /** POST /api/v1/public/access-requests */
    static async createPublic(req: Request, res: Response) {
        try {
            const data = createAccessRequestSchema.parse(req.body);

            let email = data.email;
            let invitationId: string | undefined;
            let source: 'sso' | 'invite' = 'sso';

            if (data.invitationToken) {
                let invitation;
                try {
                    invitation = await invitationsService.validateForSubmission(data.invitationToken);
                } catch (e: any) {
                    res.status(400).json({ error: invitationErrorMessage(e.message) });
                    return;
                }
                email = invitation.email; // server-side lock — the invite's email always wins
                invitationId = invitation.id;
                source = 'invite';
            }

            const request = await accessRequestsService.createRequest({
                name: data.name,
                email,
                phone: data.phone,
                stadiumId: data.stadiumId,
                departmentId: data.departmentId,
                source,
                invitationId,
            });

            if (invitationId) {
                await invitationsService.markUsed(invitationId);
            }

            res.status(201).json({ message: 'Request submitted successfully', data: request });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (error?.message === 'VENUE_NOT_ACTIVE' || error?.message === 'DEPARTMENT_NOT_ACTIVE') {
                res.status(400).json({ error: createErrorMessage(error.message) });
            } else {
                console.error('Create access request error:', error);
                res.status(500).json({ error: 'Failed to submit request' });
            }
        }
    }

    /** GET /api/v1/public/access-requests/:token */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const token = req.params.token as string;
            const request = await accessRequestsService.getByToken(token);
            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get access request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /** GET /api/v1/access-requests */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId, departmentId, page, limit } = req.query;
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') filterStadiumId = req.user.stadiumId;

            const result = await accessRequestsService.getAll(
                { status: status as string, stadiumId: filterStadiumId, departmentId: departmentId as string },
                page ? parseInt(page as string) : undefined,
                limit ? parseInt(limit as string) : undefined,
            );
            res.status(200).json(result);
        } catch (error) {
            console.error('Get all access requests error:', error);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    }

    /** GET /api/v1/access-requests/:id */
    static async getById(req: AuthRequest, res: Response) {
        try {
            const request = await accessRequestsService.getById(req.params.id as string);
            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && request.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get access request by ID error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /** POST /api/v1/access-requests/:id/approve */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { reviewNotes } = reviewSchema.parse(req.body);

            const existing = await accessRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await accessRequestsService.approveRequest(id, req.user!.userId, reviewNotes);
            res.status(200).json({ message: 'Request approved successfully', data: request });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Approve access request error:', error);
                res.status(500).json({ error: 'Failed to approve request' });
            }
        }
    }

    /** POST /api/v1/access-requests/:id/reject */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { reviewNotes } = reviewSchema.parse(req.body);

            const existing = await accessRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await accessRequestsService.rejectRequest(id, req.user!.userId, reviewNotes);
            res.status(200).json({ message: 'Request rejected successfully', data: request });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject access request error:', error);
                res.status(500).json({ error: 'Failed to reject request' });
            }
        }
    }

    /** DELETE /api/v1/access-requests/:id */
    static async delete(req: AuthRequest, res: Response) {
        try {
            const existing = await accessRequestsService.getById(req.params.id as string);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }
            await accessRequestsService.deleteRequest(req.params.id as string);
            res.status(204).send();
        } catch (error) {
            console.error('Delete access request error:', error);
            res.status(500).json({ error: 'Failed to delete request' });
        }
    }
}
