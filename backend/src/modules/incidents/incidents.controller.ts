import { Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware';
import { incidentsService } from './incidents.service';
import { uploadFile, BUCKETS, uniqueFileToken } from '../../config/storage';
import { imageFileFilter } from '../../middleware/uploadFilters';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFileFilter });

const reportSchema = z.object({
  subjectUserId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  occurredAt: z.string().min(1),
  fleetId: z.string().optional(),
  stadiumId: z.string().optional(),
});
const statusSchema = z.object({ status: z.enum(['Open', 'UnderReview', 'Closed']) });
const formSchema = z.object({ formData: z.record(z.any()) });
const signSchema = z.object({ signatureData: z.string().min(1) });
const escalateSchema = z.object({ contracts: z.boolean().optional(), maintenance: z.boolean().optional() });

/** Admin may only touch incidents within their own venue (by incident stadium, or subject's venue when the incident has none). */
export function adminCanTouch(user: AuthRequest['user'], incident: { stadiumId: string | null; subjectUser?: { stadiumId: string | null } | null }): boolean {
  if (user?.role === 'SuperAdmin') return true;
  if (user?.role !== 'Admin') return true;
  const venue = incident.stadiumId ?? incident.subjectUser?.stadiumId ?? null;
  return !!user.stadiumId && venue === user.stadiumId;
}

export class IncidentsController {
  static uploadMiddleware = upload.array('photos', 5);

  static async report(req: AuthRequest, res: Response) {
    try {
      const body = reportSchema.parse(req.body);
      let photosUrls: string[] = [];
      if (Array.isArray(req.files) && req.files.length) {
        const files = req.files as Express.Multer.File[];
        photosUrls = await Promise.all(files.map((f, i) =>
          uploadFile(BUCKETS.INCIDENT_PHOTOS, `inc_${uniqueFileToken()}_${i}_${f.originalname.replace(/[^\w.-]/g, '')}`, f.buffer, f.mimetype),
        ));
      }
      const incident = await incidentsService.create({
        subjectUserId: body.subjectUserId,
        reportedById: req.user!.userId,
        title: body.title,
        description: body.description,
        occurredAt: new Date(body.occurredAt),
        fleetId: body.fleetId,
        stadiumId: body.stadiumId,
        photosUrls,
      });
      res.status(201).json({ message: 'Incident filed', data: incident });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else { console.error('Incident report failed:', error); res.status(500).json({ error: 'Failed to file incident' }); }
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const { status, subjectUserId, page, limit } = req.query as Record<string, string>;
      const stadiumId = req.user?.role === 'Admin' ? req.user.stadiumId : undefined;
      const result = await incidentsService.list(
        { status, subjectUserId, stadiumId },
        page ? parseInt(page) : undefined,
        limit ? parseInt(limit) : undefined,
      );
      res.status(200).json(result);
    } catch (error) {
      console.error('Incident list failed:', error);
      res.status(500).json({ error: 'Failed to list incidents' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      res.status(200).json({ data: inc });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch incident' });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const body = statusSchema.parse(req.body);
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const updated = await incidentsService.updateStatus(inc.id, body.status);
      res.status(200).json({ data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else res.status(500).json({ error: 'Failed to update incident' });
    }
  }

  static async saveForm(req: AuthRequest, res: Response) {
    try {
      const body = formSchema.parse(req.body);
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const updated = await incidentsService.saveFormData(inc.id, body.formData);
      res.status(200).json({ data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else { console.error('Save incident form failed:', error); res.status(500).json({ error: 'Failed to save incident report form' }); }
    }
  }

  static async signForm(req: AuthRequest, res: Response) {
    try {
      const body = signSchema.parse(req.body);
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const updated = await incidentsService.signForm(inc.id, body.signatureData, req.user!.userId);
      res.status(200).json({ data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else { console.error('Sign incident form failed:', error); res.status(500).json({ error: 'Failed to sign incident report form' }); }
    }
  }

  static async escalate(req: AuthRequest, res: Response) {
    try {
      const body = escalateSchema.parse(req.body);
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const updated = await incidentsService.escalate(inc.id, body);
      res.status(200).json({ message: 'Incident escalated', data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else { console.error('Escalate incident failed:', error); res.status(500).json({ error: 'Failed to escalate incident' }); }
    }
  }

  static async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const out = await incidentsService.buildPdf(inc.id);
      if (!out) { res.status(404).json({ error: 'Incident not found' }); return; }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${out.reference}.pdf`);
      res.send(out.buffer);
    } catch (error) {
      console.error('Incident PDF failed:', error);
      res.status(500).json({ error: 'Failed to generate incident PDF' });
    }
  }
}
