import { describe, it, expect } from 'vitest';
import { activeWarningCount, lastActiveLevel, recommendNextLevel, shouldBlock } from './warning-rules';

const w = (level: number, revoked = false) => ({ level, revoked });

describe('activeWarningCount', () => {
  it('counts only non-revoked', () => {
    expect(activeWarningCount([w(1), w(2, true), w(1)])).toBe(2);
  });
  it('is 0 for empty', () => expect(activeWarningCount([])).toBe(0));
});

describe('lastActiveLevel', () => {
  it('is the max non-revoked level', () => {
    expect(lastActiveLevel([w(1), w(3, true), w(2)])).toBe(2);
  });
  it('is 0 when all revoked or none', () => {
    expect(lastActiveLevel([w(3, true)])).toBe(0);
    expect(lastActiveLevel([])).toBe(0);
  });
});

describe('recommendNextLevel', () => {
  it('recommends 1 when there are no active warnings', () => {
    expect(recommendNextLevel([])).toBe(1);
    expect(recommendNextLevel([w(2, true)])).toBe(1);
  });
  it('recommends lastActiveLevel + 1', () => {
    expect(recommendNextLevel([w(1)])).toBe(2);
    expect(recommendNextLevel([w(2)])).toBe(3);
  });
  it('caps at 3', () => {
    expect(recommendNextLevel([w(3)])).toBe(3);
  });
});

describe('shouldBlock', () => {
  it('blocks on a level-3 regardless of count', () => {
    expect(shouldBlock(3, 1)).toBe(true);
  });
  it('blocks when the active count reaches 3', () => {
    expect(shouldBlock(1, 3)).toBe(true);
    expect(shouldBlock(2, 4)).toBe(true);
  });
  it('does not block for level 1-2 below 3 active', () => {
    expect(shouldBlock(1, 1)).toBe(false);
    expect(shouldBlock(2, 2)).toBe(false);
  });
});
