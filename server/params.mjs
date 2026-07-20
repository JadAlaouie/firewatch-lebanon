export const TEN_MINUTES_IN_HOURS = 10 / 60;

export function parseHours(value, fallback = 48) {
  if (Array.isArray(value)) return null;
  const candidate = value == null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(candidate)) return null;
  if (Math.abs(candidate - TEN_MINUTES_IN_HOURS) < 1e-6) return TEN_MINUTES_IN_HOURS;
  return Number.isInteger(candidate) && candidate >= 1 && candidate <= 120 ? candidate : null;
}

export function parseBbox(value) {
  if (Array.isArray(value)) return null;
  const rawParts = String(value || '').split(',');
  if (rawParts.length !== 4 || rawParts.some(part => !part.trim())) return null;
  const parts = rawParts.map(Number);
  if (parts.some(part => !Number.isFinite(part))) return null;
  const [west, south, east, north] = parts;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return parts.map(part => Number(part.toFixed(5))).join(',');
}

export function bboxWithinCoverage(candidate, coverage) {
  const inner = parseBbox(candidate);
  const outer = parseBbox(coverage);
  if (!inner || !outer) return false;
  const [west, south, east, north] = inner.split(',').map(Number);
  const [outerWest, outerSouth, outerEast, outerNorth] = outer.split(',').map(Number);
  return west >= outerWest && south >= outerSouth && east <= outerEast && north <= outerNorth;
}
