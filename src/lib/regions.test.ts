import { describe, expect, it } from 'vitest';
import { nearestRegion } from './regions';

describe('nearestRegion', () => {
  it('does not assign Lebanese labels to Syrian border detections', () => {
    expect(nearestRegion(36.65, 34.71)).toBe('Homs');
  });

  it('retains Lebanese district labels inside Lebanon', () => {
    expect(nearestRegion(35.49, 33.33)).toBe('Nabatieh');
    expect(nearestRegion(35.70, 33.99)).toBe('Keserwan');
  });
});
