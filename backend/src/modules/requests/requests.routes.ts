import { Router, Request, Response, NextFunction } from 'express';
import { RequestsController } from './requests.controller';
import { authenticate, AuthRequest } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { submissionLimiter } from '../../middleware/rateLimit.middleware';
import { prisma } from '../../config/database';
import { invitationsService } from '../invitations/invitations.service';
import { verifyMicrosoftToken } from '../../services/microsoft-auth.service';

const router = Router();

// ============================================
// Public routes (no authentication required)
// ============================================

// Submitting and tracking a car request require login (security review 2026-09-29) —
// see the authenticated routes below. Only the emailed token link stays public.

// GET /api/v1/public/requests/:token - View request by token (confirmation page)
router.get('/public/requests/:token', (req: Request, res: Response) => RequestsController.getByTokenPublic(req, res));

// Venue/department lists are not anonymous (VAPT #4): a signed-in user, or someone on the
// account-request page holding a valid invitation (X-Invite-Token) or a verified SC/LOC
// Microsoft ID token (X-MS-Id-Token, issued by the SSO sign-in that found no account).
const lookupAccess = async (req: Request, res: Response, next: NextFunction) => {
    const invite = req.get('X-Invite-Token');
    const idToken = req.get('X-MS-Id-Token');
    if (!invite && !idToken) return authenticate(req as AuthRequest, res, next);
    try {
        if (invite) await invitationsService.validateForSubmission(invite);
        else await verifyMicrosoftToken(idToken!);
        next();
    } catch {
        res.status(401).json({ error: 'Not authorized' });
    }
};

// GET /api/v1/public/stadiums - List active stadiums (signed-in or account-request page)
router.get('/public/stadiums', lookupAccess, async (_req: Request, res: Response) => {
    try {
        const stadiums = await prisma.stadium.findMany({
            where: { isActive: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });
        res.json({ data: stadiums });
    } catch {
        res.status(500).json({ error: 'Failed to load stadiums' });
    }
});

// GET /api/v1/public/departments?stadiumId=xxx - List active departments (same access)
router.get('/public/departments', lookupAccess, async (req: Request, res: Response) => {
    try {
        const { stadiumId } = req.query;
        const where: Record<string, unknown> = { isActive: true };
        if (stadiumId) where.stadiumId = stadiumId as string;
        const departments = await prisma.department.findMany({
            where,
            select: { id: true, name: true, code: true, stadiumId: true },
            orderBy: { name: 'asc' },
        });
        res.json({ data: departments });
    } catch {
        res.status(500).json({ error: 'Failed to load departments' });
    }
});

// ============================================
// Admin routes (authentication required)
// ============================================

// Apply authentication to all routes below
router.use(authenticate);

// POST /api/v1/requests - Submit a car request as the signed-in user (any role)
router.post('/requests', submissionLimiter, (req: Request, res: Response) => RequestsController.createPublic(req as any, res));

// GET /api/v1/requests/track?number=N - Look up one of the signed-in user's own requests.
// Registered before '/requests/:id' so "track" is never captured as an id.
router.get('/requests/track', (req: Request, res: Response) => RequestsController.trackPublic(req as any, res));

// GET /api/v1/requests - Get all requests (filtered by role)
router.get('/requests', requireRole('SuperAdmin', 'Admin', 'Observer'), (req: Request, res: Response) => RequestsController.getAll(req as any, res));

// GET /api/v1/requests/export - Download the (filtered) request list as xlsx/pdf/docx
router.get('/requests/export', requireRole('SuperAdmin', 'Admin', 'Observer'), (req: Request, res: Response) => RequestsController.exportRequests(req as any, res));

// GET /api/v1/requests/:id - Get request by ID
router.get('/requests/:id', requireRole('SuperAdmin', 'Admin', 'Observer'), (req: Request, res: Response) => RequestsController.getById(req as any, res));

// POST /api/v1/requests/:id/email-requester - Ask the requester for more details
router.post('/requests/:id/email-requester', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.emailRequester(req as any, res));

// POST /api/v1/requests/:id/approve - Approve a request
router.post('/requests/:id/approve', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.approve(req as any, res));

// POST /api/v1/requests/:id/reject - Reject a request
router.post('/requests/:id/reject', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.reject(req as any, res));

// PATCH /api/v1/requests/:id/quantities - Update request quantities (edit before approve)
router.patch('/requests/:id/quantities', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) => RequestsController.updateQuantities(req as any, res));

// DELETE /api/v1/requests/:id - Delete a request (SuperAdmin only)
router.delete('/requests/:id', requireRole('SuperAdmin'), (req: Request, res: Response) => RequestsController.delete(req as any, res));

export default router;