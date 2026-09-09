import { describe, it, expect } from 'vitest';
import { deriveBookingState, BookingWindow } from './booking-state';

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
