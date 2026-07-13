import { describe, expect, it } from 'vitest';
import {
  insideLebanonPresetCell,
  insideLebanonPresetDetection,
  insideLebanonPresetPoint,
} from './coverage.mjs';

describe('Lebanon H3 coverage', () => {
  it('keeps the comparison tracker event anchors', () => {
    expect(insideLebanonPresetCell('872db18c6ffffff')).toBe(true);
    expect(insideLebanonPresetPoint(33.392, 35.5476)).toBe(true);
    expect(insideLebanonPresetPoint(34.53, 36.08)).toBe(true);
  });

  it('removes the FIRMS-only Rif Dimashq event outside the preset', () => {
    expect(insideLebanonPresetPoint(33.4187, 36.6868)).toBe(false);
    expect(insideLebanonPresetDetection({ latitude: 33.4187, longitude: 36.6868 })).toBe(false);
  });

  it('removes Homs events without removing Lebanese northern-border points', () => {
    expect(insideLebanonPresetCell('872d84b4affffff')).toBe(false);
    expect(insideLebanonPresetCell('872d84b53ffffff')).toBe(false);
    expect(insideLebanonPresetPoint(34.7145, 36.6544)).toBe(false);
    expect(insideLebanonPresetPoint(34.63202, 36.60036)).toBe(false);
  });
});
