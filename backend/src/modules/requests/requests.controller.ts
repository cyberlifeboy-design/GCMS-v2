import { Response, Request } from 'express';
import { requestsService } from './requests.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { emailService } from '../../services/email.service';

const createRequestSchema = z.object({
    requesterName: z.string().min(1, 'Name is required'),
    requesterEmail: z.string().email('Valid email is required'),
    requesterPhone: z.string().optional(),
    departmentId: z.string().min(1, 'Department is required'),
    stadiumId: z.string().min(1, 'Stadium is required'),
    cargoCount: z.number().int().min(0).default(0),
    fourSeaterCount: z.number().int().min(0).default(0),
    sixSeaterCount: z.number().int().min(0).default(0),
    accessibilityCount: z.number().int().min(0).default(0),
    notes: z.string().optional(),
});

const reviewRequestSchema = z.object({
    reviewNotes: z.string().optional(),
});

export class RequestsController {
    /**
     * Public endpoint: Create a new car request
     * POST /api/v1/public/requests
     */
    static async createPublic(req: Request, res: Response) {
        try {
            const validatedData = createRequestSchema.parse(req.body);

            // Validate that at least one cart type is requested
            const totalRequested = 
                validatedData.cargoCount +
                validatedData.fourSeaterCount +
                validatedData.sixSeaterCount +
                validatedData.accessibilityCount;

            if (totalRequested === 0) {
                res.status(400).json({ 
                    error: 'At least one cart type must have a quantity greater than 0' 
                });
                return;
            }

            const request = await requestsService.createRequest(validatedData);
            res.status(201).json({
                message: 'Request submitted successfully',
                data: request,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Create car request error:', error);
                res.status(500).json({ error: 'Failed to submit request' });
            }
        }
    }

    /**
     * Public endpoint: Get request by token (for viewing submission confirmation)
     * GET /api/v1/public/requests/:token
     */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const token = req.params.token as string;
            const request = await requestsService.getByToken(token);

            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /**
     * Admin endpoint: Get all requests with filters
     * GET /api/v1/requests
     */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId, departmentId, page, limit } = req.query;

            // RBAC: Admin can only see requests for their stadium
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const filters = {
                status: status as string,
                stadiumId: filterStadiumId,
                departmentId: departmentId as string,
            };

            const result = await requestsService.getAll(
                filters,
                page ? parseInt(page as string) : undefined,
                limit ? parseInt(limit as string) : undefined
            );

            res.status(200).json(result);
        } catch (error) {
            console.error('Get all requests error:', error);
            res.status(500).json({ error: 'Failed to fetch requests' });
        }
    }

    /**
     * Admin endpoint: Get request by ID
     * GET /api/v1/requests/:id
     */
    static async getById(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const request = await requestsService.getById(id);

            if (!request) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            // RBAC: Admin can only see requests for their stadium
            if (req.user?.role === 'Admin' && request.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Get request by ID error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /**
     * Admin endpoint: Approve a request
     * POST /api/v1/requests/:id/approve
     */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const validatedData = reviewRequestSchema.parse(req.body);

            // Check if request exists
            const existing = await requestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            // RBAC: Admin can only approve requests for their stadium
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await requestsService.approveRequest(
                id,
                req.user!.userId,
                validatedData.reviewNotes
            );

            // Send approval email
            try {
                await emailService.send({
                    to: existing.requesterEmail,
                    subject: 'Car Request Approved',
                    text: `Your car request has been approved.\n\nRequest Details:\n- Stadium: ${existing.stadium.name}\n- Department: ${existing.department.name}\n- Carts Requested: ${existing.cargoCount} Cargo, ${existing.fourSeaterCount} 4-Seater, ${existing.sixSeaterCount} 6-Seater, ${existing.accessibilityCount} Accessibility\n${validatedData.reviewNotes ? `\nNotes: ${validatedData.reviewNotes}` : ''}`,
                    html: `
                        <h2>Your car request has been approved</h2>
                        <p><strong>Stadium:</strong> ${existing.stadium.name}</p>
                        <p><strong>Department:</strong> ${existing.department.name}</p>
                        <p><strong>Carts Requested:</strong></p>
                        <ul>
                            <li>Cargo: ${existing.cargoCount}</li>
                            <li>4-Seater: ${existing.fourSeaterCount}</li>
                            <li>6-Seater: ${existing.sixSeaterCount}</li>
                            <li>Accessibility: ${existing.accessibilityCount}</li>
                        </ul>
                        ${validatedData.reviewNotes ? `<p><strong>Notes:</strong> ${validatedData.reviewNotes}</p>` : ''}
                    `,
                });
            } catch (emailError) {
                console.error('Failed to send approval email:', emailError);
                // Don't fail the request if email fails
            }

            res.status(200).json({
                message: 'Request approved successfully',
                data: request,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Approve request error:', error);
                res.status(500).json({ error: 'Failed to approve request' });
            }
        }
    }

    /**
     * Admin endpoint: Reject a request
     * POST /api/v1/requests/:id/reject
     */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const validatedData = reviewRequestSchema.parse(req.body);

            // Check if request exists
            const existing = await requestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            // RBAC: Admin can only reject requests for their stadium
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Request has already been reviewed' });
                return;
            }

            const request = await requestsService.rejectRequest(
                id,
                req.user!.userId,
                validatedData.reviewNotes
            );

            // Send rejection email
            try {
                await emailService.send({
                    to: existing.requesterEmail,
                    subject: 'Car Request Rejected',
                    text: `Your car request has been rejected.\n\nRequest Details:\n- Stadium: ${existing.stadium.name}\n- Department: ${existing.department.name}\n${validatedData.reviewNotes ? `\nReason: ${validatedData.reviewNotes}` : ''}`,
                    html: `
                        <h2>Your car request has been rejected</h2>
                        <p><strong>Stadium:</strong> ${existing.stadium.name}</p>
                        <p><strong>Department:</strong> ${existing.department.name}</p>
                        ${validatedData.reviewNotes ? `<p><strong>Reason:</strong> ${validatedData.reviewNotes}</p>` : ''}
                    `,
                });
            } catch (emailError) {
                console.error('Failed to send rejection email:', emailError);
                // Don't fail the request if email fails
            }

            res.status(200).json({
                message: 'Request rejected successfully',
                data: request,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject request error:', error);
                res.status(500).json({ error: 'Failed to reject request' });
            }
        }
    }

    /**
     * SuperAdmin endpoint: Delete a request
     * DELETE /api/v1/requests/:id
     */
    static async delete(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;

            // Check if request exists
            const existing = await requestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            await requestsService.deleteRequest(id);
            res.status(204).send();
        } catch (error) {
            console.error('Delete request error:', error);
            res.status(500).json({ error: 'Failed to delete request' });
        }
    }
}