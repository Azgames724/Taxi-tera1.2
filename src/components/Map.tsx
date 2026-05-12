/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, Fragment, memo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';
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
}

function MapUpdater({ center, zoom, activePath, panelOpen }: { center: [number, number], zoom: number, activePath: any, panelOpen: boolean }) {
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
    }
  }, [activePath, map]);

  return null;
}

const userIcon = L.divIcon({
  html: '<div class="user-dot"></div>',
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const minibusIcon = L.divIcon({
  html: `
    <div style="background: #0891B2; width: 34px; height: 34px; border-radius: 50% 50% 50% 5px; transform: rotate(-45deg); border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.2);">
      <span style="transform: rotate(45deg); display: block; font-size: 16px;">🚌</span>
    </div>
  `,
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 34]
});

const routeIcon = L.divIcon({
  html: `
    <div style="background: #F59E0B; width: 32px; height: 32px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: bounce 1s infinite alternate;">
      <span style="font-size: 16px;">🚕</span>
    </div>
  `,
  className: '',
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

const mapStyles = `
  @keyframes bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-4px); }
  }
`;

const Map = memo(({ center, zoom, userLocation, activePath, onStationClick, lang, panelOpen }: MapProps) => {
  const locations = useMemo(() => Object.entries(COORDS), []);

  const handleMarkerClick = useMemo(() => (name: string, pos: [number, number]) => {
    onStationClick(name);
  }, [onStationClick]);

  return (
    <div className="w-full h-full relative z-0">
      <style>{mapStyles}</style>
      <MapContainer 
        center={center} 
        zoom={zoom} 
        scrollWheelZoom={true} 
        zoomControl={false}
        preferCanvas={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; Voyager'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          updateWhenIdle={true}
          keepBuffer={2}
          opacity={1.0}
        />
        <MapUpdater center={center} zoom={zoom} activePath={activePath} panelOpen={panelOpen} />
        
        {userLocation && (
          <Marker position={userLocation} icon={userIcon} zIndexOffset={3000} />
        )}

        <MarkerClusterGroup
          maxClusterRadius={40}
          disableClusteringAtZoom={14}
          showCoverageOnHover={false}
        >
          {locations.map(([name, pos]) => (
            <Marker 
              key={`loc-${name}`}
              position={pos} 
              icon={minibusIcon}
              eventHandlers={{ click: () => handleMarkerClick(name, pos) }}
            />
          ))}
        </MarkerClusterGroup>

        {/* Route visualization for the active path */}
        {activePath ? (
          <Fragment key={`active-path-${activePath.legs.length}-${activePath.legs.map(l => l.from).join('-')}`}>
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
                    icon={routeIcon} 
                    zIndexOffset={4000 + i}
                  />
                  {i === activePath.legs.length - 1 && (
                    <Marker 
                      position={toCoord} 
                      icon={routeIcon} 
                      zIndexOffset={4000 + i + 1}
                    />
                  )}
                  {/* Glow effect for road path */}
                  <Polyline 
                    positions={positions} 
                    pathOptions={{ 
                      color: 'white', 
                      weight: 12,
                      opacity: 0.5,
                      lineCap: 'round'
                    }} 
                  />
                  <Polyline 
                    positions={positions} 
                    pathOptions={{ 
                      color: i % 2 === 0 ? '#0891B2' : '#F59E0B', 
                      weight: 6,
                      lineCap: 'round',
                      opacity: 0.9,
                      dashArray: leg.geometry ? undefined : '1, 10'
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

