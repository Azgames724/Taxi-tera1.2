/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, Fragment, memo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MarkerClusterGroup from 'react-leaflet-cluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { Station, COORDS, STATIONS, ROUTES } from '../data/transitData';
import { TripPath } from '../lib/routing';

// Fix Leaflet marker icons
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapProps {
  center: [number, number];
  zoom: number;
  userLocation: [number, number] | null;
  selectedStation: Station | null;
  activePath: TripPath | null;
  onStationClick: (s: Station | string) => void;
  lang: 'en' | 'am';
  panelOpen: boolean;
  isOffline?: boolean;
  plannerStart?: [number, number] | null;
  plannerEnd?: [number, number] | null;
}

function MapUpdater({ center, zoom, activePath, panelOpen, plannerStart, plannerEnd }: { center: [number, number], zoom: number, activePath: any, panelOpen: boolean, plannerStart?: [number, number] | null; plannerEnd?: [number, number] | null }) {
  const map = useMap();
  const lastCenter = useRef<[number, number]>(center);
  const lastZoom = useRef<number>(zoom);
  const isMoving = useRef(false);
  
  useEffect(() => {
    map.on('movestart', () => { isMoving.current = true; });
    map.on('moveend', () => { isMoving.current = false; });
  }, [map]);

  useEffect(() => {
    // Initial resize fix and panel changes
    // Increased delay and added a check to prevent multiple triggers during animation
    const timer = setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 600); // Wait for transition to complete fully
    return () => clearTimeout(timer);
  }, [map, panelOpen]);

  useEffect(() => {
    if (isMoving.current) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    const latDiff = Math.abs(currentCenter.lat - center[0]);
    const lngDiff = Math.abs(currentCenter.lng - center[1]);
    
    // Ignore micro-jitter to save CPU and reduce lag
    if (latDiff < 0.0005 && lngDiff < 0.0005 && Math.abs(currentZoom - zoom) < 0.1) return;

    // Use setView for most updates instead of flyTo which is heavier
    // FlyTo only for big jumps
    const isBigJump = latDiff > 0.02 || lngDiff > 0.02;

    if (isBigJump) {
      map.flyTo(center, zoom, { duration: 1 });
    } else {
      map.panTo(center, { animate: true, duration: 0.5 });
    }
    
    lastCenter.current = center;
    lastZoom.current = zoom;
  }, [center, zoom, map]);

  useEffect(() => {
    if (activePath && activePath.legs.length > 0) {
      const coords: [number, number][] = [];
      activePath.legs.forEach((leg: any) => {
        if (leg.geometry) {
          coords.push(...leg.geometry);
        } else {
          if (COORDS[leg.from]) coords.push(COORDS[leg.from]);
          if (COORDS[leg.to]) coords.push(COORDS[leg.to]);
        }
      });
      
      if (coords.length > 1) {
        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16, animate: true });
      }
    } else {
      const coords: [number, number][] = [];
      if (plannerStart) coords.push(plannerStart);
      if (plannerEnd) coords.push(plannerEnd);
      if (coords.length > 0) {
        if (coords.length === 1) {
          map.setView(coords[0], 15, { animate: true });
        } else {
          const bounds = L.latLngBounds(coords);
          map.fitBounds(bounds, { padding: [80, 80], maxZoom: 15, animate: true });
        }
      }
    }
  }, [activePath, plannerStart, plannerEnd, map]);

  return null;
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (z: number) => void }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom())
  });
  return null;
}

const userIcon = L.divIcon({
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
      <!-- Glowing core pulse representing localized position -->
      <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background: rgba(8, 145, 178, 0.15); animation: pulse 2s infinite ease-in-out;"></div>
      <div style="position: absolute; width: 16px; height: 16px; border-radius: 50%; background: #0891B2; border: 2.5px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.25);"></div>
    </div>
  `,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

const minibusIcon = (showIcon?: boolean, count?: number) => L.divIcon({
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 64px; height: 64px;">
      <!-- iOS style custom translucent coverage range halo matching screenshot exactly -->
      <div style="position: absolute; width: 52px; height: 52px; border-radius: 50%; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.25);"></div>
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(56, 189, 248, 0.1); filter: blur(3px);"></div>
      
      <!-- Sleek high-contrast black marker node -->
      <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: #0f172a; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,0.2); transition: transform 0.2s ease;">
        <span style="font-size: ${showIcon ? '11px' : '9px'}; font-weight: 900; color: white; font-family: system-ui, -apple-system, sans-serif;">
          ${showIcon ? '🚌' : (count || 3)}
        </span>
      </div>
    </div>
  `,
  className: '',
  iconSize: [64, 64],
  iconAnchor: [32, 32]
});

const routeIcon = (isStart?: boolean) => L.divIcon({
  html: `
    <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 48px; height: 48px;">
      <!-- High contrast travel nodes with subtle micro bounce -->
      <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); filter: blur(2px);"></div>
      <div style="background: ${isStart ? '#0891B2' : '#F59E0B'}; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.25); animation: bounce 1.2s infinite alternate;">
        <span style="font-size: 11px;">${isStart ? '🏁' : '📍'}</span>
      </div>
    </div>
  `,
  className: '',
  iconSize: [48, 48],
  iconAnchor: [24, 24]
});

const plannerStartIcon = (label: string) => L.divIcon({
  html: `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 120px; height: 60px;">
      <div style="background: #0891B2; color: white; font-family: system-ui, -apple-system, sans-serif; font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(8,145,178,0.3); border: 2.5px solid white; white-space: nowrap; margin-bottom: 2px;">
         🏁 ${label}
      </div>
      <div style="background: #0891B2; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);"></div>
    </div>
  `,
  className: '',
  iconSize: [120, 60],
  iconAnchor: [60, 52]
});

const plannerEndIcon = (label: string) => L.divIcon({
  html: `
    <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 120px; height: 60px;">
      <div style="background: #F59E0B; color: white; font-family: system-ui, -apple-system, sans-serif; font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(245,158,11,0.3); border: 2.5px solid white; white-space: nowrap; margin-bottom: 2px;">
         📍 ${label}
      </div>
      <div style="background: #F59E0B; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.355);"></div>
    </div>
  `,
  className: '',
  iconSize: [120, 60],
  iconAnchor: [60, 52]
});

const mapStyles = `
  @keyframes bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-4px); }
  }
  @keyframes pulse {
    0% { transform: scale(0.8); opacity: 0.5; }
    50% { transform: scale(1.2); opacity: 1; }
    100% { transform: scale(0.8); opacity: 0.5; }
  }
  .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large {
    background-color: rgba(15, 23, 42, 0.15) !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .marker-cluster-small div, .marker-cluster-medium div, .marker-cluster-large div {
    background-color: #0f172a !important;
    color: white !important;
    font-weight: 900 !important;
    font-size: 11px !important;
    width: 28px !important;
    height: 28px !important;
    border-radius: 50% !important;
    border: 2px solid white !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    margin: 4px !important;
    box-shadow: 0 4px 10px rgba(0,0,0,0.15) !important;
  }
  .blueprint {
    background-color: #0b1329 !important;
    background-image: 
      radial-gradient(rgba(8, 145, 178, 0.25) 1.5px, transparent 1.5px),
      linear-gradient(rgba(8, 145, 178, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(8, 145, 178, 0.08) 1px, transparent 1px) !important;
    background-size: 24px 24px, 48px 48px, 48px 48px !important;
    background-position: center !important;
  }
`;

const Map = memo(({ center, zoom, userLocation, activePath, onStationClick, lang, panelOpen, isOffline = false, plannerStart, plannerEnd }: MapProps) => {
  const locations = useMemo(() => Object.entries(COORDS), []);
  const stationData = useMemo(() => STATIONS, []);
  
  const stationLookup = useMemo(() => {
    const map = new globalThis.Map<string, Station>();
    for (const s of STATIONS) {
      map.set(s.name, s);
    }
    return map;
  }, []);

  const [currentZoom, setCurrentZoom] = useState(zoom);

  const [localOffline, setLocalOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setLocalOffline(false);
    const handleOffline = () => setLocalOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const offline = isOffline || localOffline;

  const handleMarkerClick = useMemo(() => (name: string, pos: [number, number]) => {
    onStationClick(name);
  }, [onStationClick]);

  const showStationIcons = currentZoom >= 16;

  return (
    <div className="w-full h-full relative z-0">
      <style>{mapStyles}</style>

      {offline && (
        <div className="absolute top-24 right-3 z-[1000] pointer-events-none">
          <div className="bg-slate-950/90 backdrop-blur-md text-cyan-400 border border-cyan-500/30 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-2xl animate-pulse">
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />
            <span className="text-[10px] font-black tracking-wider uppercase">Addis Ababa Offline Map</span>
          </div>
        </div>
      )}

      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        zoomControl={false}
        preferCanvas={true}
        className={`w-full h-full ${offline ? 'blueprint' : ''}`}
        maxBounds={[[8.82, 38.60], [9.12, 38.90]]}
        maxBoundsViscosity={1.0}
        minZoom={12}
        maxZoom={18}
      >
        {!offline && (
          <TileLayer
            attribution='&copy; Voyager'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            updateWhenIdle={true}
            keepBuffer={3}
            opacity={1.0}
          />
        )}
        <MapUpdater center={center} zoom={zoom} activePath={activePath} panelOpen={panelOpen} plannerStart={plannerStart} plannerEnd={plannerEnd} />
        <ZoomTracker onZoomChange={setCurrentZoom} />

        {offline && (
          <Fragment key="offline-route-mesh">
            {ROUTES.map((r, idx) => {
              const fromCoord = COORDS[r.from];
              const toCoord = COORDS[r.to];
              if (!fromCoord || !toCoord) return null;
              
              const isEven = idx % 2 === 0;
              return (
                <Polyline
                  key={`offline-mesh-${r.id}-${idx}`}
                  positions={[fromCoord, toCoord]}
                  pathOptions={{
                    color: isEven ? '#06b6d4' : '#f59e0b',
                    weight: 1.2,
                    opacity: 0.12,
                    dashArray: '3, 6',
                    interactive: false
                  }}
                />
              );
            })}
          </Fragment>
        )}
        
        {userLocation && (
          <Marker position={userLocation} icon={userIcon} zIndexOffset={3000} />
        )}

        {plannerStart && (
          <Marker 
            position={plannerStart} 
            icon={plannerStartIcon(lang === 'en' ? 'Origin' : 'መነሻ')} 
            zIndexOffset={5000}
          />
        )}

        {plannerEnd && (
          <Marker 
            position={plannerEnd} 
            icon={plannerEndIcon(lang === 'en' ? 'Destination' : 'መድረሻ')} 
            zIndexOffset={5000}
          />
        )}

        <MarkerClusterGroup
          maxClusterRadius={60}
          disableClusteringAtZoom={15}
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={true}
        >
          {locations.map(([name, pos], index) => {
            const station = stationLookup.get(name);
            return (
              <Marker 
                key={`loc-${name}-${showStationIcons ? 'icon' : 'num'}`}
                position={pos} 
                icon={minibusIcon(showStationIcons, station?.r.length || (index % 5 + 2))}
                eventHandlers={{ click: () => handleMarkerClick(name, pos) }}
              />
            );
          })}
        </MarkerClusterGroup>

        {/* Route visualization for the active path */}
        {activePath ? (
          <Fragment key={`active-path-${activePath.legs.length}-${activePath.legs.map(l => l.from).join('-')}-${activePath.legs.some(l => !!l.geometry)}`}>
            {activePath.legs.map((leg, i) => {
              const fromCoord = COORDS[leg.from];
              const toCoord = COORDS[leg.to];
              
              if (!fromCoord || !toCoord) return null;

              // If geometry exists, use it. Otherwise use the start/end points.
              const positions = leg.geometry || [fromCoord, toCoord];

              return (
                <Fragment key={`leg-${i}-${leg.from}-${leg.to}`}>
                  <Marker 
                    position={fromCoord} 
                    icon={routeIcon(i === 0)} 
                    zIndexOffset={4000 + i}
                  />
                  {i === activePath.legs.length - 1 && (
                    <Marker 
                      position={toCoord} 
                      icon={routeIcon(false)} 
                      zIndexOffset={4000 + i + 1}
                    />
                  )}
                  {/* Glow effect for road path */}
                  <Polyline 
                    positions={positions} 
                    pathOptions={{ 
                      color: 'white', 
                      weight: 10,
                      opacity: 0.6,
                      lineCap: 'round',
                      lineJoin: 'round'
                    }} 
                  />
                  <Polyline 
                    positions={positions} 
                    pathOptions={{ 
                      color: i % 2 === 0 ? '#0891B2' : '#F59E0B', 
                      weight: 5,
                      lineCap: 'round',
                      lineJoin: 'round',
                      opacity: 1,
                      dashArray: leg.geometry ? undefined : '10, 10'
                    }} 
                  />
                  {/* Invisible wide polyline for easier clicks */}
                  <Polyline 
                    positions={positions} 
                    pathOptions={{ 
                      color: 'transparent',
                      weight: 20
                    }}
                    eventHandlers={{
                      click: (e) => {
                        L.DomEvent.stopPropagation(e);
                        handleMarkerClick(leg.from, fromCoord);
                      }
                    }}
                  />
                </Fragment>
              );
            })}
          </Fragment>
        ) : null}
      </MapContainer>
    </div>
  );
});

export default Map;

