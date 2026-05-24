'use client';

import { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { WaterBody, WaterBodyBoundaries } from '@/types';

type MapSelectorProps = {
  waterBodies: WaterBody[];
  selectedId?: string;
  selectionVersion?: number;
  onSelect: (waterBodyId: string) => void;
  isSidebarOpen?: boolean;
};

const DEFAULT_STYLE =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const LAKE_PLACEHOLDER_IMAGE = '/images/lakes/Blue-Lake-Clipart.webp';

const PETROPAVLOVSK = {
  name: 'РџРµС‚СЂРѕРїР°РІР»РѕРІСЃРє',
  lng: 69.143,
  lat: 54.8739,
};

const BOUNDARIES_SOURCE_ID = 'water-body-boundaries';
const NORTH_KAZAKHSTAN_CENTER = {
  lng: 69.4,
  lat: 54.55,
};

const NORTH_KAZAKHSTAN_BOUNDS: [[number, number], [number, number]] = [
  [65.2, 53.15],
  [75.5, 55.55],
];

const NORTH_KAZAKHSTAN_ZOOM = 7;

const REGION_FIT_OPTIONS = {
  padding: 56,
  maxZoom: 9,
  essential: true,
};


const BOUNDARIES_FILL_LAYER_ID = 'water-body-boundaries-fill';
const BOUNDARIES_OUTLINE_LAYER_ID = 'water-body-boundaries-outline';
const BOUNDARIES_LINE_LAYER_ID = 'water-body-boundaries-line';

type PolygonGeometry = Extract<WaterBodyBoundaries, { type: 'Polygon' | 'MultiPolygon' }>;
type LineGeometry = Extract<WaterBodyBoundaries, { type: 'LineString' | 'MultiLineString' }>;
type BoundaryGeometry = PolygonGeometry | LineGeometry;

function isPolygonGeometry(value: unknown): value is PolygonGeometry {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as { type?: unknown }).type === 'Polygon' ||
      (value as { type?: unknown }).type === 'MultiPolygon') &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

function isLineGeometry(value: unknown): value is LineGeometry {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as { type?: unknown }).type === 'LineString' ||
      (value as { type?: unknown }).type === 'MultiLineString') &&
    Array.isArray((value as { coordinates?: unknown }).coordinates)
  );
}

function isBoundaryGeometry(value: unknown): value is BoundaryGeometry {
  return isPolygonGeometry(value) || isLineGeometry(value);
}

function extractBoundaryGeometries(boundaries: WaterBody['boundaries']): BoundaryGeometry[] {
  if (!boundaries) {
    return [];
  }

  if (isBoundaryGeometry(boundaries)) {
    return [boundaries];
  }

  if (boundaries.type === 'Feature' && isBoundaryGeometry(boundaries.geometry)) {
    return [boundaries.geometry];
  }

  if (boundaries.type === 'FeatureCollection') {
    return boundaries.features
      .map((feature) => feature.geometry)
      .filter(isBoundaryGeometry);
  }

  return [];
}

function collectCoordinates(geometry: BoundaryGeometry): [number, number][] {
  if (geometry.type === 'LineString') {
    return geometry.coordinates
      .filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]))
      .map((position) => [position[0], position[1]] as [number, number]);
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates.flatMap((line) =>
      line
        .filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]))
        .map((position) => [position[0], position[1]] as [number, number]),
    );
  }

  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  return polygons.flatMap((polygon) =>
    polygon.flatMap((ring) =>
      ring
        .filter((position) => Number.isFinite(position[0]) && Number.isFinite(position[1]))
        .map((position) => [position[0], position[1]] as [number, number]),
    ),
  );
}

function getGeometryBounds(geometries: BoundaryGeometry[]) {
  const coordinates = geometries.flatMap(collectCoordinates);

  if (!coordinates.length) {
    return null;
  }

  const bounds = new maplibregl.LngLatBounds(coordinates[0], coordinates[0]);
  coordinates.forEach((coordinate) => bounds.extend(coordinate));
  return bounds;
}

function getWaterBodiesBounds(waterBodies: WaterBody[]) {
  return getGeometryBounds(
    waterBodies.flatMap((lake) => extractBoundaryGeometries(lake.boundaries)),
  );
}

function getPopupCoordinate(lake: WaterBody): [number, number] | null {
  const boundaryBounds = getGeometryBounds(extractBoundaryGeometries(lake.boundaries));

  if (boundaryBounds) {
    const center = boundaryBounds.getCenter();
    return [center.lng, center.lat];
  }

  if (lake.latitude != null && lake.longitude != null) {
    return [Number(lake.longitude), Number(lake.latitude)];
  }

  return null;
}

export function MapSelector({
  waterBodies,
  selectedId,
  selectionVersion = 0,
  onSelect,
  isSidebarOpen,
}: MapSelectorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const isUnmountedRef = useRef(false);
  const isMapLoadedRef = useRef(false);
  const pendingMapActionsRef = useRef<Array<(map: maplibregl.Map) => void>>(
    [],
  );

  const validBodies = useMemo(() => {
    return waterBodies.filter(
      (item) => item.latitude != null && item.longitude != null,
    );
  }, [waterBodies]);

  const selectedBody = useMemo(() => {
    return waterBodies.find((item) => item.id === selectedId) ?? null;
  }, [waterBodies, selectedId]);

  const formatArea = (value?: number | null) => {
    if (value == null) {
      return 'РќРµ СѓРєР°Р·Р°РЅР°';
    }

    return `${(value / 100).toLocaleString('ru-RU', {
      maximumFractionDigits: 2,
    })} РєРјВІ`;
  };

  const formatDepth = (value?: number | null) => {
    if (value == null) {
      return 'РќРµ СѓРєР°Р·Р°РЅР°';
    }

    return `${value} Рј`;
  };

  const runWhenMapReady = (callback: (map: maplibregl.Map) => void) => {
    const map = mapRef.current;

    if (!map || isUnmountedRef.current) {
      return;
    }

    if (isMapLoadedRef.current) {
      callback(map);
      return;
    }

    pendingMapActionsRef.current.push(callback);
  };

  const flushPendingMapActions = (map: maplibregl.Map) => {
    if (isUnmountedRef.current) {
      pendingMapActionsRef.current = [];
      return;
    }

    const pendingActions = pendingMapActionsRef.current;
    pendingMapActionsRef.current = [];

    pendingActions.forEach((callback) => {
      callback(map);
    });
  };

  const clearMarkers = () => {
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
  };

  const closePopup = () => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  };

  const createPopupHtml = (lake: WaterBody) => {
    return `
      <div class="wb-mini-card">
        <div class="wb-mini-card__image-wrap">
          <img
            src="${lake.imageUrl || LAKE_PLACEHOLDER_IMAGE}"
            alt="${lake.name}"
            class="wb-mini-card__image"
          />
        </div>

        <div class="wb-mini-card__body">
          <h4 class="wb-mini-card__title">${lake.name}</h4>

          <div class="wb-mini-card__row">
            <span class="wb-mini-card__label">Р Р°Р№РѕРЅ:</span>
            <span class="wb-mini-card__value">${lake.district || 'РќРµ СѓРєР°Р·Р°РЅ'}</span>
          </div>

          <div class="wb-mini-card__row">
            <span class="wb-mini-card__label">РџР»РѕС‰Р°РґСЊ:</span>
            <span class="wb-mini-card__value">${formatArea(lake.passport?.area)}</span>
          </div>

          <div class="wb-mini-card__row">
            <span class="wb-mini-card__label">Р“Р»СѓР±РёРЅР°:</span>
            <span class="wb-mini-card__value">${formatDepth(lake.passport?.maxDepth)}</span>
          </div>

          <a class="wb-mini-card__button" href="/water-bodies/${lake.id}">
            Р”Р°С€Р±РѕСЂРґ РІРѕРґРѕС‘РјР°
          </a>
        </div>
      </div>
    `;
  };

  const createCityPopupHtml = () => {
    return `
      <div class="wb-mini-card wb-mini-card--city">
        <div class="wb-mini-card__body">
          <h4 class="wb-mini-card__title">${PETROPAVLOVSK.name}</h4>

          <div class="wb-mini-card__row">
            <span class="wb-mini-card__label">РљРѕРѕСЂРґРёРЅР°С‚С‹:</span>
            <span class="wb-mini-card__value">${PETROPAVLOVSK.lat}, ${PETROPAVLOVSK.lng}</span>
          </div>
        </div>
      </div>
    `;
  };

  const openLakePopup = (lake: WaterBody) => {
    const popupCoordinate = getPopupCoordinate(lake);

    if (!popupCoordinate) {
      return;
    }

    runWhenMapReady((map) => {
      closePopup();

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 22,
        className: 'wb-maplibre-popup',
      })
        .setLngLat(popupCoordinate)
        .setHTML(createPopupHtml(lake))
        .addTo(map);

      popupRef.current = popup;
    });
  };

  const openCityPopup = () => {
    runWhenMapReady((map) => {
      closePopup();

      const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        offset: 22,
        className: 'wb-maplibre-popup',
      })
        .setLngLat([PETROPAVLOVSK.lng, PETROPAVLOVSK.lat])
        .setHTML(createCityPopupHtml())
        .addTo(map);

      popupRef.current = popup;
    });
  };

  const createLakeMarkerElement = (isSelected: boolean) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = isSelected
      ? 'wb-map-pin wb-map-pin--active'
      : 'wb-map-pin';
    el.setAttribute('aria-label', 'РњР°СЂРєРµСЂ РѕР·РµСЂР°');
    return el;
  };

  const createCityMarkerElement = () => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'wb-city-pin';
    el.setAttribute('aria-label', 'РџРµС‚СЂРѕРїР°РІР»РѕРІСЃРє');
    return el;
  };

  const syncMarkers = () => {
    runWhenMapReady((map) => {
      clearMarkers();

      validBodies.forEach((lake) => {
        const el = createLakeMarkerElement(lake.id === selectedId);
        el.setAttribute('title', lake.name);

        el.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelect(lake.id);
          openLakePopup(lake);
        });

        const marker = new maplibregl.Marker({
          element: el,
        })
          .setLngLat([Number(lake.longitude), Number(lake.latitude)])
          .addTo(map);

        markersRef.current.push(marker);
      });
    });
  };

  const syncBoundaries = () => {
    runWhenMapReady((map) => {
      const features = waterBodies.flatMap((lake) =>
        extractBoundaryGeometries(lake.boundaries).map((geometry) => ({
          type: 'Feature' as const,
          geometry,
          properties: {
            id: lake.id,
            name: lake.name,
            selected: lake.id === selectedId,
          },
        })),
      );

      const collection = {
        type: 'FeatureCollection' as const,
        features,
      };

      const source = map.getSource(BOUNDARIES_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;

      if (source) {
        source.setData(collection);
        return;
      }

      map.addSource(BOUNDARIES_SOURCE_ID, {
        type: 'geojson',
        data: collection,
      });

      map.addLayer({
        id: BOUNDARIES_FILL_LAYER_ID,
        type: 'fill',
        source: BOUNDARIES_SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'selected'], true],
            '#0ea5e9',
            '#22c55e',
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'selected'], true],
            0.35,
            0.22,
          ],
        },
      });

      map.addLayer({
        id: BOUNDARIES_OUTLINE_LAYER_ID,
        type: 'line',
        source: BOUNDARIES_SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], true],
            '#0369a1',
            '#15803d',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'selected'], true],
            3,
            2,
          ],
        },
      });

      map.addLayer({
        id: BOUNDARIES_LINE_LAYER_ID,
        type: 'line',
        source: BOUNDARIES_SOURCE_ID,
        filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], true],
            '#0284c7',
            '#2563eb',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'selected'], true],
            4,
            2.5,
          ],
        },
      });

      map.on('click', BOUNDARIES_FILL_LAYER_ID, (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') {
          onSelect(id);
        }
      });

      map.on('click', BOUNDARIES_LINE_LAYER_ID, (event) => {
        const id = event.features?.[0]?.properties?.id;
        if (typeof id === 'string') {
          onSelect(id);
        }
      });

      map.on('mouseenter', BOUNDARIES_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseenter', BOUNDARIES_LINE_LAYER_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', BOUNDARIES_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });

      map.on('mouseleave', BOUNDARIES_LINE_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    });
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    isUnmountedRef.current = false;
    isMapLoadedRef.current = false;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: [NORTH_KAZAKHSTAN_CENTER.lng, NORTH_KAZAKHSTAN_CENTER.lat],
      zoom: NORTH_KAZAKHSTAN_ZOOM,
      canvasContextAttributes: {
        antialias: true,
      },
    });

    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
      }),
      'top-right',
    );

    map.once('load', () => {
      if (isUnmountedRef.current) {
        return;
      }

      isMapLoadedRef.current = true;

      map.fitBounds(NORTH_KAZAKHSTAN_BOUNDS, REGION_FIT_OPTIONS);

      flushPendingMapActions(map);
      syncBoundaries();
      syncMarkers();
    });

    map.on('error', (event) => {
      console.error('MapLibre error:', event);
    });

    return () => {
      isUnmountedRef.current = true;
      isMapLoadedRef.current = false;
      pendingMapActionsRef.current = [];
      closePopup();
      clearMarkers();

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    syncMarkers();
  }, [selectedId, validBodies]);

  useEffect(() => {
    syncBoundaries();
  }, [selectedId, waterBodies]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      runWhenMapReady((map) => {
        map.resize();
      });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    const handleResize = () => {
      runWhenMapReady((map) => {
        map.resize();
      });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!selectedBody) {
        runWhenMapReady((map) => {
          map.resize();

          const allBounds = getWaterBodiesBounds(waterBodies);

          if (allBounds) {
            map.fitBounds(allBounds, {
              padding: 72,
              maxZoom: 11,
              essential: true,
            });
            return;
          }

          map.fitBounds(NORTH_KAZAKHSTAN_BOUNDS, REGION_FIT_OPTIONS);
        });

        return;
      }

      runWhenMapReady((map) => {
        map.resize();

        const boundaryBounds = getGeometryBounds(
          extractBoundaryGeometries(selectedBody.boundaries),
        );

        if (boundaryBounds) {
          map.fitBounds(boundaryBounds, {
            padding: 72,
            maxZoom: 14,
            essential: true,
          });
          return;
        }

        if (selectedBody.latitude != null && selectedBody.longitude != null) {
          map.flyTo({
            center: [Number(selectedBody.longitude), Number(selectedBody.latitude)],
            zoom: 12,
            essential: true,
          });
        }
      });

      openLakePopup(selectedBody);
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [selectedBody, waterBodies, selectionVersion]);

  return (
    <div
      ref={containerRef}
      className="wb-map-surface wb-map-surface--maplibre"
    />
  );
}
