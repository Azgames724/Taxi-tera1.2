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
      uniqueBasicPaths.forEach(async (path, idx) => {
        try {
          const enhanced = await enhancePathWithGeometry(path, COORDS);
          setResults(prev => {
            const newResults = [...prev];
            newResults[idx] = enhanced;
            return newResults;
          });
        } catch (e) {
          console.error('Enhancement failed for path', idx, e);
        }
      });
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
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl p-4 shadow-soft border border-slate-200">
        <div className="flex flex-col gap-3 relative">
          {/* Origin */}
          <div className="relative">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-primary transition-colors">
              <MapPin className="w-5 h-5 text-blue-500" />
              <input 
                value={origin}
                onChange={(e) => { setOrigin(e.target.value); setShowOriginAuto(true); }}
                onFocus={() => setShowOriginAuto(true)}
                placeholder="Origin (e.g. Akaki Gebeya)"
                className="bg-transparent border-none outline-none w-full text-sm font-medium"
              />
            </div>
            {showOriginAuto && origin && filteredOrigin.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl mt-1 shadow-strong overflow-hidden">
                {filteredOrigin.map(l => (
                  <button 
                    key={l}
                    onClick={() => { setOrigin(l); setShowOriginAuto(false); }}
                    className="w-full text-left p-3 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-none"
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
            className="absolute right-8 top-1/2 -translate-y-1/2 z-10 p-2 bg-white rounded-full border border-slate-200 shadow-sm text-primary hover:scale-110 active:scale-95 transition-all"
          >
            <ArrowRightLeft className="w-4 h-4 rotate-90" />
          </button>

          {/* Destination */}
          <div className="relative">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 focus-within:border-primary transition-colors">
              <MapPin className="w-5 h-5 text-emerald-500" />
              <input 
                value={destination}
                onChange={(e) => { setDestination(e.target.value); setShowDestAuto(true); }}
                onFocus={() => setShowDestAuto(true)}
                placeholder="Destination (e.g. Bole Bridge)"
                className="bg-transparent border-none outline-none w-full text-sm font-medium"
              />
            </div>
            {showDestAuto && destination && filteredDest.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl mt-1 shadow-strong overflow-hidden">
                {filteredDest.map(l => (
                  <button 
                    key={l}
                    onClick={() => { setDestination(l); setShowDestAuto(false); }}
                    className="w-full text-left p-3 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-none"
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
            className="w-full p-3 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary-dark active:scale-[0.98] transition-all shadow-md disabled:opacity-50"
          >
            {isSearching ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <Navigation className="w-5 h-5" />
            )}
            {isSearching ? 'Calculating Road Paths...' : 'Find Routes'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex flex-col gap-3">
        {results.length > 0 ? (
          results.map((path, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => {
                setSelectedIdx(idx);
                onPathSelect(path);
              }}
              className={cn(
                "bg-white rounded-2xl p-4 shadow-soft border transition-all group cursor-pointer",
                selectedIdx === idx ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-slate-200 hover:border-primary/50"
              )}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1 px-2 bg-primary-pale text-primary text-[10px] font-bold rounded uppercase tracking-wider">
                    {path.transfers === 0 ? 'Direct' : `${path.transfers} ${path.transfers === 1 ? 'Transfer' : 'Transfers'}`}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">Alternative {idx + 1}</div>
              </div>

              <div className="flex flex-col gap-4 relative">
                {/* Visual line */}
                <div className="absolute left-[11px] top-6 bottom-6 w-[2px] bg-slate-100 group-hover:bg-primary-pale transition-colors" />

                {/* Optional Walking Step */}
                <div className="flex gap-4 relative z-10">
                  <div className="w-6 h-6 bg-slate-200 rounded-full border-4 border-white shadow-sm flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 bg-slate-400 rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800">Walk to {path.legs[0].from}</div>
                    <div className="text-[10px] text-slate-400 font-medium">Approx. 5-10 min walk</div>
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
                    <div key={legIdx} className="flex gap-4 relative z-10">
                      <div className={cn(
                        "w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center shrink-0",
                        dotColor
                      )}>
                        <div className="w-2 h-2 bg-white rounded-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">
                          {legIdx === 0 ? `Board at ${leg.from}` : `Transfer at ${leg.from}`}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-bold border",
                            legIdx % 2 === 0 ? "bg-cyan-50 text-cyan-700 border-cyan-200" : "bg-amber-50 text-amber-700 border-amber-200"
                          )}>
                            {leg.route.code}
                          </span>
                          <span className="text-xs text-slate-500 truncate">{leg.route.name}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="flex gap-4 relative z-10">
                  <div className="w-6 h-6 bg-emerald-500 rounded-full border-4 border-white shadow-sm flex items-center justify-center shrink-0">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800">Arrived at {destination}</div>
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
