import 'dotenv/config';
import { fetchCalorisMtGDetections } from './caloris.mjs';
import { fetchFirmsDetections, FIRMS_SOURCES } from './firms.mjs';
import { getBuffer } from './http.mjs';
import { fetchLsaSafStatus } from './lsa-saf.mjs';

const bbox = process.env.FIRE_BBOX || '34.75,32.75,36.75,34.75';
const hours = 120;
const configuredOrigin = process.env.VERIFY_APP_ORIGIN || `http://127.0.0.1:${process.env.PORT || 4173}/`;
const parsedOrigin = new URL(configuredOrigin);
if (!/^https?:$/.test(parsedOrigin.protocol)) throw new Error('VERIFY_APP_ORIGIN must be an HTTP(S) application origin');
const referer = `${parsedOrigin.origin}/`;

function latest(detections) {
  return detections.reduce((value, item) => item.timestamp > value ? item.timestamp : value, '') || 'none';
}

async function checkPng(name, url) {
  const response = await getBuffer(new URL(url), {
    signal: AbortSignal.timeout(15_000),
    maxBytes: 1_000_000,
    headers: { accept: 'image/png', referer },
  });
  const png = response.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const blocked = response.headers['x-blocked'];
  if (blocked) throw new Error(`tile provider blocked the request: ${blocked}`);
  if (!response.ok || !png) throw new Error(`HTTP ${response.status}; expected a PNG tile`);
  return `${name} tile returned ${response.body.length} bytes`;
}

const checks = [
  {
    name: 'EUMETSAT MTG detections',
    run: async () => {
      const result = await fetchCalorisMtGDetections({
        hours,
        bbox,
        signal: AbortSignal.timeout(Number(process.env.CALORIS_TIMEOUT_MS || 90_000)),
        baseUrl: process.env.CALORIS_BASE_URL,
        requestTimeoutMs: Number(process.env.CALORIS_REQUEST_TIMEOUT_MS || 15_000),
        indexTimeoutMs: Number(process.env.CALORIS_INDEX_TIMEOUT_MS || 60_000),
      });
      if (result.warnings.length) throw new Error(result.warnings.join('; '));
      return `${result.detections.length} regional detections; global index ${result.upstreamLatest}; regional latest ${latest(result.detections)}`;
    },
  },
  {
    name: 'Official LSA SAF freshness',
    run: async () => {
      const result = await fetchLsaSafStatus({
        signal: AbortSignal.timeout(Number(process.env.LSASAF_STATUS_TIMEOUT_MS || 15_000)),
        url: process.env.LSASAF_WMS_URL,
        maxLagMs: Number(process.env.LSASAF_MAX_LAG_MS || 3_600_000),
      });
      if (result.stale) throw new Error(`latest official slot is ${Math.round(result.lagMs / 60000)} minutes behind`);
      return `latest slot ${result.upstreamLatest}; ${Math.round(result.lagMs / 60000)} minutes behind`;
    },
  },
  {
    name: 'NASA FIRMS',
    run: async () => {
      if (!process.env.FIRMS_MAP_KEY) throw new Error('FIRMS_MAP_KEY is not configured');
      const result = await fetchFirmsDetections({
        key: process.env.FIRMS_MAP_KEY,
        bbox,
        hours,
        signal: AbortSignal.timeout(Number(process.env.FIRMS_TIMEOUT_MS || 45_000)),
      });
      if (result.successfulSources !== FIRMS_SOURCES.length || result.warnings.length) {
        throw new Error(result.warnings.join('; ') || `${result.successfulSources}/${FIRMS_SOURCES.length} products succeeded`);
      }
      return `${result.detections.length} detections across ${result.successfulSources} products; latest ${latest(result.detections)}`;
    },
  },
  { name: 'OpenStreetMap', run: () => checkPng('street', 'https://tile.openstreetmap.org/7/76/50.png') },
  { name: 'OpenTopoMap a', run: () => checkPng('terrain a', 'https://a.tile.opentopomap.org/7/76/50.png') },
  { name: 'OpenTopoMap b', run: () => checkPng('terrain b', 'https://b.tile.opentopomap.org/7/76/50.png') },
  { name: 'OpenTopoMap c', run: () => checkPng('terrain c', 'https://c.tile.opentopomap.org/7/76/50.png') },
];

const results = await Promise.all(checks.map(async check => {
  const started = Date.now();
  try {
    const detail = await check.run();
    return { service: check.name, status: 'PASS', latencyMs: Date.now() - started, detail };
  } catch (error) {
    return { service: check.name, status: 'FAIL', latencyMs: Date.now() - started, detail: error.message };
  }
}));

console.table(results);
if (results.some(result => result.status === 'FAIL')) process.exitCode = 1;
