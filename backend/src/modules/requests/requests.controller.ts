import { Response, Request } from 'express';
import { requestsService } from './requests.service';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { emailService } from '../../services/email.service';
import { settingsService } from '../settings/settings.service';
import * as ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } from 'docx';
import { renderPdf } from '../../services/pdf.service';

const createRequestSchema = z.object({
    requesterName: z.string().min(1, 'Name is required'),
    requesterEmail: z.string().email('Valid email is required'),
    requesterPhone: z.string().optional(),
    accreditationNumber: z.string().optional(),
    requestType: z.enum(['dedicated', 'pool-shared']).default('pool-shared'),
    departmentId: z.string().min(1, 'Department is required'),
    stadiumId: z.string().min(1, 'Stadium is required'),
    cargoCount: z.number().int().min(0).default(0),
    fourSeaterCount: z.number().int().min(0).default(0),
    sixSeaterCount: z.number().int().min(0).default(0),
    accessibilityCount: z.number().int().min(0).default(0),
    justification: z.string().min(1, 'Please explain why your department needs these carts'),
    notes: z.string().optional(),
});

const emailRequesterSchema = z.object({
    message: z.string().min(1, 'A message is required'),
});

const reviewRequestSchema = z.object({
    reviewNotes: z.string().optional(),
});

const updateQuantitiesSchema = z.object({
    cargoCount: z.number().int().min(0).optional(),
    fourSeaterCount: z.number().int().min(0).optional(),
    sixSeaterCount: z.number().int().min(0).optional(),
    accessibilityCount: z.number().int().min(0).optional(),
});

export class RequestsController {
    /**
     * Public endpoint: Create a new car request
     * POST /api/v1/public/requests
     */
    static async createPublic(req: Request, res: Response) {
        try {
            const windowState = await settingsService.getRequestWindowState();
            if (!windowState.isOpen) {
                res.status(403).json({ error: windowState.message || 'The request window is currently closed.' });
                return;
            }

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
     * Public endpoint: Track a request by its request number + the requester's own email
     * GET /api/v1/public/requests/track?number=123&email=jane@dept.org
     */
    static async trackPublic(req: Request, res: Response) {
        try {
            const number = parseInt(String(req.query.number || ''), 10);
            const email = String(req.query.email || '').trim();
            if (!number || !email) {
                res.status(400).json({ error: 'Request number and email are required' });
                return;
            }

            const request = await requestsService.getByNumberAndEmail(number, email);
            if (!request) {
                res.status(404).json({ error: 'No request found matching that number and email' });
                return;
            }

            res.status(200).json({ data: request });
        } catch (error) {
            console.error('Track request error:', error);
            res.status(500).json({ error: 'Failed to fetch request' });
        }
    }

    /**
     * Admin endpoint: Email the requester asking for more details
     * POST /api/v1/requests/:id/email-requester
     */
    static async emailRequester(req: AuthRequest, res: Response) {
        try {
            const { message } = emailRequesterSchema.parse(req.body);
            await requestsService.emailRequester(req.params.id as string, message);
            res.status(200).json({ message: 'Email sent to requester' });
        } catch (error: any) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Email requester error:', error);
                res.status(500).json({ error: error.message || 'Failed to email requester' });
            }
        }
    }

    /**
     * Admin endpoint: Get all requests with filters
     * GET /api/v1/requests
     */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId, departmentId, requestType, page, limit } = req.query;

            // RBAC: Admin can only see requests for their stadium
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const filters = {
                status: status as string,
                stadiumId: filterStadiumId,
                departmentId: departmentId as string,
                requestType: requestType as string | undefined,
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
     * Admin endpoint: Export the (filtered) request list as xlsx / pdf / docx —
     * full requested cars, types and departments, shareable outside the app.
     * GET /api/v1/requests/export?format=xlsx|pdf|docx
     */
    static async exportRequests(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId, departmentId, requestType, format } = req.query;
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') filterStadiumId = req.user.stadiumId;

            const { data: rows } = await requestsService.getAll({
                status: status as string,
                stadiumId: filterStadiumId,
                departmentId: departmentId as string,
                requestType: requestType as string | undefined,
            });

            const fmt = String(format || 'xlsx');
            const rowData = rows.map((r: any) => ({
                number: r.requestNumber,
                requester: r.requesterName,
                email: r.requesterEmail,
                stadium: r.stadium?.name ?? '—',
                stadiumCode: r.stadium?.code ?? '—',
                department: r.department?.name ?? '—',
                deptCode: r.department?.code ?? '—',
                type: r.requestType,
                cargo: r.cargoCount, fourSeater: r.fourSeaterCount, sixSeater: r.sixSeaterCount, accessibility: r.accessibilityCount,
                total: r.cargoCount + r.fourSeaterCount + r.sixSeaterCount + r.accessibilityCount,
                status: r.status,
                justification: r.justification ?? '',
                createdAt: new Date(r.createdAt).toLocaleDateString(),
            }));

            if (fmt === 'xlsx') {
                const wb = new ExcelJS.Workbook();
                const sheet = wb.addWorksheet('Car Requests');
                sheet.columns = [
                    { header: 'Request #', key: 'number', width: 10 },
                    { header: 'Requester', key: 'requester', width: 22 },
                    { header: 'Email', key: 'email', width: 26 },
                    { header: 'Venue', key: 'stadiumCode', width: 10 },
                    { header: 'Department', key: 'department', width: 22 },
                    { header: 'Dept Code', key: 'deptCode', width: 10 },
                    { header: 'Type', key: 'type', width: 12 },
                    { header: 'Cargo', key: 'cargo', width: 8 },
                    { header: '4-Seater', key: 'fourSeater', width: 10 },
                    { header: '6-Seater', key: 'sixSeater', width: 10 },
                    { header: 'Accessibility', key: 'accessibility', width: 12 },
                    { header: 'Total Carts', key: 'total', width: 12 },
                    { header: 'Status', key: 'status', width: 12 },
                    { header: 'Justification', key: 'justification', width: 40 },
                    { header: 'Submitted', key: 'createdAt', width: 14 },
                ];
                sheet.getRow(1).font = { bold: true };
                rowData.forEach(r => sheet.addRow(r));
                const buffer = await wb.xlsx.writeBuffer();
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', 'attachment; filename=car_requests.xlsx');
                res.send(buffer);
                return;
            }

            if (fmt === 'docx') {
                const headerRow = ['#', 'Requester', 'Venue', 'Department', 'Type', 'Carts', 'Status'];
                const table = new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({ children: headerRow.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
                        ...rowData.map(r => new TableRow({
                            children: [
                                String(r.number), r.requester, r.stadiumCode, `${r.department} (${r.deptCode})`,
                                r.type ?? '—', String(r.total), r.status,
                            ].map(v => new TableCell({ children: [new Paragraph(v)] })),
                        })),
                    ],
                });
                const doc = new Document({
                    sections: [{ children: [new Paragraph({ children: [new TextRun({ text: 'Car Requests Report', bold: true, size: 32 })] }), new Paragraph(''), table] }],
                });
                const buffer = await Packer.toBuffer(doc);
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
                res.setHeader('Content-Disposition', 'attachment; filename=car_requests.docx');
                res.send(buffer);
                return;
            }

            // PDF (default fallback)
            const buffer = await renderPdf(
                { title: 'Car Requests Report', subtitle: `${rowData.length} request(s)`, reference: `REQ-${Date.now().toString(36).toUpperCase()}` },
                (doc) => {
                    rowData.forEach((r, i) => {
                        if (i > 0) doc.moveDown(0.5);
                        doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
                            .text(`#${r.number} — ${r.requester} (${r.email})`);
                        doc.font('Helvetica').fontSize(9).fillColor('#333')
                            .text(`${r.stadiumCode} · ${r.department} (${r.deptCode}) · ${r.type} · ${r.status}`);
                        doc.text(`Carts — Cargo: ${r.cargo}  4-Seater: ${r.fourSeater}  6-Seater: ${r.sixSeater}  Accessibility: ${r.accessibility}  (Total: ${r.total})`);
                        if (r.justification) doc.text(`Justification: ${r.justification}`);
                        doc.fillColor('#000');
                    });
                    if (rowData.length === 0) doc.text('No requests match the selected filters.');
                },
            );
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=car_requests.pdf');
            res.end(buffer);
        } catch (error) {
            console.error('Export requests error:', error);
            res.status(500).json({ error: 'Failed to export requests' });
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

    /**
     * Admin/SuperAdmin endpoint: Update request quantities before approving
     * PATCH /api/v1/requests/:id/quantities
     */
    static async updateQuantities(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const validatedData = updateQuantitiesSchema.parse(req.body);

            // Check if request exists
            const existing = await requestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            // RBAC: Admin can only edit requests for their stadium
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            if (existing.status !== 'Pending') {
                res.status(400).json({ error: 'Cannot edit quantities for a request that has already been reviewed' });
                return;
            }

            // Ensure at least one quantity remains after update
            const newCargo = validatedData.cargoCount ?? existing.cargoCount;
            const newFourSeater = validatedData.fourSeaterCount ?? existing.fourSeaterCount;
            const newSixSeater = validatedData.sixSeaterCount ?? existing.sixSeaterCount;
            const newAccessibility = validatedData.accessibilityCount ?? existing.accessibilityCount;

            if (newCargo + newFourSeater + newSixSeater + newAccessibility === 0) {
                res.status(400).json({ error: 'At least one cart type must have a quantity greater than 0' });
                return;
            }

            const request = await requestsService.updateQuantities(id, {
                cargoCount: newCargo,
                fourSeaterCount: newFourSeater,
                sixSeaterCount: newSixSeater,
                accessibilityCount: newAccessibility,
            });

            res.status(200).json({
                message: 'Request quantities updated successfully',
                data: request,
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Update quantities error:', error);
                res.status(500).json({ error: 'Failed to update quantities' });
            }
        }
    }
}