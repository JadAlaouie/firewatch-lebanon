import { describe, expect, it } from 'vitest';
import { detectionsToCsv, parseDetectionCsv } from './csv';

describe('parseDetectionCsv', () => {
  it('parses a NASA FIRMS area export', () => {
    const csv = [
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
      '33.695,35.579,331.2,0.42,0.36,2026-07-13,0215,N21,VIIRS,h,2.0NRT,302.1,18.4,N',
    ].join('\n');

    const result = parseDetectionCsv(csv);

    expect(result.rejected).toBe(0);
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0]).toMatchObject({
      timestamp: '2026-07-13T02:15:00.000Z',
      confidence: 90,
      sourceProduct: 'VIIRS_NOAA21_NRT',
      daynight: 'N',
      frp: 18.4,
    });
  });

  it('auto-detects a semicolon-delimited platform export', () => {
    const csv = [
      'timestamp;instrument;frp;confidence;latitude;longitude',
      '2026-07-13T08:30:00Z;SEVIRI;12.5;78;33.84;35.62',
    ].join('\n');

    const result = parseDetectionCsv(csv);

    expect(result.rejected).toBe(0);
    expect(result.detections[0]).toMatchObject({
      instrument: 'SEVIRI',
      sourceProduct: 'IMPORTED',
      confidence: 78,
    });
  });

  it('rejects rows without coordinates and round-trips exported detections', () => {
    const parsed = parseDetectionCsv([
      'timestamp,latitude,longitude,frp,confidence,instrument',
      '2026-07-13T08:30:00Z,,,7,60,VIIRS',
      '2026-07-13T09:30:00Z,33.8,35.6,9,65,VIIRS',
    ].join('\n'));

    expect(parsed.rejected).toBe(1);
    expect(parsed.detections).toHaveLength(1);

    const exported = detectionsToCsv(parsed.detections);
    const roundTrip = parseDetectionCsv(exported);
    expect(roundTrip.detections).toHaveLength(1);
    expect(roundTrip.detections[0]).toMatchObject({ latitude: 33.8, longitude: 35.6, frp: 9 });
  });
});
