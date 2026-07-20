import { describe, expect, it } from 'vitest';
import { fetchFirmsDetections, normalizeFirmsCsv, retryDelay } from './firms.mjs';

describe('normalizeFirmsCsv', () => {
  it('honors numeric and HTTP-date Retry-After values', () => {
    expect(retryDelay({ headers: { 'retry-after': '12' } }, 0, 0)).toBe(12_000);
    expect(retryDelay(
      { headers: { 'retry-after': 'Mon, 20 Jul 2026 07:10:00 GMT' } },
      0,
      Date.parse('2026-07-20T07:09:30Z'),
    )).toBe(30_000);
    expect(retryDelay({ headers: {} }, 1, 0)).toBe(600);
  });

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

  it('includes the exact 10-minute cutoff and excludes observations just beyond it', async () => {
    const csv = [
      'latitude,longitude,acq_date,acq_time,confidence,frp',
      '33.695,35.579,2026-07-20,1150,80,10',
      '33.696,35.580,2026-07-20,1149,80,9',
    ].join('\n');
    const requestText = async () => ({ ok: true, status: 200, headers: {}, body: csv });
    const options = {
      key: 'test',
      bbox: '34.75,32.75,36.75,34.75',
      hours: 10 / 60,
      requestText,
      retries: 0,
    };

    const atBoundary = await fetchFirmsDetections({
      ...options,
      now: Date.parse('2026-07-20T12:00:00.000Z'),
    });
    const justPastBoundary = await fetchFirmsDetections({
      ...options,
      now: Date.parse('2026-07-20T12:00:00.001Z'),
    });

    expect(atBoundary.detections).toHaveLength(4);
    expect(atBoundary.detections.every(item => item.timestamp === '2026-07-20T11:50:00.000Z')).toBe(true);
    expect(justPastBoundary.detections).toHaveLength(0);
  });

  it('retries a transient upstream failure and retains partial source success', async () => {
    const attempts = new Map();
    const csv = [
      'latitude,longitude,acq_date,acq_time,confidence,frp',
      '33.695,35.579,2026-07-20,0215,80,10',
    ].join('\n');
    const requestText = async url => {
      const source = url.pathname.split('/').at(-3);
      attempts.set(source, (attempts.get(source) || 0) + 1);
      if (source === 'VIIRS_SNPP_NRT' && attempts.get(source) === 1) {
        return { ok: false, status: 503, headers: {}, body: '' };
      }
      if (source === 'MODIS_NRT') return { ok: false, status: 403, headers: {}, body: '' };
      return { ok: true, status: 200, headers: {}, body: csv };
    };

    const result = await fetchFirmsDetections({
      key: 'test',
      bbox: '34.75,32.75,36.75,34.75',
      hours: 120,
      requestText,
      retries: 1,
      now: Date.parse('2026-07-20T12:00:00Z'),
    });

    expect(attempts.get('VIIRS_SNPP_NRT')).toBe(2);
    expect(attempts.get('MODIS_NRT')).toBe(1);
    expect(result.successfulSources).toBe(3);
    expect(result.warnings).toEqual(['MODIS_NRT: upstream HTTP 403']);
  });
});
