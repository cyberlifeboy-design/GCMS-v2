export interface RequestWindowConfig {
  requestWindowMode: string; // open | closed | scheduled
  requestWindowStart: Date | string | null;
  requestWindowEnd: Date | string | null;
  requestWindowClosedMessage?: string | null;
}

export interface RequestWindowState {
  isOpen: boolean;
  opensAt: string | null; // ISO — only when scheduled + still in the future
  closesAt: string | null; // ISO — only when scheduled + open now
  message: string | null;
}

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve whether the public request/booking channel is open right now.
 * - open      -> always open
 * - closed    -> always closed (carries the custom message)
 * - scheduled -> open iff now is within [start, end] (either bound may be absent)
 * Any unrecognised mode is treated as open.
 */
export function computeRequestWindow(cfg: RequestWindowConfig, now: Date): RequestWindowState {
  const message = cfg.requestWindowClosedMessage?.trim() || null;
  const start = toDate(cfg.requestWindowStart);
  const end = toDate(cfg.requestWindowEnd);

  if (cfg.requestWindowMode === 'closed') {
    return { isOpen: false, opensAt: null, closesAt: null, message };
  }

  if (cfg.requestWindowMode === 'scheduled') {
    const afterStart = !start || now.getTime() >= start.getTime();
    const beforeEnd = !end || now.getTime() <= end.getTime();
    const isOpen = afterStart && beforeEnd;
    return {
      isOpen,
      opensAt: !isOpen && start && now.getTime() < start.getTime() ? start.toISOString() : null,
      closesAt: isOpen && end ? end.toISOString() : null,
      message,
    };
  }

  return { isOpen: true, opensAt: null, closesAt: null, message: null };
}
