import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { activeWarningCount, shouldBlock } from './warning-rules';
import { makeReference, warningLetterPdf } from '../../services/pdf.service';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';
import { notificationTemplatesService } from '../notification-templates/notification-templates.service';
import { incidentsService } from './incidents.service';

const WARNING_INCLUDE = {
  user: { select: { id: true, name: true, accreditationNumber: true } },
  issuedBy: { select: { name: true } },
  revokedBy: { select: { name: true } },
  incident: { select: { id: true, reference: true } },
};

export interface IssueWarningData {
  userId: string;
  issuedById: string;
  level: number;
  reason: string;
  incidentId?: string;
}

export class WarningsService {
  async issue(data: IssueWarningData): Promise<{ warning: any; blocked: boolean }> {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: {
        id: true, name: true, email: true, accreditationNumber: true, isBlocked: true,
        warnings: { select: { level: true, revoked: true } },
      },
    });
    if (!user) throw new Error('USER_NOT_FOUND');

    const created = await prisma.warning.create({
      data: {
        reference: randomUUID(), // transient, unique; replaced immediately below
        userId: data.userId,
        issuedById: data.issuedById,
        level: data.level,
        reason: data.reason,
        incidentId: data.incidentId ?? null,
      },
    });
    const reference = makeReference('WRN', created.id);
    const warning = await prisma.warning.update({
      where: { id: created.id },
      data: { reference },
      include: WARNING_INCLUDE,
    });

    const activeCount = activeWarningCount([...user.warnings, { level: data.level, revoked: false }]);
    const blocked = shouldBlock(data.level, activeCount);
    if (blocked && !user.isBlocked) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isBlocked: true,
          blockedAt: new Date(),
          blockedReason: `${reference}: ${data.reason}`,
          blockedById: data.issuedById,
        },
      });
    }

    const warningPush = await notificationTemplatesService.renderPush('warning_notice', { level: String(data.level), reason: data.reason });
    if (warningPush) {
      await notificationService.create({
        type: 'warning',
        title: warningPush.title,
        message: warningPush.message,
        entityType: 'Warning',
        entityId: warning.id,
        userId: user.id,
      });
    }

    try {
      let attachment: { filename: string; content: Buffer; contentType: string };
      if (data.incidentId) {
        const inc = await incidentsService.buildPdf(data.incidentId);
        if (!inc) throw new Error('incident PDF unavailable');
        attachment = { filename: `${inc.reference}.pdf`, content: inc.buffer, contentType: 'application/pdf' };
      } else {
        const buf = await warningLetterPdf({
          data: {
            reference,
            level: data.level,
            reason: data.reason,
            subjectName: user.name,
            subjectFaCode: user.accreditationNumber ?? null,
            issuedBy: warning.issuedBy?.name ?? null,
            issuedAt: warning.issuedAt.toISOString(),
            activeWarningCount: activeCount,
            incidentReference: warning.incident?.reference ?? null,
            blocked,
          },
        });
        attachment = { filename: `${reference}.pdf`, content: buf, contentType: 'application/pdf' };
      }
      const rendered = await notificationTemplatesService.renderEmail('warning_notice', {
        reference,
        level: String(data.level),
        reason: data.reason,
        blockedLine: blocked ? '\nYour account has been blocked. Contact the administrator.\n' : '',
      });
      if (rendered) {
        await emailService.send({ to: user.email, subject: rendered.subject, text: rendered.body, attachments: [attachment] });
      }
    } catch (err) {
      console.error('Warning email failed (non-fatal):', err);
    }

    return { warning, blocked };
  }

  list(filters: { userId?: string; level?: number; revoked?: boolean }) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.level != null) where.level = filters.level;
    if (filters.revoked != null) where.revoked = filters.revoked;
    return prisma.warning.findMany({ where, orderBy: { issuedAt: 'desc' }, include: WARNING_INCLUDE });
  }

  async revoke(id: string, revokedById: string, alsoUnblock: boolean): Promise<{ warning: any; unblocked: boolean }> {
    const existing = await prisma.warning.findUnique({
      where: { id },
      include: { user: { select: { id: true, blockedReason: true } } },
    });
    if (!existing) throw new Error('WARNING_NOT_FOUND');

    const warning = await prisma.warning.update({
      where: { id },
      data: { revoked: true, revokedById, revokedAt: new Date() },
      include: WARNING_INCLUDE,
    });

    let unblocked = false;
    if (alsoUnblock && existing.user.blockedReason?.startsWith(existing.reference)) {
      await prisma.user.update({
        where: { id: existing.user.id },
        data: { isBlocked: false, blockedAt: null, blockedReason: null, blockedById: null },
      });
      unblocked = true;
    }
    return { warning, unblocked };
  }
}

export const warningsService = new WarningsService();
