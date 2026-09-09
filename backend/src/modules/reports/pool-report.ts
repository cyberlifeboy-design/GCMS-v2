import { deriveBookingState } from '../pool-booking-requests/booking-state';

export interface PoolBookingInput {
  id: string;
  status: string;
  startDate: string; endDate: string; startTime: string; endTime: string;
  returnedAt: Date | string | null;
  createdAt: Date | string;
  fleetId: string;
  carNumber: string;
  stadiumName: string;
}

export interface PoolBookingSummary {
  total: number;
  byState: Record<string, number>;
  byCar: Array<{ carNumber: string; count: number }>;
  byVenue: Array<{ stadiumName: string; count: number }>;
  overdueCount: number;
  completedCount: number;
  avgDurationHours: number | null;
}

function rank(map: Map<string, number>): Array<{ k: string; count: number }> {
  return [...map.entries()]
    .map(([k, count]) => ({ k, count }))
    .sort((a, b) => b.count - a.count || a.k.localeCompare(b.k));
}

export function summarizePoolBookings(bookings: PoolBookingInput[], now: Date): PoolBookingSummary {
  const byState: Record<string, number> = {};
  const carMap = new Map<string, number>();
  const venueMap = new Map<string, number>();
  let overdueCount = 0;
  let completedCount = 0;
  const durationsMs: number[] = [];

  for (const b of bookings) {
    const state = deriveBookingState(
      { status: b.status, startDate: b.startDate, endDate: b.endDate, startTime: b.startTime, endTime: b.endTime, returnedAt: b.returnedAt },
      now,
    );
    byState[state] = (byState[state] ?? 0) + 1;
    if (state === 'Overdue') overdueCount++;
    if (state === 'Completed') completedCount++;

    carMap.set(b.carNumber, (carMap.get(b.carNumber) ?? 0) + 1);
    venueMap.set(b.stadiumName, (venueMap.get(b.stadiumName) ?? 0) + 1);

    if (b.returnedAt) {
      const ms = new Date(b.returnedAt).getTime() - new Date(b.createdAt).getTime();
      if (Number.isFinite(ms) && ms >= 0) durationsMs.push(ms);
    }
  }

  const avgDurationHours = durationsMs.length
    ? Math.round((durationsMs.reduce((a, c) => a + c, 0) / durationsMs.length / 3_600_000) * 10) / 10
    : null;

  return {
    total: bookings.length,
    byState,
    byCar: rank(carMap).map(({ k, count }) => ({ carNumber: k, count })),
    byVenue: rank(venueMap).map(({ k, count }) => ({ stadiumName: k, count })),
    overdueCount,
    completedCount,
    avgDurationHours,
  };
}
