import type { MultiPolygon, Polygon } from 'geojson';

export type DataMode = 'live' | 'live-partial' | 'demo' | 'demo-fallback' | 'imported';

export interface Detection {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  frp: number;
  confidence: number;
  satellite: string;
  instrument: string;
  sourceProduct: string;
  daynight: 'D' | 'N';
  type: number;
  demo: boolean;
  regionHint?: string;
  eventAnchorCell?: string;
}

export interface DetectionResponse {
  mode: DataMode;
  generatedAt: string;
  latestObservation: string;
  bbox: string;
  hours: number;
  sources: string[];
  warnings: string[];
  providerStatus?: Record<string, {
    configured: boolean;
    status: 'idle' | 'checking' | 'ok' | 'degraded' | 'down' | 'disabled' | 'stale';
    checkedAt?: string;
    lastSuccess?: string;
    latencyMs?: number;
    detectionCount?: number;
    error?: string;
    [detail: string]: unknown;
  }>;
  detections: Detection[];
}

export type EventPriority = 'critical' | 'high' | 'watch';
export type EventStatus = 'recent' | 'monitoring' | 'stale';

export interface FireEvent {
  id: string;
  name: string;
  anchorCell: string;
  longitude: number;
  latitude: number;
  firstSeen: string;
  lastSeen: string;
  detections: Detection[];
  detectionCount: number;
  totalFrp: number;
  maxFrp: number;
  averageConfidence: number;
  sources: Record<string, number>;
  priority: EventPriority;
  status: EventStatus;
  footprintCells: string[];
  footprint: Polygon | MultiPolygon;
  bounds: [[number, number], [number, number]];
}

export interface ImportResult {
  detections: Detection[];
  rejected: number;
}
