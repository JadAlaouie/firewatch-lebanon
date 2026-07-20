import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { coalesce, detectionCacheTtl, getFresh, setBounded } from './server/cache.mjs';
import { CALORIS_SOURCE, fetchCalorisMtGDetections, MTG_TIME_QUANTIZATION_MS } from './server/caloris.mjs';
import { createAuth } from './server/auth.mjs';
import { insideCoverageDetection } from './server/coverage.mjs';
import { makeDemoDetections } from './server/demo.mjs';
import { fetchFirmsDetections, FIRMS_SOURCES } from './server/firms.mjs';
import { fetchLsaSafStatus } from './server/lsa-saf.mjs';
import { bboxWithinCoverage, parseBbox, parseHours } from './server/params.mjs';
import { securityHeaders } from './server/security.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const defaultBbox = process.env.FIRE_BBOX || '34.75,32.75,36.75,34.75';
const cacheTtl = Number(process.env.FIRMS_CACHE_MS || 240000);
const shortWindowCacheTtl = Number(process.env.SHORT_WINDOW_CACHE_MS || 60_000);
const mtgBridgeEnabled = /^(1|true|yes)$/i.test(process.env.CALORIS_MTG_BRIDGE || 'true');
const firmsTimeoutMs = Number(process.env.FIRMS_TIMEOUT_MS || 45_000);
const mtgTimeoutMs = Number(process.env.CALORIS_TIMEOUT_MS || 90_000);
const mtgRequestTimeoutMs = Number(process.env.CALORIS_REQUEST_TIMEOUT_MS || 15_000);
const mtgIndexTimeoutMs = Number(process.env.CALORIS_INDEX_TIMEOUT_MS || 60_000);
const mtgStaleMs = Number(process.env.CALORIS_STALE_MS || 600_000);
const lsaSafStatusEnabled = /^(1|true|yes)$/i.test(process.env.LSASAF_STATUS_CHECK || 'true');
const lsaSafStatusTimeoutMs = Number(process.env.LSASAF_STATUS_TIMEOUT_MS || 15_000);
const lsaSafMaxLagMs = Number(process.env.LSASAF_MAX_LAG_MS || 3_600_000);
const providerStatusStaleMs = Number(process.env.PROVIDER_STATUS_STALE_MS || 900_000);
// Render sets RENDER=true at runtime and routes public traffic through its
// sanitizing proxy chain. An explicit APP_TRUST_FORWARDED_FOR value still wins
// so direct/self-hosted deployments remain safe by default.
const trustForwardedFor = /^(1|true|yes)$/i.test(
  process.env.APP_TRUST_FORWARDED_FOR ?? process.env.RENDER ?? 'false',
);
const MAX_RESPONSE_CACHE_ENTRIES = 64;
const MAX_MTG_SNAPSHOT_ENTRIES = 32;
const responseCache = new Map();
const responseInFlight = new Map();
const mtgSnapshotCache = new Map();
const auth = createAuth({
  username: process.env.APP_LOGIN_USER,
  password: process.env.APP_LOGIN_PASSWORD,
  sessionHours: Number(process.env.APP_SESSION_HOURS || 12),
  trustForwardedFor,
});

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(securityHeaders);

const providerStatus = {
  nasaFirms: {
    configured: Boolean(process.env.FIRMS_MAP_KEY),
    status: process.env.FIRMS_MAP_KEY ? 'idle' : 'disabled',
  },
  eumetsatMtg: {
    configured: mtgBridgeEnabled,
    status: mtgBridgeEnabled ? 'idle' : 'disabled',
    delivery: 'Tabula Caloris compatibility bridge with official LSA SAF WMS freshness cross-check',
  },
};
const providerGenerations = { nasaFirms: 0, eumetsatMtg: 0 };

function statusSnapshot() {
  const now = Date.now();
  return Object.fromEntries(Object.entries(providerStatus).map(([key, value]) => {
    const snapshot = { ...value };
    const checkedEpoch = Date.parse(snapshot.checkedAt || '');
    if (
      Number.isFinite(checkedEpoch)
      && ['ok', 'degraded'].includes(snapshot.status)
      && now - checkedEpoch >= providerStatusStaleMs
    ) {
      snapshot.status = 'stale';
      snapshot.statusAgeMinutes = Math.floor((now - checkedEpoch) / 60000);
    }
    return [key, snapshot];
  }));
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
    providerStatus: statusSnapshot(),
    detections,
  };
}

function demoEnvelope({ mode, bbox, hours, reason }) {
  const detections = makeDemoDetections(hours)
    .filter(detection => insideCoverageDetection(detection, bbox));
  const availability = detections.length
    ? 'Showing generated demonstration data.'
    : 'No demonstration detections match the selected area and time window.';
  return responseEnvelope({
    mode,
    detections,
    bbox,
    hours,
    warnings: [`${reason} ${availability}`],
  });
}

function providerError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timeout|timed out/i.test(message) ? 'request timed out' : message;
}

function newestDetection(detections) {
  return detections.reduce((latest, item) => item.timestamp > latest ? item.timestamp : latest, '');
}

async function observeProvider(name, operation, summarize) {
  const generation = (providerGenerations[name] || 0) + 1;
  providerGenerations[name] = generation;
  const started = Date.now();
  providerStatus[name] = {
    ...providerStatus[name],
    status: 'checking',
    checkedAt: new Date(started).toISOString(),
  };
  try {
    const value = await operation();
    if (providerGenerations[name] !== generation) return value;
    const warnings = value.warnings || [];
    providerStatus[name] = {
      ...providerStatus[name],
      ...summarize(value),
      status: warnings.length ? 'degraded' : 'ok',
      checkedAt: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: undefined,
      warnings: warnings.length ? warnings : undefined,
    };
    return value;
  } catch (error) {
    if (providerGenerations[name] !== generation) throw error;
    providerStatus[name] = {
      ...providerStatus[name],
      status: 'down',
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: providerError(error),
      warnings: undefined,
    };
    throw error;
  }
}

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/auth/status', auth.status);
app.post('/api/auth/login', auth.login);
app.post('/api/auth/logout', auth.logout);

app.get('/api/status', auth.requireAuth, (_request, response) => {
  response.json({
    configured: Boolean(process.env.FIRMS_MAP_KEY) || mtgBridgeEnabled,
    firmsConfigured: Boolean(process.env.FIRMS_MAP_KEY),
    provider: mtgBridgeEnabled ? 'NASA FIRMS + LSA SAF MTG' : 'NASA FIRMS',
    bbox: defaultBbox,
    sources: mtgBridgeEnabled ? [...FIRMS_SOURCES, CALORIS_SOURCE] : FIRMS_SOURCES,
    mtgBridgeEnabled,
    refreshSeconds: Math.round(cacheTtl / 1000),
    shortWindowRefreshSeconds: Math.round(
      detectionCacheTtl(10 / 60, cacheTtl, shortWindowCacheTtl) / 1000,
    ),
    services: statusSnapshot(),
  });
});

async function fetchEumetsatDetections({ hours, bbox }) {
  const [bridgeOutcome, officialOutcome] = await Promise.allSettled([
    fetchCalorisMtGDetections({
      hours,
      bbox,
      eventBbox: defaultBbox,
      signal: AbortSignal.timeout(mtgTimeoutMs),
      baseUrl: process.env.CALORIS_BASE_URL,
      requestTimeoutMs: mtgRequestTimeoutMs,
      indexTimeoutMs: mtgIndexTimeoutMs,
      indexCacheMs: detectionCacheTtl(hours, cacheTtl, shortWindowCacheTtl),
    }),
    lsaSafStatusEnabled
      ? fetchLsaSafStatus({
        signal: AbortSignal.timeout(lsaSafStatusTimeoutMs),
        url: process.env.LSASAF_WMS_URL,
        maxLagMs: lsaSafMaxLagMs,
      })
      : Promise.resolve(null),
  ]);

  if (bridgeOutcome.status === 'rejected') throw bridgeOutcome.reason;
  const bridge = bridgeOutcome.value;
  const bridgeWarnings = [...bridge.warnings];
  const warnings = [...bridgeWarnings];
  let officialStatus = null;
  if (lsaSafStatusEnabled) {
    if (officialOutcome.status === 'fulfilled') {
      officialStatus = officialOutcome.value;
      if (officialStatus.stale) {
        warnings.push(`Official LSA SAF status is ${Math.round(officialStatus.lagMs / 60000)} minutes behind.`);
      }
    } else {
      warnings.push(`Official LSA SAF status cross-check: ${providerError(officialOutcome.reason)}`);
    }
  }
  return {
    ...bridge,
    warnings,
    bridgeComplete: bridgeWarnings.length === 0,
    officialStatus,
  };
}

async function loadDetectionEnvelope({ hours, bbox }) {
  if (!process.env.FIRMS_MAP_KEY && !mtgBridgeEnabled) {
    return demoEnvelope({
      mode: 'demo',
      bbox,
      hours,
      reason: 'Live providers are not configured.',
    });
  }

  try {
    let successfulSources = 0;
    let mtgSucceeded = false;
    let detections = [];
    const warnings = [];

    const firmsPromise = process.env.FIRMS_MAP_KEY
      ? observeProvider('nasaFirms', async () => {
        const value = await fetchFirmsDetections({
          key: process.env.FIRMS_MAP_KEY,
          bbox,
          hours,
          signal: AbortSignal.timeout(firmsTimeoutMs),
        });
        if (value.successfulSources === 0) {
          throw new Error(value.warnings.join('; ') || 'all FIRMS products failed');
        }
        return value;
      }, value => ({
          configured: true,
          successfulSources: value.successfulSources,
          expectedSources: FIRMS_SOURCES.length,
          detectionCount: value.detections.length,
          latestObservation: newestDetection(value.detections),
        }))
      : Promise.resolve(null);
    const mtgPromise = mtgBridgeEnabled
      ? observeProvider('eumetsatMtg', () => fetchEumetsatDetections({ hours, bbox }), value => ({
        configured: true,
        detectionCount: value.detections.length,
        latestRegionalDetection: newestDetection(value.detections),
        compatibilityIndexLatest: value.upstreamLatest,
        compatibilityIndexOldest: value.liveIndexOldest,
        officialLsaSafLatest: value.officialStatus?.upstreamLatest,
        officialLsaSafLagMinutes: value.officialStatus
          ? Math.round(value.officialStatus.lagMs / 60000)
          : undefined,
        eventCount: value.eventCount,
      }))
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
        if (mtgOutcome.value.bridgeComplete) {
          setBounded(
            mtgSnapshotCache,
            snapshotKey,
            mtgOutcome.value.detections,
            MAX_MTG_SNAPSHOT_ENTRIES,
          );
        }
      } else {
        const snapshot = getFresh(mtgSnapshotCache, snapshotKey, mtgStaleMs);
        if (snapshot) {
          const cutoff = Date.now() - hours * 3600000 - MTG_TIME_QUANTIZATION_MS;
          detections = detections.concat(snapshot.filter(detection => Date.parse(detection.timestamp) >= cutoff));
          mtgSucceeded = true;
          warnings.push('MTG refresh failed; using the last successful recent snapshot.');
        } else {
          warnings.push(`MTG compatibility feed: ${providerError(mtgOutcome.reason)}`);
        }
      }
    }

    if (successfulSources === 0 && !mtgSucceeded) {
      throw new Error(warnings.join('; ') || 'All live sources failed');
    }
    detections = detections.filter(detection => insideCoverageDetection(detection, bbox));
    return responseEnvelope({
      mode: warnings.length ? 'live-partial' : 'live',
      detections,
      bbox,
      hours,
      warnings,
    });
  } catch (error) {
    return demoEnvelope({
      mode: 'demo-fallback',
      bbox,
      hours,
      reason: `Live retrieval failed: ${error.message}.`,
    });
  }
}

app.get('/api/detections', auth.requireAuth, async (request, response) => {
  const hours = parseHours(request.query.hours, 48);
  if (hours == null) return response.status(400).json({
    error: 'hours must be the 10-minute window or a whole number from 1 through 120',
  });

  const coverageBbox = parseBbox(defaultBbox);
  if (!coverageBbox) return response.status(500).json({ error: 'Invalid FIRE_BBOX configuration' });
  const hasRequestedBbox = request.query.bbox != null && request.query.bbox !== '';
  const bbox = hasRequestedBbox ? parseBbox(request.query.bbox) : coverageBbox;
  if (!bbox || !bboxWithinCoverage(bbox, coverageBbox)) {
    return response.status(400).json({
      error: 'bbox must be west,south,east,north inside the configured FIRE_BBOX coverage',
    });
  }

  const key = `${bbox}:${hours}:${Boolean(process.env.FIRMS_MAP_KEY)}:${mtgBridgeEnabled}`;
  const windowCacheTtl = detectionCacheTtl(hours, cacheTtl, shortWindowCacheTtl);
  const cached = getFresh(responseCache, key, windowCacheTtl);
  if (cached) return response.json(cached);

  const envelope = await coalesce(responseInFlight, key, async () => {
    const refreshedCache = getFresh(responseCache, key, windowCacheTtl);
    if (refreshedCache) return refreshedCache;
    const value = await loadDetectionEnvelope({ hours, bbox });
    const ttl = value.mode === 'demo-fallback' ? Math.min(windowCacheTtl, 15_000) : windowCacheTtl;
    return setBounded(responseCache, key, value, MAX_RESPONSE_CACHE_ENTRIES, Date.now(), ttl);
  });
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
