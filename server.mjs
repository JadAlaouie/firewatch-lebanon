import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CALORIS_SOURCE, fetchCalorisMtGDetections } from './server/caloris.mjs';
import { createAuth } from './server/auth.mjs';
import { insideLebanonPresetDetection } from './server/coverage.mjs';
import { makeDemoDetections } from './server/demo.mjs';
import { fetchFirmsDetections, FIRMS_SOURCES } from './server/firms.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const defaultBbox = process.env.FIRE_BBOX || '34.75,32.75,36.75,34.75';
const cacheTtl = Number(process.env.FIRMS_CACHE_MS || 240000);
const mtgBridgeEnabled = /^(1|true|yes)$/i.test(process.env.CALORIS_MTG_BRIDGE || 'false');
const firmsTimeoutMs = Number(process.env.FIRMS_TIMEOUT_MS || 45_000);
const mtgTimeoutMs = Number(process.env.CALORIS_TIMEOUT_MS || 90_000);
const mtgRequestTimeoutMs = Number(process.env.CALORIS_REQUEST_TIMEOUT_MS || 15_000);
const mtgIndexTimeoutMs = Number(process.env.CALORIS_INDEX_TIMEOUT_MS || 60_000);
const mtgStaleMs = Number(process.env.CALORIS_STALE_MS || 1_800_000);
const responseCache = new Map();
const mtgSnapshotCache = new Map();
const auth = createAuth({
  username: process.env.APP_LOGIN_USER,
  password: process.env.APP_LOGIN_PASSWORD,
  sessionHours: Number(process.env.APP_SESSION_HOURS || 12),
});

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  next();
});

function validBbox(input) {
  const parts = String(input || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) return null;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return parts.map(value => Number(value.toFixed(5))).join(',');
}

function responseEnvelope({ mode, detections, bbox, hours, warnings = [] }) {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    latestObservation: detections.reduce((latest, item) => item.timestamp > latest ? item.timestamp : latest, ''),
    bbox,
    hours,
    sources: [...new Set(detections.map(item => item.sourceProduct))],
    warnings,
    detections,
  };
}

function providerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timeout|timed out/i.test(message) ? 'request timed out' : message;
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/auth/status', auth.status);
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);

app.get('/api/status', auth.requireAuth, (_request, response) => {
  response.json({
    configured: Boolean(process.env.FIRMS_MAP_KEY),
    provider: mtgBridgeEnabled ? 'NASA FIRMS + LSA SAF MTG' : 'NASA FIRMS',
    bbox: defaultBbox,
    sources: mtgBridgeEnabled ? [...FIRMS_SOURCES, CALORIS_SOURCE] : FIRMS_SOURCES,
    mtgBridgeEnabled,
    refreshSeconds: Math.round(cacheTtl / 1000),
  });
});

app.get('/api/detections', auth.requireAuth, async (request, response) => {
  const hours = Math.max(1, Math.min(120, Number(request.query.hours || 48)));
  const bbox = validBbox(request.query.bbox) || validBbox(defaultBbox);
  if (!bbox) return response.status(500).json({ error: 'Invalid FIRE_BBOX configuration' });

  const key = `${bbox}:${hours}:${Boolean(process.env.FIRMS_MAP_KEY)}:${mtgBridgeEnabled}`;
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.time < cacheTtl) return response.json(cached.value);

  let envelope;
  if (!process.env.FIRMS_MAP_KEY && !mtgBridgeEnabled) {
    envelope = responseEnvelope({
      mode: 'demo',
      detections: makeDemoDetections(hours),
      bbox,
      hours,
      warnings: ['FIRMS_MAP_KEY is not configured. Showing generated demonstration data.'],
    });
  } else {
    try {
      let successfulSources = 0;
      let mtgSucceeded = false;
      let detections = [];
      const warnings = [];

      const firmsPromise = process.env.FIRMS_MAP_KEY
        ? fetchFirmsDetections({
          key: process.env.FIRMS_MAP_KEY,
          bbox,
          hours,
          signal: AbortSignal.timeout(firmsTimeoutMs),
        })
        : Promise.resolve(null);
      const mtgPromise = mtgBridgeEnabled
        ? fetchCalorisMtGDetections({
          hours,
          bbox,
          signal: AbortSignal.timeout(mtgTimeoutMs),
          baseUrl: process.env.CALORIS_BASE_URL,
          requestTimeoutMs: mtgRequestTimeoutMs,
          indexTimeoutMs: mtgIndexTimeoutMs,
        })
        : Promise.resolve(null);

      const [firmsOutcome, mtgOutcome] = await Promise.allSettled([firmsPromise, mtgPromise]);

      if (!process.env.FIRMS_MAP_KEY) {
        warnings.push('FIRMS_MAP_KEY is not configured; NASA sources are unavailable.');
      } else if (firmsOutcome.status === 'fulfilled') {
        successfulSources = firmsOutcome.value.successfulSources;
        detections = detections.concat(firmsOutcome.value.detections);
        warnings.push(...firmsOutcome.value.warnings);
      } else {
        warnings.push(`NASA FIRMS: ${providerError(firmsOutcome.reason)}`);
      }

      if (mtgBridgeEnabled) {
        const snapshotKey = `${bbox}:${hours}`;
        if (mtgOutcome.status === 'fulfilled') {
          detections = detections.concat(mtgOutcome.value.detections);
          warnings.push(...mtgOutcome.value.warnings);
          mtgSucceeded = true;
          mtgSnapshotCache.set(snapshotKey, {
            time: Date.now(),
            detections: mtgOutcome.value.detections,
          });
        } else {
          const snapshot = mtgSnapshotCache.get(snapshotKey);
          if (snapshot && Date.now() - snapshot.time <= mtgStaleMs) {
            detections = detections.concat(snapshot.detections);
            mtgSucceeded = true;
            const ageMinutes = Math.max(1, Math.round((Date.now() - snapshot.time) / 60000));
            warnings.push(`MTG refresh failed; using the last successful snapshot from ${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago.`);
          } else {
            warnings.push(`MTG compatibility feed: ${providerError(mtgOutcome.reason)}`);
          }
        }
      }

      if (successfulSources === 0 && !mtgSucceeded) {
        throw new Error(warnings.join('; ') || 'All live sources failed');
      }
      detections = detections.filter(insideLebanonPresetDetection);
      envelope = responseEnvelope({
        mode: warnings.length ? 'live-partial' : 'live',
        detections,
        bbox,
        hours,
        warnings,
      });
    } catch (error) {
      envelope = responseEnvelope({
        mode: 'demo-fallback',
        detections: makeDemoDetections(hours),
        bbox,
        hours,
        warnings: [`Live retrieval failed: ${error.message}. Showing demonstration data.`],
      });
    }
  }

  responseCache.set(key, { time: Date.now(), value: envelope });
  return response.json(envelope);
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(root, 'dist')));
  app.use((request, response, next) => {
    if (request.method !== 'GET' || !request.accepts('html')) return next();
    response.sendFile(join(root, 'dist', 'index.html'));
  });
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Unexpected server error' });
});

app.listen(port, host, () => {
  console.log(`Firewatch Lebanon running at http://${host}:${port}`);
});
