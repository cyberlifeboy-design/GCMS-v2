import { describe, it, expect } from 'vitest';
import { deriveHandoverPhase, canCreateOrSignHandover } from './handover-phase';

describe('deriveHandoverPhase', () => {
  it('maps the handover statuses', () => {
    expect(deriveHandoverPhase('PENDING')).toBe('handover');
    expect(deriveHandoverPhase('ADMIN_SIGNED')).toBe('handover');
  });
  it('maps COMPLETE to handover-done', () => {
    expect(deriveHandoverPhase('COMPLETE')).toBe('handover-done');
  });
  it('maps HANDBACK_PENDING to handback', () => {
    expect(deriveHandoverPhase('HANDBACK_PENDING')).toBe('handback');
  });
  it('maps RETURNED to complete', () => {
    expect(deriveHandoverPhase('RETURNED')).toBe('complete');
  });
  it('treats an unknown status as handover (safe default)', () => {
    expect(deriveHandoverPhase('WHATEVER')).toBe('handover');
  });
});

describe('canCreateOrSignHandover', () => {
  it('allows create/sign only before the form is COMPLETE', () => {
    expect(canCreateOrSignHandover(null)).toBe(true);
    expect(canCreateOrSignHandover(undefined)).toBe(true);
    expect(canCreateOrSignHandover('PENDING')).toBe(true);
    expect(canCreateOrSignHandover('ADMIN_SIGNED')).toBe(true);
  });
  it('blocks it once the handover is done or handback has started', () => {
    expect(canCreateOrSignHandover('COMPLETE')).toBe(false);
    expect(canCreateOrSignHandover('HANDBACK_PENDING')).toBe(false);
    expect(canCreateOrSignHandover('RETURNED')).toBe(false);
  });
});
