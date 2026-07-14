import { cellToLatLng } from 'h3-js';

function bboxParts(bbox) {
  const parts = String(bbox || '').split(',').map(Number);
  if (parts.length !== 4 || parts.some(value => !Number.isFinite(value))) return null;
  const [west, south, east, north] = parts;
  return west < east && south < north ? { west, south, east, north } : null;
}

export function insideCoveragePoint(latitude, longitude, bbox) {
  const bounds = bboxParts(bbox);
  return Boolean(
    bounds
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && longitude >= bounds.west
    && longitude <= bounds.east
    && latitude >= bounds.south
    && latitude <= bounds.north,
  );
}

export function insideCoverageCell(cell, bbox) {
  const [latitude, longitude] = cellToLatLng(cell);
  return insideCoveragePoint(latitude, longitude, bbox);
}

export function insideCoverageDetection(detection, bbox) {
  return insideCoveragePoint(detection.latitude, detection.longitude, bbox);
}
