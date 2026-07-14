import { cellToLatLng, cellToParent } from 'h3-js';
import { insideCoverageCell, insideCoveragePoint } from './coverage.mjs';
import { getBuffer } from './http.mjs';

export const CALORIS_SOURCE = 'MTG_FCI_LSA_SAF';
export const DEFAULT_CALORIS_BASE = 'https://forefire.univ-corse.fr/calormap/';

const RECORD_BYTES = 32;
const HOTSPOT_BYTES = 24;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const INDEX_RANGES = 4;
let liveIndexCache;

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
    maxBytes: RECORD_BYTES,
    label: 'live index probe',
    headers: { ...commonHeaders, range: `bytes=0-${RECORD_BYTES - 1}` },
  });
  const match = String(probe.headers['content-range'] || '').match(/^bytes 0-\d+\/(\d+)$/);
  if (probe.status !== 206 || !match) {
    liveIndexCache = { url: url.href, time: Date.now(), body: probe.body };
    return probe.body;
  }

  const totalBytes = Number(match[1]);
  if (!Number.isSafeInteger(totalBytes) || totalBytes < RECORD_BYTES) {
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
    if (response.status !== 206 || response.body.length !== end - start + 1) {
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
  const stored = tix & ((1n << 42n) - 1n);
  const prefix = stored >> BigInt(42 - level);
  return Number((prefix << BigInt(40 - level)) - 549755813888n);
}

function eventId(h7, first) {
  const key = `${h7}_${(first & 0xffffffffffffn).toString(16).padStart(12, '0')}.stfy`;
  return `LIVE:${cellToParent(h7, 0)}/${cellToParent(h7, 3)}/${cellToParent(h7, 5)}/${key}`;
}

export function decodeLiveEvents(buffer, options = {}) {
  if (buffer.length % RECORD_BYTES) throw new Error('Invalid Caloris live-index record boundary');
  const now = options.now ?? Date.now();
  const cutoff = now - (options.hours ?? 48) * 3600000;
  const events = [];

  for (let offset = 0; offset < buffer.length; offset += RECORD_BYTES) {
    const h7 = buffer.readBigUInt64LE(offset).toString(16).padStart(15, '0');
    const first = buffer.readBigUInt64LE(offset + 8);
    const last = buffer.readBigUInt64LE(offset + 16);
    if (!insideCoverageCell(h7, options.bbox)) continue;
    if (tixEpoch(last) * 1000 < cutoff) continue;
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
  const cutoff = (options.now ?? Date.now()) - options.hours * 3600000;
  const detections = [];

  for (let offset = 0; offset < buffer.length; offset += HOTSPOT_BYTES) {
    if (String.fromCharCode(buffer.readUInt8(offset + 21)) !== 'F') continue;
    const cell = buffer.readBigUInt64BE(offset).toString(16).padStart(15, '0');
    const timestamp = new Date(tixEpoch(buffer.readBigUInt64BE(offset + 8)) * 1000).toISOString();
    if (Date.parse(timestamp) < cutoff) continue;
    const [latitude, longitude] = cellToLatLng(cell);
    if (!insideCoveragePoint(latitude, longitude, options.bbox)) continue;

    detections.push({
      id: `mtg-${cell}-${timestamp}-${offset}`,
      latitude,
      longitude,
      timestamp,
      frp: Math.max(0, buffer.readFloatLE(offset + 16)),
      confidence: Math.round(Math.min(100, buffer.readUInt8(offset + 20) / 254 * 100)),
      satellite: 'MTG-I1',
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

export async function fetchCalorisMtGDetections({
  hours,
  bbox,
  signal,
  baseUrl = DEFAULT_CALORIS_BASE,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  indexTimeoutMs = 60_000,
  indexCacheMs = 240_000,
}) {
  const base = new URL(baseUrl);
  const indexUrl = new URL('ARCH/H3TI/LIVE.h3ti', base);
  const indexBody = await getLiveIndex(indexUrl, {
    signal,
    maxBytes: 5_000_000,
    requestTimeoutMs: indexTimeoutMs,
    cacheMs: indexCacheMs,
  });

  const now = Date.now();
  const events = decodeLiveEvents(indexBody, { hours, bbox, now });
  const eventResults = await mapConcurrentSettled(events, 6, async event => {
    const url = new URL('stfyhotspot.php', base);
    url.searchParams.set('api', 'event');
    url.searchParams.set('id', event.id);
    url.searchParams.set('db', 'ARCH');
    const body = await getCalorisBuffer(url, {
      signal,
      maxBytes: 2_000_000,
      requestTimeoutMs,
      label: `event ${event.h7}`,
    });
    return decodeMtGRecords(body, { hours, bbox, now, eventAnchorCell: event.h7 });
  });

  const successfulEvents = eventResults.filter(result => result.status === 'fulfilled');
  const failedEvents = eventResults.length - successfulEvents.length;
  if (events.length && !successfulEvents.length) {
    const firstFailure = eventResults.find(result => result.status === 'rejected');
    throw new Error(firstFailure?.reason?.message || 'all MTG event requests failed');
  }

  const unique = new Map();
  for (const detection of successfulEvents.flatMap(result => result.value)) {
    const key = `${detection.latitude}:${detection.longitude}:${detection.timestamp}:${detection.frp.toFixed(3)}`;
    unique.set(key, detection);
  }
  return {
    detections: [...unique.values()],
    warnings: failedEvents
      ? [`MTG compatibility feed: ${failedEvents} of ${events.length} event files were unavailable; retained the successful events.`]
      : [],
  };
}
