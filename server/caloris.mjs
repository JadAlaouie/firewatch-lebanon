import { cellToLatLng, cellToParent, isValidCell } from 'h3-js';
import { insideCoverageCell, insideCoveragePoint } from './coverage.mjs';
import { getBuffer } from './http.mjs';

export const CALORIS_SOURCE = 'MTG_FCI_LSA_SAF';
export const DEFAULT_CALORIS_BASE = 'https://forefire.univ-corse.fr/calormap/';

const RECORD_BYTES = 32;
const HOTSPOT_BYTES = 24;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_INDEX_MAX_LAG_MS = 60 * 60 * 1000;
const DEFAULT_EVENT_CACHE_MS = 60 * 60 * 1000;
const INDEX_RANGES = 4;
export const MTG_TIME_QUANTIZATION_MS = 256_000;
const MAX_EVENT_CACHE_ENTRIES = 1_000;
const MAX_EVENT_CACHE_BYTES = 32_000_000;
let liveIndexCache;
const eventCache = new Map();
let eventCacheBytes = 0;

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function getCalorisResponse(url, options) {
  const retries = options.retries ?? 1;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (options.signal?.aborted) throw new Error('MTG retrieval exceeded its provider timeout');
    const timeoutSignal = AbortSignal.timeout(options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    try {
      const response = await getBuffer(url, {
        signal,
        maxBytes: options.maxBytes,
        headers: options.headers,
      });
      if (response.ok) return response;
      throw new Error(`upstream HTTP ${response.status}`);
    } catch (error) {
      if (options.signal?.aborted) throw new Error('MTG retrieval exceeded its provider timeout');
      lastError = timeoutSignal.aborted
        ? new Error(`${options.label}: request timed out`)
        : new Error(`${options.label}: ${error.message}`);
      if (attempt < retries) await sleep(300 * (attempt + 1));
    }
  }

  throw lastError;
}

async function getCalorisBuffer(url, options) {
  return (await getCalorisResponse(url, options)).body;
}

async function getLiveIndex(url, options) {
  if (
    liveIndexCache
    && liveIndexCache.url === url.href
    && Date.now() - liveIndexCache.time <= options.cacheMs
  ) return liveIndexCache.body;

  const commonHeaders = {
    accept: 'application/octet-stream',
    referer: new URL('../../track.html', url).href,
  };
  const probe = await getCalorisResponse(url, {
    ...options,
    // Some intermediaries ignore Range. Leave enough room for the full-index
    // fallback instead of aborting that otherwise valid HTTP 200 response.
    maxBytes: options.maxBytes,
    label: 'live index probe',
    headers: { ...commonHeaders, range: `bytes=0-${RECORD_BYTES - 1}` },
  });
  if (probe.status === 200) {
    if (!probe.body.length || probe.body.length % RECORD_BYTES) {
      throw new Error('live index fallback: invalid record boundary');
    }
    liveIndexCache = { url: url.href, time: Date.now(), body: probe.body };
    return probe.body;
  }
  const match = String(probe.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (
    probe.status !== 206
    || !match
    || Number(match[1]) !== 0
    || Number(match[2]) !== RECORD_BYTES - 1
    || probe.body.length !== RECORD_BYTES
  ) throw new Error('live index probe: invalid partial response');

  const totalBytes = Number(match[3]);
  if (
    !Number.isSafeInteger(totalBytes)
    || totalBytes < RECORD_BYTES
    || totalBytes > options.maxBytes
    || totalBytes % RECORD_BYTES
  ) {
    throw new Error('live index probe: invalid content range');
  }
  const etag = probe.headers.etag;
  const remainingBytes = totalBytes - RECORD_BYTES;
  const rangeBytes = Math.ceil(remainingBytes / INDEX_RANGES);
  const ranges = Array.from({ length: INDEX_RANGES }, (_, index) => {
    const start = RECORD_BYTES + index * rangeBytes;
    return { start, end: Math.min(totalBytes - 1, start + rangeBytes - 1) };
  }).filter(range => range.start <= range.end);

  const rangeBodies = await Promise.all(ranges.map(async ({ start, end }) => {
    const response = await getCalorisResponse(url, {
      ...options,
      maxBytes: end - start + 1,
      label: `live index range ${start}-${end}`,
      headers: {
        ...commonHeaders,
        range: `bytes=${start}-${end}`,
        ...(etag ? { 'if-range': etag } : {}),
      },
    });
    const contentRange = String(response.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (
      response.status !== 206
      || !contentRange
      || Number(contentRange[1]) !== start
      || Number(contentRange[2]) !== end
      || Number(contentRange[3]) !== totalBytes
      || response.body.length !== end - start + 1
      || (etag && response.headers.etag !== etag)
    ) {
      throw new Error(`live index range ${start}-${end}: incomplete response`);
    }
    return response.body;
  }));

  const body = Buffer.concat([probe.body, ...rangeBodies], totalBytes);
  if (body.length !== totalBytes || body.length % RECORD_BYTES) {
    throw new Error('live index: assembled response is invalid');
  }
  liveIndexCache = { url: url.href, time: Date.now(), body };
  return body;
}

export function tixEpoch(tix) {
  const level = Number(tix >> 42n);
  if (!Number.isInteger(level) || level < 0 || level > 40) throw new Error('Invalid Caloris time-index level');
  const stored = tix & ((1n << 42n) - 1n);
  const prefix = stored >> BigInt(42 - level);
  return Number((prefix << BigInt(40 - level)) - 549755813888n);
}

export function liveIndexTimeRange(buffer) {
  if (!buffer.length || buffer.length % RECORD_BYTES) throw new Error('Invalid Caloris live-index record boundary');
  let oldest = Infinity;
  let latest = -Infinity;
  for (let offset = 0; offset < buffer.length; offset += RECORD_BYTES) {
    let epoch;
    try {
      epoch = tixEpoch(buffer.readBigUInt64LE(offset + 16)) * 1000;
    } catch {
      continue;
    }
    if (!Number.isFinite(epoch) || Math.abs(epoch) > 8.64e15) continue;
    oldest = Math.min(oldest, epoch);
    latest = Math.max(latest, epoch);
  }
  if (!Number.isFinite(oldest) || !Number.isFinite(latest)) throw new Error('Caloris live index has no valid timestamps');
  return {
    oldest: new Date(oldest).toISOString(),
    latest: new Date(latest).toISOString(),
  };
}

function eventId(h7, first) {
  const key = `${h7}_${(first & 0xffffffffffffn).toString(16).padStart(12, '0')}.stfy`;
  return `LIVE:${cellToParent(h7, 0)}/${cellToParent(h7, 3)}/${cellToParent(h7, 5)}/${key}`;
}

export function decodeLiveEvents(buffer, options = {}) {
  if (buffer.length % RECORD_BYTES) throw new Error('Invalid Caloris live-index record boundary');
  const now = options.now ?? Date.now();
  const cutoff = now - (options.hours ?? 48) * 3600000 - MTG_TIME_QUANTIZATION_MS;
  // Event anchors are coarse H3 cells and can sit outside a narrow requested
  // bbox even when one of their hotspot pixels is inside it. Select candidate
  // events with the configured coverage, then apply the exact request bbox in
  // decodeMtGRecords after the event body has been loaded.
  const eventBbox = options.eventBbox ?? options.bbox;
  const events = [];

  for (let offset = 0; offset < buffer.length; offset += RECORD_BYTES) {
    const h7 = buffer.readBigUInt64LE(offset).toString(16).padStart(15, '0');
    const first = buffer.readBigUInt64LE(offset + 8);
    const last = buffer.readBigUInt64LE(offset + 16);
    if (!isValidCell(h7)) continue;
    let lastEpoch;
    try {
      lastEpoch = tixEpoch(last) * 1000;
    } catch {
      continue;
    }
    if (!Number.isFinite(lastEpoch) || Math.abs(lastEpoch) > 8.64e15) continue;
    if (!insideCoverageCell(h7, eventBbox)) continue;
    if (lastEpoch < cutoff) continue;
    events.push({
      id: eventId(h7, first),
      h7,
      first,
      last,
      hotspots: buffer.readUInt32LE(offset + 24),
    });
  }

  return events;
}

function dayNight(timestamp, longitude) {
  const hour = (new Date(timestamp).getUTCHours() + longitude / 15 + 24) % 24;
  return hour >= 6 && hour < 18 ? 'D' : 'N';
}

export function decodeMtGRecords(buffer, options) {
  if (buffer.length % HOTSPOT_BYTES) throw new Error('Invalid Caloris hotspot record boundary');
  const now = options.now ?? Date.now();
  const cutoff = now - options.hours * 3600000 - MTG_TIME_QUANTIZATION_MS;
  const detections = [];

  for (let offset = 0; offset < buffer.length; offset += HOTSPOT_BYTES) {
    if (String.fromCharCode(buffer.readUInt8(offset + 21)) !== 'F') continue;
    const cell = buffer.readBigUInt64BE(offset).toString(16).padStart(15, '0');
    if (!isValidCell(cell)) continue;
    let timestampEpoch;
    try {
      timestampEpoch = tixEpoch(buffer.readBigUInt64BE(offset + 8)) * 1000;
    } catch {
      continue;
    }
    const frp = buffer.readFloatLE(offset + 16);
    if (!Number.isFinite(timestampEpoch) || Math.abs(timestampEpoch) > 8.64e15 || timestampEpoch < cutoff || timestampEpoch > now + MTG_TIME_QUANTIZATION_MS) continue;
    if (!Number.isFinite(frp)) continue;
    const timestamp = new Date(timestampEpoch).toISOString();
    const [latitude, longitude] = cellToLatLng(cell);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (!insideCoveragePoint(latitude, longitude, options.bbox)) continue;

    detections.push({
      id: `mtg-${cell}-${timestamp}-${offset}`,
      latitude,
      longitude,
      timestamp,
      frp: Math.max(0, frp),
      confidence: Math.round(Math.min(100, buffer.readUInt8(offset + 20) / 254 * 100)),
      satellite: 'Meteosat-12 (MTG-I1)',
      instrument: 'FCI',
      sourceProduct: CALORIS_SOURCE,
      daynight: dayNight(timestamp, longitude),
      type: 0,
      demo: false,
      eventAnchorCell: options.eventAnchorCell,
    });
  }

  return detections;
}

async function mapConcurrentSettled(items, concurrency, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await callback(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function normalizedBaseUrl(baseUrl) {
  const base = new URL(baseUrl);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  return base;
}

function cachedEvent(key, maxAgeMs, now) {
  const cached = eventCache.get(key);
  if (!cached || now - cached.time > maxAgeMs) {
    if (cached) {
      eventCache.delete(key);
      eventCacheBytes -= cached.body.length;
    }
    return undefined;
  }
  return cached.body;
}

function rememberEvent(key, body, now) {
  const previous = eventCache.get(key);
  if (previous) eventCacheBytes -= previous.body.length;
  eventCache.delete(key);
  eventCache.set(key, { time: now, body });
  eventCacheBytes += body.length;
  while (eventCache.size > MAX_EVENT_CACHE_ENTRIES || eventCacheBytes > MAX_EVENT_CACHE_BYTES) {
    const oldestKey = eventCache.keys().next().value;
    const oldest = eventCache.get(oldestKey);
    eventCache.delete(oldestKey);
    eventCacheBytes -= oldest.body.length;
  }
}

export async function fetchCalorisMtGDetections({
  hours,
  bbox,
  eventBbox = bbox,
  signal,
  baseUrl = DEFAULT_CALORIS_BASE,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  indexTimeoutMs = 60_000,
  indexCacheMs = 240_000,
  indexMaxLagMs = DEFAULT_INDEX_MAX_LAG_MS,
  eventCacheMs = DEFAULT_EVENT_CACHE_MS,
}) {
  const base = normalizedBaseUrl(baseUrl);
  const indexUrl = new URL('ARCH/H3TI/LIVE.h3ti', base);
  const indexBody = await getLiveIndex(indexUrl, {
    signal,
    maxBytes: 5_000_000,
    requestTimeoutMs: indexTimeoutMs,
    cacheMs: indexCacheMs,
  });

  const now = Date.now();
  const indexRange = liveIndexTimeRange(indexBody);
  const indexLagMs = Math.max(0, now - Date.parse(indexRange.latest));
  const events = decodeLiveEvents(indexBody, { hours, bbox, eventBbox, now });
  const eventResults = await mapConcurrentSettled(events, 6, async event => {
    const cacheKey = `${base.href}:${event.id}`;
    const url = new URL('stfyhotspot.php', base);
    url.searchParams.set('api', 'event');
    url.searchParams.set('id', event.id);
    url.searchParams.set('db', 'ARCH');
    try {
      const body = await getCalorisBuffer(url, {
        signal,
        maxBytes: 2_000_000,
        requestTimeoutMs,
        label: `event ${event.h7}`,
      });
      if (event.hotspots > 0 && !body.length) throw new Error(`event ${event.h7}: empty response`);
      const detections = decodeMtGRecords(body, { hours, bbox, now, eventAnchorCell: event.h7 });
      rememberEvent(cacheKey, body, now);
      return { detections, cached: false };
    } catch (error) {
      const cachedBody = cachedEvent(cacheKey, eventCacheMs, now);
      if (cachedBody) {
        const detections = decodeMtGRecords(cachedBody, { hours, bbox, now, eventAnchorCell: event.h7 });
        return { detections, cached: true, error };
      }
      throw error;
    }
  });

  const successfulEvents = eventResults.filter(result => result.status === 'fulfilled');
  const failedEvents = eventResults.length - successfulEvents.length;
  const cachedEvents = successfulEvents.filter(result => result.value.cached).length;
  if (events.length && !successfulEvents.length) {
    const firstFailure = eventResults.find(result => result.status === 'rejected');
    throw new Error(firstFailure?.reason?.message || 'all MTG event requests failed');
  }

  const unique = new Map();
  for (const detection of successfulEvents.flatMap(result => result.value.detections)) {
    const key = `${detection.latitude}:${detection.longitude}:${detection.timestamp}:${detection.frp.toFixed(3)}`;
    unique.set(key, detection);
  }
  const warnings = [];
  if (indexLagMs > indexMaxLagMs) {
    warnings.push(`MTG compatibility feed: live index is ${Math.round(indexLagMs / 60000)} minutes behind.`);
  }
  if (failedEvents) {
    warnings.push(`MTG compatibility feed: ${failedEvents} of ${events.length} event files were unavailable; retained the successful events.`);
  }
  if (cachedEvents) {
    warnings.push(`MTG compatibility feed: used recent cached data for ${cachedEvents} of ${events.length} event files.`);
  }
  return {
    detections: [...unique.values()],
    warnings,
    upstreamLatest: indexRange.latest,
    liveIndexOldest: indexRange.oldest,
    indexLagMs,
    eventCount: events.length,
  };
}
