import { getText } from './http.mjs';

export const DEFAULT_LSA_SAF_WMS_URL = 'https://adaguc.lsasvcs.ipma.pt/adaguc-server?DATASET=MTG-FRP&SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0';
export const DEFAULT_LSA_SAF_MAX_LAG_MS = 60 * 60 * 1000;

export function parseLsaSafCapabilities(xml) {
  const dimension = String(xml).match(/<Dimension\b[^>]*\bname=["']time["'][^>]*>([^<]+)<\/Dimension>/i);
  if (!dimension) throw new Error('official LSA SAF status did not publish a time dimension');
  const openingTag = dimension[0].slice(0, dimension[0].indexOf('>') + 1);
  const defaultTime = openingTag.match(/\bdefault=["']([^"']+)["']/i)?.[1];
  const intervalEnd = dimension[1].trim().split('/')[1];
  const candidate = defaultTime || intervalEnd;
  const epoch = Date.parse(candidate);
  if (!candidate || !Number.isFinite(epoch)) throw new Error('official LSA SAF status published an invalid latest time');
  return new Date(epoch).toISOString();
}

export async function fetchLsaSafStatus({
  signal,
  url = DEFAULT_LSA_SAF_WMS_URL,
  now = Date.now(),
  maxLagMs = DEFAULT_LSA_SAF_MAX_LAG_MS,
  requestText = getText,
} = {}) {
  const response = await requestText(new URL(url), {
    signal,
    maxBytes: 2_000_000,
    headers: { accept: 'application/xml,text/xml' },
  });
  if (!response.ok) throw new Error(`official LSA SAF status: upstream HTTP ${response.status}`);
  const upstreamLatest = parseLsaSafCapabilities(response.body);
  const rawLagMs = now - Date.parse(upstreamLatest);
  if (rawLagMs < -10 * 60 * 1000) throw new Error('official LSA SAF status is unexpectedly ahead of the server clock');
  const lagMs = Math.max(0, rawLagMs);
  return {
    upstreamLatest,
    lagMs,
    stale: lagMs > maxLagMs,
  };
}
