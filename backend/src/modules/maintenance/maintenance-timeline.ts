export interface TimelineLog {
  reportedAt: Date | string | null;
  issueType: string | null;
  issueDescription: string;
  reportedBy?: { name: string | null; role: string | null; phone: string | null } | null;
  contractsEscalatedAt: Date | string | null;
  contractsEscalatedBy?: { name: string | null } | null;
  quotationRequestedAt: Date | string | null;
  costSubmittedAt: Date | string | null;
  quotationDescription: string | null;
  quotationTimeline: string | null;
  fixCost: number | null;
  costApprovedAt: Date | string | null;
  approvedBy?: { name: string | null } | null;
  rejectedAt: Date | string | null;
  rejectionReason: string | null;
  resolvedAt: Date | string | null;
  resolutionNotes: string | null;
}

export interface TimelineEvent {
  key: 'reported' | 'escalated' | 'quotation-requested' | 'cost-submitted' | 'cost-approved' | 'quotation-rejected' | 'resolved';
  label: string;
  at: string | null;
  by: string | null;
  detail: string | null;
}

const iso = (d: Date | string | null): string | null => {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const money = (n: number | null): string | null => (n == null ? null : `QAR ${n.toFixed(2)}`);

/**
 * Turn a MaintenanceLog into an ordered list of workflow events
 * (reported -> escalated -> quotation requested -> submitted -> approved/rejected
 * -> resolved). Ordered by workflow stage, NOT by timestamp. A stage with no
 * timestamp and no detail is omitted; "reported" is always present.
 */
export function maintenanceTimeline(log: TimelineLog): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  const reportedDetail = [
    log.issueType ? `[${log.issueType}]` : null,
    log.issueDescription || null,
  ].filter(Boolean).join(' ') || null;
  events.push({
    key: 'reported',
    label: 'Issue reported',
    at: iso(log.reportedAt),
    by: log.reportedBy?.name ?? null,
    detail: reportedDetail,
  });

  if (log.contractsEscalatedAt || log.contractsEscalatedBy?.name) {
    events.push({
      key: 'escalated',
      label: 'Escalated to Contracts',
      at: iso(log.contractsEscalatedAt),
      by: log.contractsEscalatedBy?.name ?? null,
      detail: null,
    });
  }

  if (log.quotationRequestedAt) {
    events.push({
      key: 'quotation-requested',
      label: 'Quotation requested',
      at: iso(log.quotationRequestedAt),
      by: null,
      detail: null,
    });
  }

  if (log.costSubmittedAt || log.fixCost != null || log.quotationDescription) {
    const detail = [
      money(log.fixCost),
      log.quotationTimeline ? `timeline ${log.quotationTimeline}` : null,
      log.quotationDescription || null,
    ].filter(Boolean).join(' · ') || null;
    events.push({
      key: 'cost-submitted',
      label: 'Quotation submitted',
      at: iso(log.costSubmittedAt),
      by: null,
      detail,
    });
  }

  if (log.costApprovedAt || log.approvedBy?.name) {
    events.push({
      key: 'cost-approved',
      label: 'Cost approved',
      at: iso(log.costApprovedAt),
      by: log.approvedBy?.name ?? null,
      detail: money(log.fixCost),
    });
  }

  if (log.rejectedAt || log.rejectionReason) {
    events.push({
      key: 'quotation-rejected',
      label: 'Quotation rejected',
      at: iso(log.rejectedAt),
      by: null,
      detail: log.rejectionReason || null,
    });
  }

  if (log.resolvedAt || log.resolutionNotes) {
    events.push({
      key: 'resolved',
      label: 'Resolved',
      at: iso(log.resolvedAt),
      by: null,
      detail: log.resolutionNotes || null,
    });
  }

  return events;
}
