import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { makeReference, incidentReportPdf } from '../../services/pdf.service';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';

const INCIDENT_INCLUDE = {
  subjectUser: { select: { id: true, name: true, email: true, accreditationNumber: true, stadiumId: true, isBlocked: true } },
  reportedBy: { select: { id: true, name: true, role: true } },
  fleet: { select: { id: true, carNumber: true, carType: true, stadium: { select: { id: true, name: true, code: true } } } },
  stadium: { select: { id: true, name: true } },
  formSignedByUser: { select: { id: true, name: true } },
  warnings: {
    orderBy: { issuedAt: 'desc' as const },
    include: { issuedBy: { select: { name: true } } },
  },
};

export interface CreateIncidentData {
  subjectUserId: string;
  reportedById: string;
  title: string;
  description: string;
  occurredAt: Date;
  fleetId?: string;
  stadiumId?: string;
  photosUrls?: string[];
}

export class IncidentsService {
  async create(data: CreateIncidentData) {
    const row = await prisma.incident.create({
      data: {
        reference: randomUUID(), // transient, unique; replaced immediately below
        subjectUserId: data.subjectUserId,
        reportedById: data.reportedById,
        title: data.title,
        description: data.description,
        occurredAt: data.occurredAt,
        fleetId: data.fleetId ?? null,
        stadiumId: data.stadiumId ?? null,
        photosUrls: JSON.stringify(data.photosUrls ?? []),
      },
    });
    return prisma.incident.update({
      where: { id: row.id },
      data: { reference: makeReference('INC', row.id) },
      include: INCIDENT_INCLUDE,
    });
  }

  async list(filters: { stadiumId?: string; subjectUserId?: string; status?: string }, page = 1, limit = 50) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.subjectUserId) where.subjectUserId = filters.subjectUserId;
    if (filters.stadiumId) {
      where.OR = [
        { stadiumId: filters.stadiumId },
        { stadiumId: null, subjectUser: { stadiumId: filters.stadiumId } },
      ];
    }
    const [data, total] = await Promise.all([
      prisma.incident.findMany({ where, include: INCIDENT_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.incident.count({ where }),
    ]);
    return { data, total };
  }

  getById(id: string) {
    return prisma.incident.findUnique({ where: { id }, include: INCIDENT_INCLUDE });
  }

  updateStatus(id: string, status: string) {
    return prisma.incident.update({ where: { id }, data: { status }, include: INCIDENT_INCLUDE });
  }

  /** Save the fillable Golf Cart/UTV Incident Report Form fields (template-matched JSON blob). */
  saveFormData(id: string, formData: Record<string, unknown>) {
    return prisma.incident.update({ where: { id }, data: { formData: JSON.stringify(formData) }, include: INCIDENT_INCLUDE });
  }

  signForm(id: string, signatureData: string, signedById: string) {
    return prisma.incident.update({
      where: { id },
      data: { formSignatureData: signatureData, formSignedAt: new Date(), formSignedById: signedById },
      include: INCIDENT_INCLUDE,
    });
  }

  /** Escalate to Contracts and/or Maintenance teams for follow-up on the car involved. */
  async escalate(id: string, opts: { contracts?: boolean; maintenance?: boolean }) {
    const inc = await this.getById(id);
    if (!inc) throw new Error('INCIDENT_NOT_FOUND');

    const data: Record<string, unknown> = { escalatedAt: new Date() };
    if (opts.contracts) data.escalatedToContracts = true;
    if (opts.maintenance) data.escalatedToMaintenance = true;
    const updated = await prisma.incident.update({ where: { id }, data, include: INCIDENT_INCLUDE });

    const roles: string[] = [];
    if (opts.contracts) roles.push('Contracts');
    if (opts.maintenance) roles.push('MaintenanceTeam');
    if (roles.length) {
      const vars = {
        reference: inc.reference,
        incidentTitle: inc.title,
        carLine: inc.fleet?.carNumber ? ` (car ${inc.fleet.carNumber})` : '',
      };
      const push = await notificationTemplatesService.renderPush('incident_escalated', vars);
      if (push) {
        await notificationService.createForRoles(
          { type: 'IncidentEscalated', title: push.title, message: push.message, entityType: 'Incident', entityId: id },
          roles,
          inc.stadiumId ?? undefined,
        );
      }

      // Escalation also emails the full incident report (PDF) to every user in
      // the target role(s) — an in-app ping alone isn't enough for a team that
      // may not be logged into GCMS day-to-day.
      const rendered = await notificationTemplatesService.renderEmail('incident_escalated', vars);
      if (rendered) {
        const recipients = await prisma.user.findMany({
          where: { role: { in: roles }, isActive: true },
          select: { email: true },
        });
        if (recipients.length) {
          const report = await this.buildPdf(id);
          if (report) {
            for (const r of recipients) {
              try {
                await emailService.send({
                  to: r.email,
                  subject: rendered.subject,
                  text: rendered.body,
                  attachments: [{ filename: `${report.reference}.pdf`, content: report.buffer, contentType: 'application/pdf' }],
                });
              } catch (e) {
                console.error('Escalation report email failed:', r.email, e);
              }
            }
          }
        }
      }
    }
    return updated;
  }

  async buildPdf(id: string): Promise<{ buffer: Buffer; reference: string } | null> {
    const inc = await this.getById(id);
    if (!inc) return null;
    let photoCount = 0;
    try { photoCount = (JSON.parse((inc.photosUrls as string) || '[]') as unknown[]).length; } catch { photoCount = 0; }
    let formData: Record<string, unknown> | null = null;
    if (inc.formData) { try { formData = JSON.parse(inc.formData); } catch { formData = null; } }
    const buffer = await incidentReportPdf({
      data: {
        reference: inc.reference,
        title: inc.title,
        description: inc.description,
        status: inc.status,
        occurredAt: inc.occurredAt.toISOString(),
        subjectName: inc.subjectUser?.name ?? null,
        subjectFaCode: inc.subjectUser?.accreditationNumber ?? null,
        reporterName: inc.reportedBy?.name ?? null,
        carNumber: inc.fleet?.carNumber ?? null,
        stadiumName: inc.stadium?.name ?? inc.fleet?.stadium?.name ?? null,
        photoCount,
        formData,
        formSignedByName: inc.formSignedByUser?.name ?? null,
        formSignedAt: inc.formSignedAt ? inc.formSignedAt.toISOString() : null,
        escalatedToContracts: inc.escalatedToContracts,
        escalatedToMaintenance: inc.escalatedToMaintenance,
        warnings: inc.warnings.map((w) => ({
          reference: w.reference,
          level: w.level,
          reason: w.reason,
          issuedBy: w.issuedBy?.name ?? null,
          issuedAt: w.issuedAt.toISOString(),
          revoked: w.revoked,
        })),
      },
    });
    return { buffer, reference: inc.reference };
  }
}

export const incidentsService = new IncidentsService();
