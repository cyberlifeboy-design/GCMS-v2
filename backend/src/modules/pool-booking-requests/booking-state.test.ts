import { describe, it, expect } from 'vitest';
import { deriveBookingState, BookingWindow, keyCheckState } from './booking-state';

const base: BookingWindow = {
  status: 'Approved',
  startDate: '2026-06-10', endDate: '2026-06-10',
  startTime: '09:00', endTime: '17:00',
  returnedAt: null,
};
const at = (s: string) => new Date(s);

describe('deriveBookingState', () => {
  it('passes non-approved statuses straight through', () => {
    expect(deriveBookingState({ ...base, status: 'Pending' }, at('2026-06-10T10:00:00'))).toBe('Pending');
    expect(deriveBookingState({ ...base, status: 'Rejected' }, at('2026-06-10T10:00:00'))).toBe('Rejected');
    expect(deriveBookingState({ ...base, status: 'Cancelled' }, at('2026-06-10T10:00:00'))).toBe('Cancelled');
  });

  it('is Completed when returnedAt is set, whatever the clock says', () => {
    expect(deriveBookingState({ ...base, returnedAt: new Date() }, at('2026-06-10T10:00:00'))).toBe('Completed');
    expect(deriveBookingState({ ...base, status: 'Completed', returnedAt: '2026-06-10T12:00:00Z' }, at('2026-06-11T00:00:00'))).toBe('Completed');
  });

  it('is Upcoming before the window starts', () => {
    expect(deriveBookingState(base, at('2026-06-10T08:59:00'))).toBe('Upcoming');
    expect(deriveBookingState(base, at('2026-06-09T23:00:00'))).toBe('Upcoming');
  });

  it('is Active inside the window (inclusive of the bounds)', () => {
    expect(deriveBookingState(base, at('2026-06-10T09:00:00'))).toBe('Active');
    expect(deriveBookingState(base, at('2026-06-10T13:00:00'))).toBe('Active');
    expect(deriveBookingState(base, at('2026-06-10T17:00:00'))).toBe('Active');
  });

  it('is Overdue after the window ends and not returned', () => {
    expect(deriveBookingState(base, at('2026-06-10T17:01:00'))).toBe('Overdue');
    expect(deriveBookingState(base, at('2026-06-12T00:00:00'))).toBe('Overdue');
  });

  it('handles multi-day windows', () => {
    const multi = { ...base, startDate: '2026-06-10', endDate: '2026-06-14' };
    expect(deriveBookingState(multi, at('2026-06-12T03:00:00'))).toBe('Active');
    expect(deriveBookingState(multi, at('2026-06-14T17:30:00'))).toBe('Overdue');
  });
});

describe('keyCheckState', () => {
  const k = { status: 'Approved', startDate: '2026-06-10', startTime: '09:00', reviewedAt: at('2026-06-10T08:00:00'), keyCollectedAt: null };

  it('counts from the booked start when approval came earlier', () => {
    expect(keyCheckState(k, at('2026-06-10T09:09:00'))).toBe('waiting');
    expect(keyCheckState(k, at('2026-06-10T09:10:00'))).toBe('ask');
    expect(keyCheckState(k, at('2026-06-10T09:15:00'))).toBe('release');
    expect(keyCheckState(k, at('2026-06-10T10:15:00'))).toBe('stale');
  });

  it('counts from approval when approved after the start (instant bookings)', () => {
    expect(keyCheckState({ ...k, reviewedAt: at('2026-06-10T12:00:00') }, at('2026-06-10T12:09:59'))).toBe('waiting');
    expect(keyCheckState({ ...k, reviewedAt: at('2026-06-10T12:00:00') }, at('2026-06-10T12:12:00'))).toBe('ask');
  });

  it('is null once the key is collected or the booking is not approved', () => {
    expect(keyCheckState({ ...k, keyCollectedAt: at('2026-06-10T09:05:00') }, at('2026-06-10T09:20:00'))).toBeNull();
    expect(keyCheckState({ ...k, status: 'Pending', reviewedAt: null }, at('2026-06-10T09:20:00'))).toBeNull();
  });
});
