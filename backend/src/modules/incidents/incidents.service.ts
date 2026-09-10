import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { makeReference, incidentReportPdf } from '../../services/pdf.service';

const INCIDENT_INCLUDE = {
  subjectUser: { select: { id: true, name: true, email: true, accreditationNumber: true, stadiumId: true, isBlocked: true } },
  reportedBy: { select: { id: true, name: true, role: true } },
  fleet: { select: { id: true, carNumber: true } },
  stadium: { select: { id: true, name: true } },
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

  async buildPdf(id: string): Promise<{ buffer: Buffer; reference: string } | null> {
    const inc = await this.getById(id);
    if (!inc) return null;
    let photoCount = 0;
    try { photoCount = (JSON.parse((inc.photosUrls as string) || '[]') as unknown[]).length; } catch { photoCount = 0; }
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
        stadiumName: inc.stadium?.name ?? null,
        photoCount,
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
