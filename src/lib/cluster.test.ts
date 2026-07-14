import { cellToLatLng } from 'h3-js';
import { describe, expect, it } from 'vitest';
import type { Detection } from '../types';
import { clusterDetections } from './cluster';

function detection(overrides: Partial<Detection> = {}): Detection {
  return {
    id: crypto.randomUUID(),
    latitude: 33.695,
    longitude: 35.579,
    timestamp: '2026-07-13T08:00:00.000Z',
    frp: 10,
    confidence: 80,
    satellite: 'Suomi NPP',
    instrument: 'VIIRS',
    sourceProduct: 'VIIRS_SNPP_NRT',
    daynight: 'D',
    type: 0,
    demo: false,
    ...overrides,
  };
}

describe('clusterDetections', () => {
  it('groups adjacent detections inside the event time gap', () => {
    const events = clusterDetections([
      detection(),
      detection({ latitude: 33.698, longitude: 35.582, timestamp: '2026-07-13T11:00:00.000Z' }),
    ], { now: Date.parse('2026-07-13T12:00:00.000Z') });

    expect(events).toHaveLength(1);
    expect(events[0].detectionCount).toBe(2);
    expect(events[0].status).toBe('recent');
  });

  it('keeps distant detections in separate events', () => {
    const events = clusterDetections([
      detection(),
      detection({ latitude: 34.53, longitude: 36.12 }),
    ]);

    expect(events).toHaveLength(2);
  });

  it('names the requested regional clusters for display', () => {
    const events = clusterDetections([
      detection({ latitude: 33.4187, longitude: 36.6868 }),
      detection({ latitude: 34.7145, longitude: 36.6544 }),
      detection({ latitude: 32.8967, longitude: 35.0871 }),
    ]);

    expect(events.map(event => event.name)).toEqual(expect.arrayContaining([
      'Rif Dimashq cluster',
      'Homs cluster',
      'Northern Israel cluster',
    ]));
  });

  it('starts a new event after the temporal continuity gap', () => {
    const events = clusterDetections([
      detection(),
      detection({ timestamp: '2026-07-13T21:00:01.000Z' }),
    ], { gapHours: 12 });

    expect(events).toHaveLength(2);
  });

  it('aggregates intensity and emits a valid detection envelope', () => {
    const events = clusterDetections([
      detection({ frp: 20, confidence: 70 }),
      detection({ frp: 30, confidence: 90, sourceProduct: 'VIIRS_NOAA20_NRT' }),
    ]);
    const event = events[0];

    expect(event.totalFrp).toBe(50);
    expect(event.maxFrp).toBe(30);
    expect(event.averageConfidence).toBe(80);
    expect(event.sources).toEqual({ VIIRS_SNPP_NRT: 1, VIIRS_NOAA20_NRT: 1 });
    expect(['Polygon', 'MultiPolygon']).toContain(event.footprint.type);
    expect(event.footprintCells).toHaveLength(1);
    const [anchorLatitude, anchorLongitude] = cellToLatLng(event.anchorCell);
    expect(event.latitude).toBe(anchorLatitude);
    expect(event.longitude).toBe(anchorLongitude);
  });

  it('preserves a provider event H3 anchor when one is supplied', () => {
    const providerAnchor = '872db18c6ffffff';
    const events = clusterDetections([
      detection({ latitude: 33.373, longitude: 35.531, eventAnchorCell: providerAnchor }),
      detection({ latitude: 33.379, longitude: 35.536, eventAnchorCell: providerAnchor }),
    ]);
    const [latitude, longitude] = cellToLatLng(providerAnchor);

    expect(events[0].anchorCell).toBe(providerAnchor);
    expect(events[0].latitude).toBe(latitude);
    expect(events[0].longitude).toBe(longitude);
  });
});
