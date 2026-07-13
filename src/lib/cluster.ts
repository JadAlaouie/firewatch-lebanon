import { cellToLatLng, cellsToMultiPolygon, gridDisk, latLngToCell } from 'h3-js';
import type { Detection, EventPriority, EventStatus, FireEvent } from '../types';
import { nearestRegion } from './regions';

export const CLUSTER_RESOLUTION = 7;
export const FOOTPRINT_RESOLUTION = 9;
export const DEFAULT_EVENT_GAP_HOURS = 12;

class UnionFind {
  private readonly parents: number[];
  private readonly ranks: number[];

  constructor(size: number) {
    this.parents = Array.from({ length: size }, (_, index) => index);
    this.ranks = Array(size).fill(0);
  }

  find(value: number): number {
    if (this.parents[value] !== value) this.parents[value] = this.find(this.parents[value]);
    return this.parents[value];
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;

    if (this.ranks[leftRoot] < this.ranks[rightRoot]) this.parents[leftRoot] = rightRoot;
    else if (this.ranks[leftRoot] > this.ranks[rightRoot]) this.parents[rightRoot] = leftRoot;
    else {
      this.parents[rightRoot] = leftRoot;
      this.ranks[leftRoot] += 1;
    }
  }
}

function eventPriority(totalFrp: number, maxFrp: number, count: number): EventPriority {
  if (maxFrp >= 45 || totalFrp >= 240 || count >= 35) return 'critical';
  if (maxFrp >= 18 || totalFrp >= 75 || count >= 12) return 'high';
  return 'watch';
}

function eventStatus(lastSeen: string, now: number): EventStatus {
  const ageHours = (now - Date.parse(lastSeen)) / 3600000;
  if (ageHours <= 6) return 'recent';
  if (ageHours <= 24) return 'monitoring';
  return 'stale';
}

function dominantRegion(detections: Detection[], longitude: number, latitude: number) {
  const hints = detections.reduce<Record<string, number>>((counts, detection) => {
    if (detection.regionHint) counts[detection.regionHint] = (counts[detection.regionHint] || 0) + 1;
    return counts;
  }, {});
  const hinted = Object.entries(hints).sort((a, b) => b[1] - a[1])[0]?.[0];
  return hinted || nearestRegion(longitude, latitude);
}

function preferredAnchorCell(detections: Detection[], meanLatitude: number, meanLongitude: number) {
  const candidates = detections.reduce<Map<string, { count: number; lastSeen: string }>>((cells, detection) => {
    if (!detection.eventAnchorCell) return cells;
    const current = cells.get(detection.eventAnchorCell);
    cells.set(detection.eventAnchorCell, {
      count: (current?.count || 0) + 1,
      lastSeen: current?.lastSeen && current.lastSeen > detection.timestamp
        ? current.lastSeen
        : detection.timestamp,
    });
    return cells;
  }, new Map());
  const preferred = [...candidates.entries()]
    .sort((left, right) => right[1].count - left[1].count || right[1].lastSeen.localeCompare(left[1].lastSeen))[0]?.[0];
  return preferred || latLngToCell(meanLatitude, meanLongitude, CLUSTER_RESOLUTION);
}

function summarizeEvent(group: Detection[], now: number): FireEvent {
  const detections = [...group].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const firstSeen = detections[0].timestamp;
  const lastSeen = detections[detections.length - 1].timestamp;
  const meanLongitude = detections.reduce((sum, item) => sum + item.longitude, 0) / detections.length;
  const meanLatitude = detections.reduce((sum, item) => sum + item.latitude, 0) / detections.length;
  const anchorCell = preferredAnchorCell(detections, meanLatitude, meanLongitude);
  const [latitude, longitude] = cellToLatLng(anchorCell);
  const totalFrp = detections.reduce((sum, item) => sum + item.frp, 0);
  const maxFrp = Math.max(0, ...detections.map(item => item.frp));
  const averageConfidence = detections.reduce((sum, item) => sum + item.confidence, 0) / detections.length;
  const sources = detections.reduce<Record<string, number>>((counts, item) => {
    counts[item.sourceProduct] = (counts[item.sourceProduct] || 0) + 1;
    return counts;
  }, {});
  const footprintCells = [...new Set(detections.map(item => (
    latLngToCell(item.latitude, item.longitude, FOOTPRINT_RESOLUTION)
  )))];
  const polygons = cellsToMultiPolygon(footprintCells, true) as number[][][][];
  const footprint = polygons.length === 1
    ? { type: 'Polygon' as const, coordinates: polygons[0] }
    : { type: 'MultiPolygon' as const, coordinates: polygons };
  const longitudes = detections.map(item => item.longitude);
  const latitudes = detections.map(item => item.latitude);
  const region = dominantRegion(detections, longitude, latitude);

  return {
    id: `${anchorCell}-${Date.parse(firstSeen)}`,
    name: `${region} cluster`,
    anchorCell,
    longitude,
    latitude,
    firstSeen,
    lastSeen,
    detections,
    detectionCount: detections.length,
    totalFrp,
    maxFrp,
    averageConfidence,
    sources,
    priority: eventPriority(totalFrp, maxFrp, detections.length),
    status: eventStatus(lastSeen, now),
    footprintCells,
    footprint,
    bounds: [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ],
  };
}

export function clusterDetections(
  input: Detection[],
  options: { gapHours?: number; now?: number } = {},
) {
  const detections = [...input]
    .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && !Number.isNaN(Date.parse(item.timestamp)))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!detections.length) return [];

  const unionFind = new UnionFind(detections.length);
  const byCell = new Map<string, number[]>();
  const gapMs = (options.gapHours ?? DEFAULT_EVENT_GAP_HOURS) * 3600000;

  detections.forEach((detection, index) => {
    const cell = latLngToCell(detection.latitude, detection.longitude, CLUSTER_RESOLUTION);
    const currentTime = Date.parse(detection.timestamp);

    for (const neighbor of gridDisk(cell, 1)) {
      const candidates = byCell.get(neighbor) || [];
      for (let cursor = candidates.length - 1; cursor >= 0; cursor -= 1) {
        const candidateIndex = candidates[cursor];
        const delta = currentTime - Date.parse(detections[candidateIndex].timestamp);
        if (delta > gapMs) break;
        unionFind.union(index, candidateIndex);
      }
    }

    const indexes = byCell.get(cell) || [];
    indexes.push(index);
    byCell.set(cell, indexes);
  });

  const groups = new Map<number, Detection[]>();
  detections.forEach((detection, index) => {
    const root = unionFind.find(index);
    const group = groups.get(root) || [];
    group.push(detection);
    groups.set(root, group);
  });

  const now = options.now ?? Date.now();
  return [...groups.values()]
    .map(group => summarizeEvent(group, now))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
