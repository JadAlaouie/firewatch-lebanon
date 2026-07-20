import { describe, expect, it } from 'vitest';
import { bboxWithinCoverage, parseBbox, parseHours } from './params.mjs';

describe('API query validation', () => {
  it('accepts only finite whole-hour windows from 1 through 120', () => {
    expect(parseHours(undefined, 48)).toBe(48);
    expect(parseHours('1')).toBe(1);
    expect(parseHours('120')).toBe(120);
    for (const invalid of ['garbage', 'NaN', '1.5', '0', '121', Infinity, ['24']]) {
      expect(parseHours(invalid)).toBeNull();
    }
  });

  it('normalizes valid bounding boxes and rejects malformed coverage', () => {
    expect(parseBbox('34.750001,32.75,36.75,34.75')).toBe('34.75,32.75,36.75,34.75');
    expect(parseBbox('36,34,35,33')).toBeNull();
    expect(parseBbox('bad')).toBeNull();
    expect(parseBbox('34,,36,35')).toBeNull();
    expect(parseBbox(',32,36,35')).toBeNull();
    expect(parseBbox(['34,32,36,35'])).toBeNull();
    expect(bboxWithinCoverage('35,33,36,34', '34.75,32.75,36.75,34.75')).toBe(true);
    expect(bboxWithinCoverage('34,32,37,35', '34.75,32.75,36.75,34.75')).toBe(false);
  });
});
