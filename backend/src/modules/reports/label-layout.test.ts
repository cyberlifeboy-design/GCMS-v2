import { describe, it, expect } from 'vitest';
import { labelCarFontSize } from './label-layout';

describe('labelCarFontSize', () => {
  it('caps at 260 for a short number in a tall box', () => {
    expect(labelCarFontSize('7', 400, 900)).toBe(260);
  });
  it('never returns below the 60 floor', () => {
    expect(labelCarFontSize('ABCDEFGHIJ', 120, 80)).toBe(60);
  });
  it('shrinks with width for longer numbers', () => {
    const short = labelCarFontSize('12', 300, 300);
    const long = labelCarFontSize('123456', 300, 300);
    expect(long).toBeLessThan(short);
  });
  it('is deterministic', () => {
    expect(labelCarFontSize('C-142', 500, 400)).toBe(labelCarFontSize('C-142', 500, 400));
  });
});
