import Papa from 'papaparse';
import type { Detection, ImportResult } from '../types';

type CsvRow = Record<string, string | undefined>;

const confidenceAliases: Record<string, number> = {
  l: 30,
  low: 30,
  n: 65,
  nominal: 65,
  h: 90,
  high: 90,
};

function numeric(value: string | undefined, fallback = 0) {
  if (value == null || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidence(value: string | undefined) {
  const key = String(value || '').trim().toLowerCase();
  return key in confidenceAliases
    ? confidenceAliases[key]
    : Math.max(0, Math.min(100, numeric(value)));
}

function timestamp(row: CsvRow) {
  if (row.timestamp) {
    const explicit = new Date(row.timestamp);
    if (!Number.isNaN(explicit.getTime())) return explicit.toISOString();
  }

  if (!row.acq_date) return null;
  const rawTime = String(row.acq_time || '0000').padStart(4, '0');
  const acquired = new Date(`${row.acq_date}T${rawTime.slice(0, 2)}:${rawTime.slice(2, 4)}:00Z`);
  return Number.isNaN(acquired.getTime()) ? null : acquired.toISOString();
}

function productFor(row: CsvRow) {
  if (row.sourceProduct || row.source_product) return row.sourceProduct || row.source_product || 'IMPORTED';
  const instrument = String(row.instrument || '').toUpperCase();
  const satellite = String(row.satellite || '').toUpperCase();
  if (instrument.includes('FCI') || satellite.includes('MTG')) return 'MTG_FCI_LSA_SAF';
  if (instrument.includes('MODIS')) return 'MODIS_NRT';
  if (satellite.includes('21') || satellite === 'N21') return 'VIIRS_NOAA21_NRT';
  if (satellite.includes('20') || satellite === 'N20') return 'VIIRS_NOAA20_NRT';
  if (instrument.includes('VIIRS')) return 'VIIRS_SNPP_NRT';
  return 'IMPORTED';
}

export function parseDetectionCsv(text: string): ImportResult {
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: header => header.trim(),
  });

  let rejected = parsed.errors.length;
  const detections = parsed.data.flatMap((row, index): Detection[] => {
    const latitude = numeric(row.latitude, NaN);
    const longitude = numeric(row.longitude, NaN);
    const acquired = timestamp(row);
    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
      || !acquired
    ) {
      rejected += 1;
      return [];
    }

    const instrument = row.instrument || 'Imported';
    const satellite = row.satellite || instrument;
    return [{
      id: `import-${index}-${acquired}-${latitude}-${longitude}`,
      latitude,
      longitude,
      timestamp: acquired,
      frp: Math.max(0, numeric(row.frp)),
      confidence: confidence(row.confidence),
      satellite,
      instrument,
      sourceProduct: productFor(row),
      daynight: row.daynight === 'N' ? 'N' : 'D',
      type: numeric(row.type, 0),
      demo: false,
    }];
  });

  return { detections, rejected };
}

export function detectionsToCsv(detections: Detection[]) {
  return Papa.unparse(detections.map(item => ({
    timestamp: item.timestamp,
    instrument: item.instrument,
    satellite: item.satellite,
    source_product: item.sourceProduct,
    frp: item.frp,
    confidence: item.confidence,
    latitude: item.latitude,
    longitude: item.longitude,
    daynight: item.daynight,
    type: item.type,
  })));
}
