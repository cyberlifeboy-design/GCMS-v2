import { describe, it, expect } from 'vitest';
import { buildPublicBookerRows, PublicBookingRow } from './public-bookers';

const row = (over: Partial<PublicBookingRow>): PublicBookingRow => ({
  requesterEmail: 'ext@x.com', requesterName: 'Ext User', requesterPhone: '999',
  faAccreditationNumber: 'FA-1', createdAt: '2026-09-01T10:00:00Z', ...over,
});

describe('buildPublicBookerRows', () => {
  it('excludes bookers who have a user account', () => {
    const rows = buildPublicBookerRows(
      [row({ requesterEmail: 'staff@gcms.com' }), row({ requesterEmail: 'ext@x.com' })],
      new Set(['staff@gcms.com']),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ext@x.com');
    expect(rows[0].source).toBe('public-booking');
  });

  it('aggregates by email: count + latest date, case-insensitive', () => {
    const rows = buildPublicBookerRows([
      row({ requesterEmail: 'ext@x.com', createdAt: '2026-09-01T00:00:00Z' }),
      row({ requesterEmail: 'EXT@x.com', createdAt: '2026-09-05T00:00:00Z' }),
    ], new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0].bookingCount).toBe(2);
    expect(rows[0].lastBookingAt).toBe('2026-09-05T00:00:00.000Z');
  });

  it('carries name/phone/faCode from the most recent booking', () => {
    const rows = buildPublicBookerRows([
      row({ createdAt: '2026-09-01T00:00:00Z', requesterName: 'Old', faAccreditationNumber: 'FA-OLD' }),
      row({ createdAt: '2026-09-09T00:00:00Z', requesterName: 'New', faAccreditationNumber: 'FA-NEW', requesterPhone: '111' }),
    ], new Set());
    expect(rows[0].name).toBe('New');
    expect(rows[0].phone).toBe('111');
    expect(rows[0].faCode).toBe('FA-NEW');
  });

  it('returns [] for no input', () => {
    expect(buildPublicBookerRows([], new Set())).toEqual([]);
  });
});
