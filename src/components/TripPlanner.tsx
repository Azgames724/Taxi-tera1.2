/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, ArrowRightLeft, Train, Navigation, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { COORDS, TRANSLATIONS, Station } from '../data/transitData';
import { findTripPaths, TripPath, enhancePathWithGeometry } from '../lib/routing';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TripPlannerProps {
  lang: 'en' | 'am';
  onPathSelect: (path: TripPath | null) => void;
  userLocation: [number, number] | null;
  initialOrigin?: string;
  initialDestination?: string;
}

export default function TripPlanner({ lang, onPathSelect, userLocation, initialOrigin = '', initialDestination = '' }: TripPlannerProps) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [results, setResults] = useState<TripPath[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Sync selected path back to parent whenever selection or results change
  // This avoids "update during render" issues and handles background updates naturally
  useEffect(() => {
    const selectedPath = selectedIdx !== null ? results[selectedIdx] || null : null;
    onPathSelect(selectedPath);
  }, [results, selectedIdx, onPathSelect]);

  // Update when initial props change
  useEffect(() => {
    if (initialOrigin) setOrigin(initialOrigin);
    if (initialDestination) setDestination(initialDestination);
  }, [initialOrigin, initialDestination]);
  const [showOriginAuto, setShowOriginAuto] = useState(false);
  const [showDestAuto, setShowDestAuto] = useState(false);

  const t = TRANSLATIONS[lang];
  const locations = useMemo(() => ['Current Location', ...Object.keys(COORDS)], []);

  const [walkingLeg, setWalkingLeg] = useState<{ distance: number; duration: number } | null>(null);

  const filteredOrigin = useMemo(() => 
    locations.filter(l => l.toLowerCase().includes(origin.toLowerCase())).slice(0, 5),
    [origin, locations]
  );

  const filteredDest = useMemo(() => 
    locations.filter(l => l.toLowerCase().includes(destination.toLowerCase())).slice(1, 6), // Skip "Current Location" for destinatn
    [destination, locations]
  );

  const handleSearch = async () => {
    if (!origin || !destination) return;
    setIsSearching(true);
    setShowOriginAuto(false);
    setShowDestAuto(false);
    setResults([]);
    setSelectedIdx(null);
    
    try {
      let startPoint = origin.trim();
      const endPoint = destination.trim();
      
      if (startPoint === 'Current Location' && userLocation) {
        // Find nearest station from COORDS
        let nearest = '';
        let minDest = Infinity;
        
        Object.entries(COORDS).forEach(([name, pos]) => {
          const dist = Math.sqrt(Math.pow(pos[0] - userLocation[0], 2) + Math.pow(pos[1] - userLocation[1], 2));
          if (dist < minDest) {
            minDest = dist;
            nearest = name;
          }
        });
        
        if (nearest) startPoint = nearest;
      }

      const basicPaths = findTripPaths(startPoint, endPoint);
      
      // Deduplicate results: filter out paths with identical sequences of stops
      const seen = new Set<string>();
      const uniqueBasicPaths = basicPaths.filter(path => {
        const key = path.legs.map(l => `${l.from}-${l.to}`).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Show basic results first for instant feedback (straight lines)
      setResults(uniqueBasicPaths);
      setIsSearching(false); // Stop the main loading state

      // Background enhance with geometry to "snap to roads"
      // We do this sequentially to avoid hammering OSRM and causing lag
      for (let i = 0; i < uniqueBasicPaths.length; i++) {
        try {
          const enhanced = await enhancePathWithGeometry(uniqueBasicPaths[i], COORDS);
          setResults(prev => {
            const newResults = [...prev];
            newResults[i] = enhanced;
            return newResults;
          });
        } catch (e) {
          console.error('Enhancement failed for path', i, e);
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      setIsSearching(false);
    }
  };

  const handleSwap = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
    setResults([]);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl p-3 shadow-md border border-slate-200/50">
        <div className="flex flex-col gap-2 relative">
          {/* Origin */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 focus-within:border-primary transition-colors">
              <MapPin className="w-4 h-4 text-blue-500" />
              <input 
                value={origin}
                onChange={(e) => { setOrigin(e.target.value); setShowOriginAuto(true); }}
                onFocus={() => setShowOriginAuto(true)}
                placeholder="Origin"
                className="bg-transparent border-none outline-none w-full text-xs font-semibold"
              />
            </div>
            {showOriginAuto && origin && filteredOrigin.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg mt-1 shadow-xl overflow-hidden">
                {filteredOrigin.map(l => (
                  <button 
                    key={l}
                    onClick={() => { setOrigin(l); setShowOriginAuto(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100 last:border-none"
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <button 
            onClick={handleSwap}
            className="absolute right-6 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white rounded-full border border-slate-200 shadow-sm text-primary hover:scale-110 active:scale-95 transition-all"
          >
            <ArrowRightLeft className="w-3 h-3 rotate-90" />
          </button>

          {/* Destination */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200 focus-within:border-primary transition-colors">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <input 
                value={destination}
                onChange={(e) => { setDestination(e.target.value); setShowDestAuto(true); }}
                onFocus={() => setShowDestAuto(true)}
                placeholder="Destination"
                className="bg-transparent border-none outline-none w-full text-xs font-semibold"
              />
            </div>
            {showDestAuto && destination && filteredDest.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-lg mt-1 shadow-xl overflow-hidden">
                {filteredDest.map(l => (
                  <button 
                    key={l}
                    onClick={() => { setDestination(l); setShowDestAuto(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 text-[11px] font-bold border-b border-slate-100 last:border-none"
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full py-3 bg-primary text-white rounded-lg font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-dark active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
          >
            {isSearching ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <Navigation className="w-4 h-4" />
            )}
            {isSearching ? 'Calculating...' : 'Find Routes'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-3">
        {results.length > 0 ? (
          results.map((path, idx) => (
            <motion.div 
              key={`path-${idx}-${path.legs.map(l => l.from).join('-')}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                setSelectedIdx(idx);
                onPathSelect(path);
              }}
              className={cn(
                "bg-white rounded-xl p-3 shadow-sm border transition-all group cursor-pointer",
                selectedIdx === idx ? "border-primary ring-1 ring-primary/20 shadow-md" : "border-slate-100 hover:border-primary/30"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-1.5 bg-primary/5 text-primary text-[8px] font-black rounded uppercase tracking-wider">
                    {path.transfers === 0 ? 'Direct' : `${path.transfers} ${path.transfers === 1 ? 'Trans' : 'Trans'}`}
                  </span>
                </div>
                <div className="text-[9px] text-slate-400 font-bold">Route {idx + 1}</div>
              </div>

              <div className="flex flex-col gap-3 relative">
                {/* Visual line */}
                <div className="absolute left-[9px] top-5 bottom-5 w-[1.5px] bg-slate-50 group-hover:bg-primary/10 transition-colors" />

                {/* Optional Walking Step */}
                <div className="flex gap-3 relative z-10">
                  <div className="w-5 h-5 bg-slate-100 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-700">Walk to {path.legs[0].from}</div>
                  </div>
                </div>

                {path.legs.map((leg, legIdx) => {
                  const colors = [
                    'bg-cyan-500',
                    'bg-amber-500',
                    'bg-indigo-500',
                    'bg-rose-500'
                  ];
                  const dotColor = colors[legIdx % colors.length];
                  
                  return (
                    <div key={legIdx} className="flex gap-3 relative z-10">
                      <div className={cn(
                        "w-5 h-5 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0",
                        dotColor
                      )}>
                        <div className="w-1.5 h-1.5 bg-white rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {legIdx === 0 ? `Board @ ${leg.from}` : `Transfer @ ${leg.from}`}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn(
                            "text-[8px] px-1 py-0.5 rounded font-black border uppercase tracking-tighter",
                            legIdx % 2 === 0 ? "bg-cyan-50 text-cyan-600 border-cyan-100" : "bg-amber-50 text-amber-600 border-amber-100"
                          )}>
                            {leg.route.code}
                          </span>
                          <span className="text-[10px] text-slate-500 truncate font-medium">{leg.route.name}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-3 relative z-10">
                  <div className="w-5 h-5 bg-emerald-500 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0">
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-700">Arrival: {destination}</div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : origin && destination && (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">No routes found for this path.</p>
          </div>
        )}
      </div>
    </div>
  );
}
