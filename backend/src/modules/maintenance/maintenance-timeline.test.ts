import { describe, it, expect } from 'vitest';
import { maintenanceTimeline, TimelineLog } from './maintenance-timeline';

const empty: TimelineLog = {
  reportedAt: null, issueType: null, issueDescription: '', reportedBy: null,
  contractsEscalatedAt: null, contractsEscalatedBy: null,
  quotationRequestedAt: null, costSubmittedAt: null, quotationDescription: null,
  quotationTimeline: null, fixCost: null, costApprovedAt: null, approvedBy: null,
  rejectedAt: null, rejectionReason: null, resolvedAt: null, resolutionNotes: null,
};

describe('maintenanceTimeline', () => {
  it('always emits the reported event first, with reporter + issue detail', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueType: 'Brake issue',
      issueDescription: 'Pedal soft',
      reportedBy: { name: 'Sam FA', role: 'FA', phone: '999' },
    });
    expect(t[0].key).toBe('reported');
    expect(t[0].at).toBe('2026-09-01T08:00:00.000Z');
    expect(t[0].by).toBe('Sam FA');
    expect(t[0].detail).toContain('Brake issue');
    expect(t[0].detail).toContain('Pedal soft');
  });

  it('emits stages in workflow order, skipping stages with no data', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueDescription: 'x',
      quotationRequestedAt: '2026-09-02T00:00:00Z',
      costSubmittedAt: '2026-09-03T00:00:00Z',
      fixCost: 1200,
      quotationTimeline: '3 days',
      costApprovedAt: '2026-09-04T00:00:00Z',
      approvedBy: { name: 'Cora Contracts' },
      resolvedAt: '2026-09-05T00:00:00Z',
      resolutionNotes: 'Replaced pads',
    });
    expect(t.map(e => e.key)).toEqual([
      'reported', 'quotation-requested', 'cost-submitted', 'cost-approved', 'resolved',
    ]);
    expect(t.find(e => e.key === 'cost-submitted')!.detail).toContain('QAR 1200.00');
    expect(t.find(e => e.key === 'cost-submitted')!.detail).toContain('3 days');
    expect(t.find(e => e.key === 'cost-approved')!.by).toBe('Cora Contracts');
    expect(t.find(e => e.key === 'resolved')!.detail).toBe('Replaced pads');
  });

  it('includes escalation and rejection when present', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueDescription: 'x',
      contractsEscalatedAt: '2026-09-01T12:00:00Z',
      contractsEscalatedBy: { name: 'Ann Admin' },
      rejectedAt: '2026-09-03T00:00:00Z',
      rejectionReason: 'Too expensive',
    });
    const keys = t.map(e => e.key);
    expect(keys).toContain('escalated');
    expect(keys).toContain('quotation-rejected');
    expect(t.find(e => e.key === 'escalated')!.by).toBe('Ann Admin');
    expect(t.find(e => e.key === 'quotation-rejected')!.detail).toBe('Too expensive');
    expect(keys.indexOf('escalated')).toBe(1);
  });

  it('reported event still emits when reportedAt is null (uses description only)', () => {
    const t = maintenanceTimeline({ ...empty, issueDescription: 'No date issue' });
    expect(t).toHaveLength(1);
    expect(t[0].key).toBe('reported');
    expect(t[0].at).toBeNull();
    expect(t[0].detail).toContain('No date issue');
  });
});
