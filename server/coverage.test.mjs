import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import {
  insideCoverageCell,
  insideCoverageDetection,
  insideCoveragePoint,
} from './coverage.mjs';

const bbox = '34.75,32.75,36.75,34.75';

describe('configured regional coverage', () => {
  it('keeps Lebanon, Rif Dimashq, Homs, and northern Israel', () => {
    const requestedPoints = [
      [33.392, 35.5476],
      [33.4187, 36.6868],
      [34.7145, 36.6544],
      [32.96, 35.50],
    ];

    for (const [latitude, longitude] of requestedPoints) {
      expect(insideCoveragePoint(latitude, longitude, bbox)).toBe(true);
      expect(insideCoverageCell(latLngToCell(latitude, longitude, 7), bbox)).toBe(true);
      expect(insideCoverageDetection({ latitude, longitude }, bbox)).toBe(true);
    }
  });

  it('rejects records outside the configured map area', () => {
    expect(insideCoveragePoint(33.5, 36.9, bbox)).toBe(false);
    expect(insideCoveragePoint(32.5, 35.5, bbox)).toBe(false);
    expect(insideCoveragePoint(35.0, 36.5, bbox)).toBe(false);
    expect(insideCoveragePoint(33.5, 34.5, bbox)).toBe(false);
  });
});
