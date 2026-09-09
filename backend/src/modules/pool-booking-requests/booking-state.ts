export type BookingDerivedState =
  | 'Pending' | 'Upcoming' | 'Active' | 'Overdue' | 'Completed' | 'Rejected' | 'Cancelled';

export interface BookingWindow {
  status: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
  returnedAt: Date | string | null;
}

/** Build a Date from "YYYY-MM-DD" + "HH:mm", interpreted as server-local time. */
function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/**
 * Map a pool booking's stored window + status to a UI-facing state, relative to `now`.
 * - returnedAt set  -> Completed (regardless of the clock)
 * - Pending/Rejected/Cancelled/Completed -> passed through
 * - Approved (or any other live status): Upcoming / Active / Overdue by the window
 */
export function deriveBookingState(b: BookingWindow, now: Date): BookingDerivedState {
  if (b.returnedAt) return 'Completed';
  if (b.status === 'Pending') return 'Pending';
  if (b.status === 'Rejected') return 'Rejected';
  if (b.status === 'Cancelled') return 'Cancelled';
  if (b.status === 'Completed') return 'Completed';

  const start = combine(b.startDate, b.startTime).getTime();
  const end = combine(b.endDate, b.endTime).getTime();
  const t = now.getTime();
  if (t < start) return 'Upcoming';
  if (t <= end) return 'Active';
  return 'Overdue';
}
