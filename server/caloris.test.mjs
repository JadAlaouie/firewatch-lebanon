import { describe, expect, it } from 'vitest';
import { latLngToCell } from 'h3-js';
import { decodeLiveEvents, decodeMtGRecords, tixEpoch } from './caloris.mjs';

const referenceTix = 0x8201a94e3c00n;

describe('Caloris MTG compatibility decoder', () => {
  it('decodes the compact time index used by the live feed', () => {
    expect(new Date(tixEpoch(referenceTix) * 1000).toISOString()).toBe('2026-07-12T12:56:32.000Z');
  });

  it('selects recent events across the configured regional coverage', () => {
    const includedCells = [
      latLngToCell(33.392, 35.5476, 7),
      latLngToCell(33.4187, 36.6868, 7),
      latLngToCell(34.7145, 36.6544, 7),
      latLngToCell(32.96, 35.50, 7),
    ];
    const outsideCell = latLngToCell(33.5, 36.9, 7);
    const cells = [...includedCells, outsideCell];
    const buffer = Buffer.alloc(cells.length * 32);

    cells.forEach((cell, index) => {
      const offset = index * 32;
      buffer.writeBigUInt64LE(BigInt(`0x${cell}`), offset);
      buffer.writeBigUInt64LE(referenceTix, offset + 8);
      buffer.writeBigUInt64LE(referenceTix, offset + 16);
      buffer.writeUInt32LE(12, offset + 24);
      buffer.writeFloatLE(222.36, offset + 28);
    });

    const events = decodeLiveEvents(buffer, {
      hours: 48,
      bbox: '34.75,32.75,36.75,34.75',
      now: Date.parse('2026-07-13T09:00:00.000Z'),
    });

    expect(events.map(event => event.h7)).toEqual(includedCells);
    expect(events.every(event => event.hotspots === 12)).toBe(true);
  });

  it('normalizes only MTG-FCI hotspot records', () => {
    const buffer = Buffer.alloc(48);
    const cell = latLngToCell(33.2827, 35.5931, 9);
    buffer.writeBigUInt64BE(BigInt(`0x${cell}`), 0);
    buffer.writeBigUInt64BE(referenceTix, 8);
    buffer.writeFloatLE(18.5, 16);
    buffer.writeUInt8(254, 20);
    buffer.writeUInt8('F'.charCodeAt(0), 21);

    buffer.writeBigUInt64BE(BigInt(`0x${cell}`), 24);
    buffer.writeBigUInt64BE(referenceTix, 32);
    buffer.writeFloatLE(9, 40);
    buffer.writeUInt8(127, 44);
    buffer.writeUInt8('2'.charCodeAt(0), 45);

    const detections = decodeMtGRecords(buffer, {
      hours: 48,
      now: Date.parse('2026-07-13T09:00:00.000Z'),
      bbox: '34.75,32.75,36.75,34.75',
      eventAnchorCell: '872db1123ffffff',
    });

    expect(detections).toHaveLength(1);
    expect(detections[0]).toMatchObject({
      sourceProduct: 'MTG_FCI_LSA_SAF',
      satellite: 'MTG-I1',
      instrument: 'FCI',
      confidence: 100,
      frp: 18.5,
      eventAnchorCell: '872db1123ffffff',
    });
    expect(detections[0].latitude).toBeCloseTo(33.2827, 2);
    expect(detections[0].longitude).toBeCloseTo(35.5931, 2);
  });
});
