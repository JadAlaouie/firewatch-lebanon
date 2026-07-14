import { describe, expect, it } from 'vitest';
import { nearestRegion } from './regions';

describe('nearestRegion', () => {
  it('does not assign Lebanese labels to Syrian border detections', () => {
    expect(nearestRegion(36.65, 34.71)).toBe('Homs');
    expect(nearestRegion(36.6868, 33.4187)).toBe('Rif Dimashq');
  });

  it('retains Lebanese district labels inside Lebanon', () => {
    expect(nearestRegion(35.49, 33.33)).toBe('Nabatieh');
    expect(nearestRegion(35.70, 33.99)).toBe('Keserwan');
  });

  it('labels the requested Israeli-side cluster clearly', () => {
    expect(nearestRegion(35.0871, 32.8967)).toBe('Northern Israel');
  });
});
