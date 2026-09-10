import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../config/database';
import { incidentsService } from './incidents.service';
import { warningsService } from './warnings.service';
import { adminCanTouch } from './incidents.controller';

const issueSchema = z.object({
  userId: z.string().min(1).optional(), // required for standalone POST /warnings
  level: z.number().int().min(1).max(3),
  reason: z.string().min(1),
  incidentId: z.string().optional(),
});
const revokeSchema = z.object({ unblock: z.boolean().optional() });

export class WarningsController {
  static async issueForIncident(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const body = issueSchema.parse(req.body);
      const { warning, blocked } = await warningsService.issue({
        userId: inc.subjectUserId,
        issuedById: req.user!.userId,
        level: body.level,
        reason: body.reason,
        incidentId: inc.id,
      });
      res.status(201).json({ message: blocked ? 'Warning issued — user blocked' : 'Warning issued', data: warning, blocked });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else if ((error as any)?.message === 'USER_NOT_FOUND') res.status(404).json({ error: 'Subject user not found' });
      else { console.error('Issue warning failed:', error); res.status(500).json({ error: 'Failed to issue warning' }); }
    }
  }

  static async issueStandalone(req: AuthRequest, res: Response) {
    try {
      const body = issueSchema.parse(req.body);
      if (!body.userId) { res.status(400).json({ error: 'userId is required' }); return; }
      if (req.user?.role === 'Admin') {
        const u = await prisma.user.findUnique({ where: { id: body.userId }, select: { stadiumId: true } });
        if (!u || !req.user.stadiumId || u.stadiumId !== req.user.stadiumId) {
          res.status(403).json({ error: 'Access denied' });
          return;
        }
      }
      const { warning, blocked } = await warningsService.issue({
        userId: body.userId,
        issuedById: req.user!.userId,
        level: body.level,
        reason: body.reason,
        incidentId: body.incidentId,
      });
      res.status(201).json({ message: blocked ? 'Warning issued — user blocked' : 'Warning issued', data: warning, blocked });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else if ((error as any)?.message === 'USER_NOT_FOUND') res.status(404).json({ error: 'Subject user not found' });
      else { console.error('Issue warning failed:', error); res.status(500).json({ error: 'Failed to issue warning' }); }
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const { userId, level, revoked } = req.query as Record<string, string>;
      const rows = await warningsService.list({
        userId,
        level: level ? parseInt(level) : undefined,
        revoked: revoked == null ? undefined : revoked === 'true',
      });
      res.status(200).json({ data: rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list warnings' });
    }
  }

  static async revoke(req: AuthRequest, res: Response) {
    try {
      const body = revokeSchema.parse(req.body);
      const { warning, unblocked } = await warningsService.revoke(req.params.id as string, req.user!.userId, !!body.unblock);
      res.status(200).json({ message: unblocked ? 'Warning revoked — user unblocked' : 'Warning revoked', data: warning, unblocked });
    } catch (error) {
      if ((error as any)?.message === 'WARNING_NOT_FOUND') res.status(404).json({ error: 'Warning not found' });
      else if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else res.status(500).json({ error: 'Failed to revoke warning' });
    }
  }
}
