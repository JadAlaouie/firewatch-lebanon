import { parse } from 'csv-parse/sync';
import { getText } from './http.mjs';

export const FIRMS_SOURCES = [
  'VIIRS_SNPP_NRT',
  'VIIRS_NOAA20_NRT',
  'VIIRS_NOAA21_NRT',
  'MODIS_NRT',
];

const confidenceAliases = {
  l: 30,
  low: 30,
  n: 65,
  nominal: 65,
  h: 90,
  high: 90,
};

function number(value, fallback = 0) {
  if (value == null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function confidence(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return key in confidenceAliases ? confidenceAliases[key] : Math.max(0, Math.min(100, number(value)));
}

function timestamp(row) {
  const time = String(row.acq_time ?? '').padStart(4, '0');
  const hours = time.slice(0, 2);
  const minutes = time.slice(2, 4);
  const candidate = new Date(`${row.acq_date}T${hours}:${minutes}:00Z`);
  return Number.isNaN(candidate.getTime()) ? null : candidate.toISOString();
}

export function normalizeFirmsCsv(csv, sourceProduct) {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  return rows.flatMap((row, index) => {
    const latitude = number(row.latitude, NaN);
    const longitude = number(row.longitude, NaN);
    const acquired = timestamp(row);
    if (
      !Number.isFinite(latitude)
      || !Number.isFinite(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
      || !acquired
    ) return [];

    const satellite = String(row.satellite || sourceProduct.replace(/_NRT$/, ''));
    const instrument = String(row.instrument || (sourceProduct.startsWith('MODIS') ? 'MODIS' : 'VIIRS'));
    return [{
      id: `${sourceProduct}-${row.acq_date}-${row.acq_time}-${latitude}-${longitude}-${index}`,
      latitude,
      longitude,
      timestamp: acquired,
      frp: Math.max(0, number(row.frp)),
      confidence: confidence(row.confidence),
      satellite,
      instrument,
      sourceProduct,
      daynight: row.daynight === 'N' ? 'N' : 'D',
      type: number(row.type, 0),
      demo: false,
    }];
  });
}

export async function fetchFirmsDetections({ key, bbox, hours, signal }) {
  const days = Math.max(1, Math.min(5, Math.ceil(hours / 24)));
  const requests = FIRMS_SOURCES.map(async source => {
    const url = new URL(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${bbox}/${days}`);
    const response = await getText(url, { signal, headers: { accept: 'text/csv' } });
    if (!response.ok) throw new Error(`${source}: upstream HTTP ${response.status}`);
    const body = response.body;
    if (!body.includes('latitude') || body.startsWith('<!DOCTYPE')) {
      throw new Error(`${source}: unexpected FIRMS response`);
    }
    return normalizeFirmsCsv(body, source);
  });

  const settled = await Promise.allSettled(requests);
  const detections = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const warnings = settled.flatMap(result => result.status === 'rejected' ? [result.reason?.message || 'FIRMS request failed'] : []);
  const cutoff = Date.now() - hours * 3600000;

  return {
    detections: detections.filter(item => Date.parse(item.timestamp) >= cutoff),
    warnings,
    successfulSources: settled.filter(result => result.status === 'fulfilled').length,
  };
}
