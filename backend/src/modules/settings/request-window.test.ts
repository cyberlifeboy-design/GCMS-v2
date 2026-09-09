import { describe, it, expect } from 'vitest';
import { computeRequestWindow, RequestWindowConfig } from './request-window';

const at = (s: string) => new Date(s);
const cfg = (o: Partial<RequestWindowConfig>): RequestWindowConfig => ({
  requestWindowMode: 'open', requestWindowStart: null, requestWindowEnd: null, requestWindowClosedMessage: null, ...o,
});

describe('computeRequestWindow', () => {
  it('mode "open" is always open', () => {
    expect(computeRequestWindow(cfg({ requestWindowMode: 'open' }), at('2026-06-01T00:00:00')).isOpen).toBe(true);
  });

  it('mode "closed" is always closed and carries the custom message', () => {
    const s = computeRequestWindow(cfg({ requestWindowMode: 'closed', requestWindowClosedMessage: 'Back in July' }), at('2026-06-01T00:00:00'));
    expect(s.isOpen).toBe(false);
    expect(s.message).toBe('Back in July');
  });

  it('mode "scheduled" is open inside [start, end]', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-05T12:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-01T09:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-10T17:00:00')).isOpen).toBe(true);
  });

  it('mode "scheduled" is closed before start (and reports opensAt)', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    const s = computeRequestWindow(c, at('2026-05-30T00:00:00'));
    expect(s.isOpen).toBe(false);
    expect(s.opensAt).toBe(new Date('2026-06-01T09:00:00').toISOString());
  });

  it('mode "scheduled" is closed after end', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-11T00:00:00')).isOpen).toBe(false);
  });

  it('scheduled with only an end bound is open until that end', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: null, requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-05T00:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-20T00:00:00')).isOpen).toBe(false);
  });

  it('an unknown mode is treated as open (safe default)', () => {
    expect(computeRequestWindow(cfg({ requestWindowMode: 'weird' }), at('2026-06-01T00:00:00')).isOpen).toBe(true);
  });
});
