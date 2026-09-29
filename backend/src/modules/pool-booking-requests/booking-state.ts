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

/** Minutes after approval (or the booked start, if later) to collect the key. */
export const KEY_COLLECTION_WINDOW_MINUTES = 10;
/** Once the window passes, how long an Admin has to answer "was the key collected?" before auto-release. */
export const KEY_CHECK_ANSWER_MINUTES = 5;
/**
 * Auto-release only fires inside this window after the answer deadline. Anything older
 * predates this feature (scheduled bookings never recorded key collection before) or was
 * missed while the poller was down — those stay for staff to resolve, never mass-cancelled.
 * ponytail: time-window heuristic; add a keyCheckPromptedAt column if it ever misfires.
 */
export const KEY_AUTO_RELEASE_MAX_LATE_MINUTES = 60;

export interface KeyCheckInput {
  status: string;
  startDate: string;
  startTime: string;
  reviewedAt: Date | string | null;
  keyCollectedAt: Date | string | null;
}

export type KeyCheckState = 'waiting' | 'ask' | 'release' | 'stale';

/** When the key should have been collected by: approval or booked start (whichever is later) + window. */
export function keyCollectionDueAt(b: KeyCheckInput): Date | null {
  if (!b.reviewedAt) return null;
  const from = Math.max(new Date(b.reviewedAt).getTime(), combine(b.startDate, b.startTime).getTime());
  return new Date(from + KEY_COLLECTION_WINDOW_MINUTES * 60_000);
}

/**
 * Key-collection phase of an Approved booking (null once collected / not approved):
 * waiting → ask (Admin prompted) → release (auto-release now) → stale (too old to auto-release).
 */
export function keyCheckState(b: KeyCheckInput, now: Date): KeyCheckState | null {
  if (b.status !== 'Approved' || b.keyCollectedAt) return null;
  const due = keyCollectionDueAt(b);
  if (!due) return null;
  const late = now.getTime() - due.getTime();
  if (late < 0) return 'waiting';
  if (late < KEY_CHECK_ANSWER_MINUTES * 60_000) return 'ask';
  if (late < (KEY_CHECK_ANSWER_MINUTES + KEY_AUTO_RELEASE_MAX_LATE_MINUTES) * 60_000) return 'release';
  return 'stale';
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
