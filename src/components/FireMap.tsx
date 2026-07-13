import { Layers3, Map as MapIcon, Mountain } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Map, {
  AttributionControl,
  Layer,
  NavigationControl,
  Popup,
  ScaleControl,
  Source,
  type LayerProps,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre';
import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import type { FireEvent } from '../types';
import { sourceColor } from '../lib/sources';
import { formatNumber, relativeTime } from '../lib/time';

type Basemap = 'street' | 'terrain';

const styles: Record<Basemap, StyleSpecification> = {
  street: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '(c) OpenStreetMap contributors',
      },
    },
    layers: [{
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': -0.28,
        'raster-contrast': 0.1,
        'raster-brightness-max': 0.94,
      },
    }],
  },
  terrain: {
    version: 8,
    sources: {
      topo: {
        type: 'raster',
        tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '(c) OpenStreetMap contributors, SRTM | Map style (c) OpenTopoMap',
      },
    },
    layers: [{
      id: 'topo',
      type: 'raster',
      source: 'topo',
      paint: {
        'raster-saturation': -0.32,
        'raster-contrast': 0.08,
        'raster-brightness-min': 0.06,
        'raster-brightness-max': 0.92,
      },
    }],
  },
};

const eventFill: LayerProps = {
  id: 'event-fill',
  type: 'fill',
  paint: {
    'fill-color': ['match', ['get', 'priority'], 'critical', '#ff1744', 'high', '#ff7a00', '#ffd400'],
    'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.72, 0.48],
  },
};

const eventOutline: LayerProps = {
  id: 'event-outline',
  type: 'line',
  paint: {
    'line-color': ['match', ['get', 'priority'], 'critical', '#690016', 'high', '#713200', '#695700'],
    'line-width': ['case', ['boolean', ['get', 'selected'], false], 4.5, 2.8],
    'line-opacity': 1,
  },
};

const eventHalo: LayerProps = {
  id: 'event-halo',
  type: 'circle',
  paint: {
    'circle-color': ['match', ['get', 'priority'], 'critical', '#ff1744', 'high', '#ff7a00', '#ffd400'],
    'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 16, 12, 23, 40, 32],
    'circle-opacity': 0.34,
    'circle-blur': 0.25,
  },
};

const eventContrastRing: LayerProps = {
  id: 'event-contrast-ring',
  type: 'circle',
  paint: {
    'circle-color': '#121718',
    'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 13, 12, 18, 40, 27],
    'circle-opacity': 0.94,
  },
};

const eventPoints: LayerProps = {
  id: 'event-points',
  type: 'circle',
  paint: {
    'circle-color': ['match', ['get', 'priority'], 'critical', '#ff1744', 'high', '#ff7a00', '#ffd400'],
    'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 9, 12, 14, 40, 23],
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 4, 2.2],
    'circle-opacity': 1,
  },
};

const detectionContrastRing: LayerProps = {
  id: 'selected-detection-rings',
  type: 'circle',
  paint: {
    'circle-color': '#101415',
    'circle-radius': 7.5,
    'circle-opacity': 0.9,
  },
};

const detectionPoints: LayerProps = {
  id: 'selected-detections',
  type: 'circle',
  paint: {
    'circle-color': ['get', 'color'],
    'circle-radius': 5,
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 1.2,
    'circle-opacity': 0.92,
  },
};

interface FireMapProps {
  events: FireEvent[];
  selected?: FireEvent;
  onSelect: (event: FireEvent) => void;
}

export function FireMap({ events, selected, onSelect }: FireMapProps) {
  const mapRef = useRef<MapRef>(null);
  const fittedInitialEvents = useRef(false);
  const [basemap, setBasemap] = useState<Basemap>('street');
  const [mapReady, setMapReady] = useState(false);
  const [hoveredId, setHoveredId] = useState<string>();
  const hovered = events.find(event => event.id === hoveredId);

  const envelopeData = useMemo<FeatureCollection<Polygon | MultiPolygon>>(() => ({
    type: 'FeatureCollection',
    features: events.map(event => ({
      type: 'Feature',
      geometry: event.footprint,
      properties: {
        id: event.id,
        priority: event.priority,
        selected: selected?.id === event.id,
      },
    })),
  }), [events, selected?.id]);

  const pointData = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: events.map(event => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [event.longitude, event.latitude] },
      properties: {
        id: event.id,
        priority: event.priority,
        count: event.detectionCount,
        selected: selected?.id === event.id,
      },
    })),
  }), [events, selected?.id]);

  const selectedData = useMemo<FeatureCollection<Point>>(() => ({
    type: 'FeatureCollection',
    features: (selected?.detections || []).map(detection => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [detection.longitude, detection.latitude] },
      properties: { color: sourceColor(detection.sourceProduct, detection), id: detection.id },
    })),
  }), [selected]);

  useEffect(() => {
    if (!mapReady || !events.length || fittedInitialEvents.current || !mapRef.current) return;
    const longitudes = events.map(event => event.longitude);
    const latitudes = events.map(event => event.latitude);
    mapRef.current.fitBounds([
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ], {
      padding: 58,
      maxZoom: 8.2,
      duration: 0,
    });
    fittedInitialEvents.current = true;
  }, [events, mapReady]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    let [[west, south], [east, north]] = selected.bounds;
    if (west === east) { west -= 0.02; east += 0.02; }
    if (south === north) { south -= 0.02; north += 0.02; }
    mapRef.current.fitBounds([[west, south], [east, north]], {
      padding: { top: 90, right: 90, bottom: 90, left: 90 },
      maxZoom: 13,
      duration: 600,
    });
  }, [selected]);

  const featureEvent = (mapEvent: MapLayerMouseEvent) => {
    const id = mapEvent.features?.[0]?.properties?.id;
    return events.find(event => event.id === id);
  };

  return (
    <div className="map-frame">
      <Map
        ref={mapRef}
        initialViewState={{ longitude: 35.86, latitude: 33.88, zoom: 7.6 }}
        mapStyle={styles[basemap]}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={['event-points', 'event-fill']}
        onClick={event => {
          const fireEvent = featureEvent(event);
          if (fireEvent) onSelect(fireEvent);
        }}
        onMouseMove={event => {
          const fireEvent = featureEvent(event);
          setHoveredId(fireEvent?.id);
          event.target.getCanvas().style.cursor = fireEvent ? 'pointer' : '';
        }}
        onMouseLeave={event => {
          setHoveredId(undefined);
          event.target.getCanvas().style.cursor = '';
        }}
        onLoad={() => setMapReady(true)}
        attributionControl={false}
        minZoom={6}
        maxZoom={16}
      >
        <Source id="event-envelopes" type="geojson" data={envelopeData}>
          <Layer {...eventFill} />
          <Layer {...eventOutline} />
        </Source>
        <Source id="event-centers" type="geojson" data={pointData}>
          <Layer {...eventHalo} />
          <Layer {...eventContrastRing} />
          <Layer {...eventPoints} />
        </Source>
        <Source id="detection-points" type="geojson" data={selectedData}>
          <Layer {...detectionContrastRing} />
          <Layer {...detectionPoints} />
        </Source>
        <NavigationControl position="bottom-right" showCompass={false} />
        <ScaleControl position="bottom-right" unit="metric" />
        <AttributionControl position="bottom-left" compact />
        {hovered && (
          <Popup
            longitude={hovered.longitude}
            latitude={hovered.latitude}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={14}
          >
            <div className="map-popup">
              <b>{hovered.name}</b>
              <span>{relativeTime(hovered.lastSeen)} - {hovered.detectionCount} detections</span>
              <small>{formatNumber(hovered.totalFrp, 1)} summed FRP</small>
            </div>
          </Popup>
        )}
      </Map>

      <div className="basemap-control" role="group" aria-label="Basemap">
        <Layers3 size={15} />
        <button type="button" className={basemap === 'street' ? 'active' : ''} onClick={() => setBasemap('street')} title="Street map">
          <MapIcon size={15} /><span>Street</span>
        </button>
        <button type="button" className={basemap === 'terrain' ? 'active' : ''} onClick={() => setBasemap('terrain')} title="Terrain map">
          <Mountain size={15} /><span>Terrain</span>
        </button>
      </div>

      <div className="map-legend">
        <span><i className="priority-critical" /> Critical</span>
        <span><i className="priority-high" /> High</span>
        <span><i className="priority-watch" /> Watch</span>
        <small>H3 detection envelopes</small>
      </div>
    </div>
  );
}
