import { Response, Request } from 'express';
import { z } from 'zod';
import * as ExcelJS from 'exceljs';
import { poolBookingRequestsService } from './pool-booking-requests.service';
import { stadiumsService } from '../stadiums/stadiums.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { resolveStadiumScope } from '../reports/reports.scope';
import { bookingHistoryPdf, makeReference } from '../../services/pdf.service';
import { settingsService } from '../settings/settings.service';

const createSchema = z.object({
    stadiumId: z.string().min(1),
    fleetId: z.string().min(1),
    requesterName: z.string().min(1),
    requesterEmail: z.string().email(),
    requesterPhone: z.string().min(1),
    faUserId: z.string().min(1),
    bookingType: z.enum(['Single', 'Recurring']),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
    purpose: z.string().optional(),
});

const approveSchema = z.object({
    comment: z.string().optional(),
});

const rejectSchema = z.object({
    comment: z.string().min(1, 'A comment is required when rejecting a booking'),
});

const extensionRequestSchema = z.object({
    endDate: z.string().min(1),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
});
const extensionReviewSchema = z.object({ approve: z.boolean() });

const amendSchema = z.object({
    fleetId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    faUserId: z.string().optional(),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled']).optional(),
    comment: z.string().optional(),
});

export class PoolBookingRequestsController {
    /**
     * Checks a requested daily time window against the venue's configured pool-booking
     * operating hours. Times are "HH:mm" strings, so plain string comparison is correct.
     * Returns an error message when the window falls outside the configured hours, or
     * null when it fits — or when the venue has no hours configured (no restriction).
     */
    private static async operatingHoursError(
        stadiumId: string,
        startTime: string,
        endTime: string,
    ): Promise<string | null> {
        const { poolBookingStartTime, poolBookingEndTime } = await stadiumsService.getPoolBookingHours(stadiumId);
        if (!poolBookingStartTime || !poolBookingEndTime) return null;
        if (startTime < poolBookingStartTime || endTime > poolBookingEndTime) {
            return `Booking time must be within this venue's operating hours (${poolBookingStartTime}–${poolBookingEndTime})`;
        }
        return null;
    }

    /** POST /api/v1/public/pool-booking-requests */
    static async createPublic(req: AuthRequest, res: Response) {
        try {
            const windowState = await settingsService.getRequestWindowState();
            if (!windowState.isOpen) {
                res.status(403).json({ error: windowState.message || 'The request window is currently closed.' });
                return;
            }

            const data = createSchema.parse(req.body);
            if (data.endDate < data.startDate) {
                res.status(400).json({ error: 'End date cannot be before start date' });
                return;
            }
            if (data.endTime <= data.startTime) {
                res.status(400).json({ error: 'End time must be after start time' });
                return;
            }
            const hoursError = await PoolBookingRequestsController.operatingHoursError(
                data.stadiumId,
                data.startTime,
                data.endTime,
            );
            if (hoursError) {
                res.status(400).json({ error: hoursError });
                return;
            }
            const booking = await poolBookingRequestsService.create({ ...data, createdById: req.user?.userId });
            res.status(201).json({ message: 'Booking request submitted', data: booking });
        } catch (error) {
            const err = error as Error & { code?: string };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.code === 'P2003') {
                console.error('Create pool booking request error:', error);
                res.status(400).json({ error: 'One or more selected values (cart, FA, or venue) do not exist. Please review your selections and try again.' });
            } else if (!err.code && err.message) {
                // Validation failures raised by the service (cross-field integrity,
                // unknown venue) are plain Errors with a safe message — surface them
                // as a clean 400, consistent with approve/reject/amend. Anything
                // carrying a driver error code falls through to the generic 500 so no
                // raw Prisma text ever reaches a public caller.
                console.error('Create pool booking request error:', error);
                res.status(400).json({ error: err.message });
            } else {
                console.error('Create pool booking request error:', error);
                res.status(500).json({ error: 'Failed to submit booking request' });
            }
        }
    }

    /** GET /api/v1/public/pool-booking-requests/:token */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const booking = await poolBookingRequestsService.getByToken(req.params.token as string);
            if (!booking) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            res.json({ data: booking });
        } catch (error) {
            console.error('Get pool booking request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch booking request' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/fas */
    static async getFAsPublic(req: Request, res: Response) {
        try {
            const fas = await poolBookingRequestsService.getFAsForStadium(req.params.stadiumId as string);
            res.json({ data: fas });
        } catch (error) {
            console.error('Get FAs for stadium error:', error);
            res.status(500).json({ error: 'Failed to fetch FAs' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/available-carts */
    static async getAvailableCartsPublic(req: Request, res: Response) {
        try {
            const { startDate, endDate, startTime, endTime, excludeBookingId } = req.query;
            if (!startDate || !endDate || !startTime || !endTime) {
                res.status(400).json({ error: 'startDate, endDate, startTime and endTime are required' });
                return;
            }
            const carts = await poolBookingRequestsService.getAvailableCarts(
                req.params.stadiumId as string,
                startDate as string,
                endDate as string,
                startTime as string,
                endTime as string,
                excludeBookingId as string | undefined,
            );
            res.json({ data: carts });
        } catch (error) {
            console.error('Get available carts error:', error);
            res.status(500).json({ error: 'Failed to fetch available carts' });
        }
    }

    /** GET /api/v1/pool-booking-requests */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            // Admin and FA are venue-locked; a client stadiumId is ignored for them.
            const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
            const data = await poolBookingRequestsService.getAll({
                status: req.query.status as string | undefined,
                stadiumId,
                derivedState: req.query.derivedState as string | undefined,
            });
            res.json({ data });
        } catch (error) {
            console.error('Get all pool booking requests error:', error);
            res.status(500).json({ error: 'Failed to fetch booking requests' });
        }
    }

    /** GET /api/v1/pool-booking-requests/history */
    static async history(req: AuthRequest, res: Response) {
        try {
            const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
            const data = await poolBookingRequestsService.getHistory({
                stadiumId,
                fleetId: req.query.fleetId as string | undefined,
                status: req.query.status as string | undefined,
                derivedState: req.query.derivedState as string | undefined,
                fromDate: req.query.fromDate as string | undefined,
                toDate: req.query.toDate as string | undefined,
                q: req.query.q as string | undefined,
            });
            res.json({ data });
        } catch (error) {
            console.error('Pool booking history error:', error);
            res.status(500).json({ error: 'Failed to load booking history' });
        }
    }

    /** GET /api/v1/pool-booking-requests/history/export?format=pdf|xlsx */
    static async exportHistory(req: AuthRequest, res: Response) {
        try {
            const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
            const format = (req.query.format as string) || 'pdf';
            const rows = await poolBookingRequestsService.getHistory({
                stadiumId,
                fleetId: req.query.fleetId as string | undefined,
                status: req.query.status as string | undefined,
                derivedState: req.query.derivedState as string | undefined,
                fromDate: req.query.fromDate as string | undefined,
                toDate: req.query.toDate as string | undefined,
                q: req.query.q as string | undefined,
            });
            const summary = [
                stadiumId ? `venue=${stadiumId}` : 'all venues',
                req.query.fromDate ? `from ${req.query.fromDate}` : null,
                req.query.toDate ? `to ${req.query.toDate}` : null,
                req.query.status ? `status=${req.query.status}` : null,
                req.query.derivedState ? `state=${req.query.derivedState}` : null,
            ].filter(Boolean).join('  ·  ');
            const reference = makeReference('BKH', (rows[0] as { id?: string })?.id ?? 'NONE00');

            if (format === 'xlsx') {
                const wb = new ExcelJS.Workbook();
                const ws = wb.addWorksheet('Booking History');
                ws.columns = [
                    { header: 'Car', key: 'car', width: 14 }, { header: 'Type', key: 'type', width: 14 },
                    { header: 'Venue', key: 'venue', width: 22 }, { header: 'State', key: 'state', width: 12 },
                    { header: 'Requester', key: 'req', width: 22 }, { header: 'FA', key: 'fa', width: 12 },
                    { header: 'Phone', key: 'phone', width: 16 }, { header: 'Email', key: 'email', width: 26 },
                    { header: 'Booking type', key: 'btype', width: 12 },
                    { header: 'From', key: 'from', width: 18 }, { header: 'To', key: 'to', width: 18 },
                    { header: 'Returned At', key: 'ret', width: 20 },
                ];
                rows.forEach((r: any) => ws.addRow({
                    car: r.fleet?.carNumber, type: r.fleet?.carType, venue: r.stadium?.name,
                    state: r.derivedState, req: r.requesterName, fa: r.faUser?.accreditationNumber ?? '',
                    phone: r.requesterPhone, email: r.requesterEmail, btype: r.bookingType,
                    from: `${r.startDate} ${r.startTime}`, to: `${r.endDate} ${r.endTime}`,
                    ret: r.returnedAt ? new Date(r.returnedAt).toLocaleString() : '',
                }));
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=booking_history_${reference}.xlsx`);
                await wb.xlsx.write(res);
                res.end();
                return;
            }

            const pdf = await bookingHistoryPdf({ rows: rows as any[], filterSummary: summary || 'all bookings', reference });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=booking_history_${reference}.pdf`);
            res.end(pdf);
        } catch (error) {
            console.error('Pool booking history export error:', error);
            res.status(500).json({ error: 'Failed to export booking history' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/return */
    static async markReturned(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            const data = await poolBookingRequestsService.markReturned(id, req.user!.userId);
            res.json({ message: 'Booking marked returned', data });
        } catch (error) {
            const err = error as Error;
            console.error('Mark returned error:', error);
            res.status(400).json({ error: err.message || 'Failed to mark booking returned' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/approve */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = approveSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.approve(id, req.user!.userId, comment);
            res.json({ message: 'Booking approved', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown; code?: string };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else if (err.code === 'P2003') {
                console.error('Approve pool booking error:', error);
                res.status(400).json({ error: 'One or more selected values (cart, FA, or venue) do not exist. Please review your selections and try again.' });
            } else {
                console.error('Approve pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to approve booking' });
            }
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/reject */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = rejectSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.reject(id, req.user!.userId, comment);
            res.json({ message: 'Booking rejected', data: booking });
        } catch (error) {
            const err = error as Error;
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to reject booking' });
            }
        }
    }

    /** POST /api/v1/pool-booking-requests/:id/extension — FA requests more time */
    static async requestExtension(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { endDate, endTime } = extensionRequestSchema.parse(req.body);
            const booking = await poolBookingRequestsService.requestExtension(id, req.user!.userId, endDate, endTime);
            res.json({ message: 'Extension requested', data: booking });
        } catch (error) {
            const err = error as Error;
            if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
            else res.status(400).json({ error: err.message || 'Failed to request extension' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/extension — Admin/SuperAdmin approves or rejects */
    static async reviewExtension(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { approve } = extensionReviewSchema.parse(req.body);
            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) { res.status(404).json({ error: 'Booking request not found' }); return; }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
            const booking = await poolBookingRequestsService.reviewExtension(id, approve, req.user!.userId);
            res.json({ message: approve ? 'Extension approved' : 'Extension rejected', data: booking });
        } catch (error) {
            const err = error as Error;
            if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
            else res.status(400).json({ error: err.message || 'Failed to review extension' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id */
    static async amend(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const data = amendSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const { comment, ...rest } = data;

            // Enforce the venue's operating hours against the merged (post-amend)
            // window. Amend can't move a booking to another venue, so the booking's
            // current stadium is the one whose hours apply.
            const mergedStartTime = rest.startTime ?? existing.startTime;
            const mergedEndTime = rest.endTime ?? existing.endTime;
            if (mergedStartTime && mergedEndTime) {
                const hoursError = await PoolBookingRequestsController.operatingHoursError(
                    existing.stadiumId,
                    mergedStartTime,
                    mergedEndTime,
                );
                if (hoursError) {
                    res.status(400).json({ error: hoursError });
                    return;
                }
            }

            const booking = await poolBookingRequestsService.amend(id, rest, req.user!.userId, comment);
            res.json({ message: 'Booking updated', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown; code?: string };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else if (err.code === 'P2003') {
                console.error('Amend pool booking error:', error);
                res.status(400).json({ error: 'One or more selected values (cart, FA, or venue) do not exist. Please review your selections and try again.' });
            } else {
                console.error('Amend pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to update booking' });
            }
        }
    }
}
