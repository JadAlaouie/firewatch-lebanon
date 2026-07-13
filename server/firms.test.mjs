import { describe, expect, it } from 'vitest';
import { normalizeFirmsCsv } from './firms.mjs';

describe('normalizeFirmsCsv', () => {
  it('normalizes a FIRMS row and confidence category', () => {
    const rows = normalizeFirmsCsv([
      'latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight,type',
      '33.695,35.579,2026-07-13,0215,N21,VIIRS,h,18.4,N,0',
    ].join('\n'), 'VIIRS_NOAA21_NRT');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      timestamp: '2026-07-13T02:15:00.000Z',
      confidence: 90,
      frp: 18.4,
      sourceProduct: 'VIIRS_NOAA21_NRT',
    });
  });

  it('drops blank and out-of-range coordinates', () => {
    const rows = normalizeFirmsCsv([
      'latitude,longitude,acq_date,acq_time,confidence,frp',
      ',,2026-07-13,0215,80,10',
      '95,35.5,2026-07-13,0315,80,10',
    ].join('\n'), 'VIIRS_SNPP_NRT');

    expect(rows).toEqual([]);
  });
});
