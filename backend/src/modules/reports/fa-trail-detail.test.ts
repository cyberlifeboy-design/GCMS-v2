import { describe, it, expect } from 'vitest';
import { possessionMinutes, formatDuration } from './fa-trail-detail';

describe('possessionMinutes', () => {
  it('returns whole minutes between two instants', () => {
    expect(possessionMinutes('2026-09-09T08:00:00Z', '2026-09-09T09:30:00Z')).toBe(90);
  });
  it('is null when either bound is missing', () => {
    expect(possessionMinutes(null, '2026-09-09T09:30:00Z')).toBeNull();
    expect(possessionMinutes('2026-09-09T08:00:00Z', undefined)).toBeNull();
  });
  it('is null when end precedes start', () => {
    expect(possessionMinutes('2026-09-09T10:00:00Z', '2026-09-09T09:00:00Z')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats null as a dash', () => expect(formatDuration(null)).toBe('—'));
  it('formats minutes only', () => expect(formatDuration(45)).toBe('45m'));
  it('formats hours and minutes', () => expect(formatDuration(192)).toBe('3h 12m'));
  it('formats days and hours', () => expect(formatDuration(60 * 52)).toBe('2d 4h'));
});
