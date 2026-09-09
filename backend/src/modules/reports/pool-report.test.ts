import { describe, it, expect } from 'vitest';
import { summarizePoolBookings, PoolBookingInput } from './pool-report';

const base: Omit<PoolBookingInput, 'id' | 'status'> = {
  startDate: '2026-09-09', endDate: '2026-09-09', startTime: '08:00', endTime: '10:00',
  returnedAt: null, createdAt: '2026-09-09T07:00:00Z', fleetId: 'f1',
  carNumber: 'C-1', stadiumName: 'Lusail',
};
const now = new Date('2026-09-09T09:00:00');

describe('summarizePoolBookings', () => {
  it('counts totals and derived states', () => {
    const rows: PoolBookingInput[] = [
      { ...base, id: '1', status: 'Approved' },                         // Active (08:00-10:00, now 09:00)
      { ...base, id: '2', status: 'Approved', startTime: '06:00', endTime: '07:00' }, // Overdue
      { ...base, id: '3', status: 'Pending' },                          // Pending
      { ...base, id: '4', status: 'Approved', returnedAt: '2026-09-09T09:30:00Z', createdAt: '2026-09-09T07:30:00Z' }, // Completed, 2h
    ];
    const s = summarizePoolBookings(rows, now);
    expect(s.total).toBe(4);
    expect(s.byState.Active).toBe(1);
    expect(s.byState.Overdue).toBe(1);
    expect(s.byState.Pending).toBe(1);
    expect(s.byState.Completed).toBe(1);
    expect(s.overdueCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.avgDurationHours).toBe(2);
  });

  it('groups by car and venue sorted by count desc', () => {
    const rows: PoolBookingInput[] = [
      { ...base, id: '1', status: 'Approved', carNumber: 'C-2', stadiumName: 'Lusail' },
      { ...base, id: '2', status: 'Approved', carNumber: 'C-2', stadiumName: 'Lusail' },
      { ...base, id: '3', status: 'Approved', carNumber: 'C-1', stadiumName: 'Al Bayt' },
    ];
    const s = summarizePoolBookings(rows, now);
    expect(s.byCar[0]).toEqual({ carNumber: 'C-2', count: 2 });
    expect(s.byCar[1]).toEqual({ carNumber: 'C-1', count: 1 });
    expect(s.byVenue[0]).toEqual({ stadiumName: 'Lusail', count: 2 });
  });

  it('returns null avg duration when nothing returned', () => {
    const s = summarizePoolBookings([{ ...base, id: '1', status: 'Approved' }], now);
    expect(s.avgDurationHours).toBeNull();
  });

  it('handles an empty list', () => {
    const s = summarizePoolBookings([], now);
    expect(s).toEqual({
      total: 0, byState: {}, byCar: [], byVenue: [],
      overdueCount: 0, completedCount: 0, avgDurationHours: null,
    });
  });
});
