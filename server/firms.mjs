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

function transientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function retryDelay(response, attempt, now = Date.now()) {
  const retryAfterValue = response?.headers?.get?.('retry-after') ?? response?.headers?.['retry-after'];
  const retryAfterSeconds = Number(retryAfterValue);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) return retryAfterSeconds * 1000;
  const retryAfterDate = Date.parse(retryAfterValue);
  if (Number.isFinite(retryAfterDate)) return Math.max(0, retryAfterDate - now);
  return 300 * (attempt + 1);
}

function wait(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(new Error('FIRMS request aborted'));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('FIRMS request aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function getFirmsCsv(url, { signal, requestText, retries }) {
  let lastResponse;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requestText(url, { signal, headers: { accept: 'text/csv' } });
      lastResponse = response;
      if (response.ok) return response;
      if (!transientStatus(response.status) || attempt === retries) return response;
      await wait(retryDelay(response, attempt), signal);
    } catch (error) {
      if (signal?.aborted || attempt === retries) throw error;
      await wait(300 * (attempt + 1), signal);
    }
  }
  return lastResponse;
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

export async function fetchFirmsDetections({ key, bbox, hours, signal, requestText = getText, retries = 2, now = Date.now() }) {
  const days = Math.max(1, Math.min(5, Math.ceil(hours / 24)));
  const requests = FIRMS_SOURCES.map(async source => {
    const url = new URL(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${source}/${bbox}/${days}`);
    const response = await getFirmsCsv(url, { signal, requestText, retries });
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
  const cutoff = now - hours * 3600000;

  return {
    detections: detections.filter(item => Date.parse(item.timestamp) >= cutoff),
    warnings,
    successfulSources: settled.filter(result => result.status === 'fulfilled').length,
  };
}
