/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, ArrowRightLeft, Train, Navigation, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { COORDS, TRANSLATIONS, Station, STATIONS } from '../data/transitData';
import { findTripPaths, TripPath, enhancePathWithGeometry } from '../lib/routing';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Robust fuzzy score calculation for typotolerance
function getFuzzyMatchScore(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();

  if (!q) return -1;
  
  // Exact match gets highest priority
  if (c === q) return 1000;

  // Prefix match gets high priority
  if (c.startsWith(q)) return 800 + q.length * 10;

  // Word prefix match: e.g., "bole" in "Bole Bridge" or "Bole Medhanialem"
  const words = c.split(/[\s()\-]+/);
  for (let i = 0; i < words.length; i++) {
    if (words[i].startsWith(q)) {
      return 600 + q.length * 5 - i; // prefer earlier words
    }
  }

  // General substring includes
  if (c.includes(q)) return 400 + q.length * 2;

  // Fuzzy matching for typos (e.g. mexco -> mexico, megnagna -> megenagna)
  const cleanStr = (str: string) => str.replace(/[^a-z0-9]/g, '');
  const qClean = cleanStr(q);
  const cClean = cleanStr(c);

  // If query is too short, don't allow broad distance matches
  if (qClean.length < 3) return -1;

  // Levenshtein distance using highly-optimized typed arrays to avoid memory allocations in render loop
  const lenQ = qClean.length;
  const lenC = cClean.length;
  let prevRow = new Int32Array(lenC + 1);
  let currRow = new Int32Array(lenC + 1);

  for (let i = 0; i <= lenC; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= lenQ; j++) {
    currRow[0] = j;
    const qChar = qClean[j - 1];
    for (let i = 1; i <= lenC; i++) {
      const indicator = cClean[i - 1] === qChar ? 0 : 1;
      currRow[i] = Math.min(
        prevRow[i] + 1, // deletion
        currRow[i - 1] + 1, // insertion
        prevRow[i - 1] + indicator // substitution
      );
    }
    // Swap rows
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const distance = prevRow[lenC];
  
  const maxLength = Math.max(lenC, lenQ);
  const similarityScore = maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100;

  // Letter matching in sequence
  let qIdx = 0;
  let matchesInSequence = 0;
  for (let cIdx = 0; cIdx < lenC && qIdx < lenQ; cIdx++) {
    if (cClean[cIdx] === qClean[qIdx]) {
      matchesInSequence++;
      qIdx++;
    }
  }
  
  const seqRatio = matchesInSequence / lenQ;
  const firstLetterBonus = qClean[0] === cClean[0] ? 1.2 : 0.8;
  const combinedFuzzy = (similarityScore * 0.4 + seqRatio * 60) * firstLetterBonus;

  // Score threshold for considering it a "similar" word
  const threshold = lenQ <= 3 ? 75 : lenQ <= 5 ? 62 : 52;
  
  if (combinedFuzzy >= threshold) {
    return 100 + combinedFuzzy;
  }

  return -1;
}

interface TripPlannerProps {
  lang: 'en' | 'am';
  onPathSelect: (path: TripPath | null) => void;
  userLocation: [number, number] | null;
  initialOrigin?: string;
  initialDestination?: string;
  onLocationChange?: (origin: string, destination: string) => void;
}

export default function TripPlanner({ lang, onPathSelect, userLocation, initialOrigin = '', initialDestination = '', onLocationChange }: TripPlannerProps) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [results, setResults] = useState<TripPath[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (onLocationChange) {
      onLocationChange(origin, destination);
    }
  }, [origin, destination, onLocationChange]);

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

  const amharicLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const name of locations) {
      if (name === 'Current Location') continue;
      const matched = STATIONS.find(s => 
        s.name.toLowerCase().includes(name.toLowerCase()) || 
        s.addr.toLowerCase().includes(name.toLowerCase())
      );
      if (matched) {
        map.set(name, matched.am.split(' ')[0]);
      }
    }
    return map;
  }, [locations]);

  const [walkingLeg, setWalkingLeg] = useState<{ distance: number; duration: number } | null>(null);

  const filteredOrigin = useMemo(() => {
    if (!origin.trim()) {
      return locations.slice(0, 5);
    }
    const q = origin.toLowerCase().trim();
    const isQueryAmharic = /[\u1200-\u137F]/.test(q);

    return locations
      .map(name => {
        if (name === 'Current Location') {
          const isMatch = 'current location'.includes(q) || 'አሁን'.includes(q) || 'አሁን ያሉበት ቦታ'.includes(q);
          return { name, score: isMatch ? 2000 : -1 };
        }

        // Check if Amharic query matches this candidate's station
        if (isQueryAmharic) {
          const assocStations = STATIONS.filter(s => 
            s.name.toLowerCase().includes(name.toLowerCase()) || 
            s.addr.toLowerCase().includes(name.toLowerCase())
          );
          const amMatch = assocStations.some(s => 
            s.am.includes(origin.trim()) || s.addrAm.includes(origin.trim())
          );
          if (amMatch) {
            return { name, score: 900 };
          }
        }

        const score = getFuzzyMatchScore(origin, name);
        return { name, score };
      })
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.name)
      .slice(0, 5);
  }, [origin, locations]);

  const filteredDest = useMemo(() => {
    if (!destination.trim()) {
      return locations.filter(l => l !== 'Current Location').slice(0, 5);
    }
    const q = destination.toLowerCase().trim();
    const isQueryAmharic = /[\u1200-\u137F]/.test(q);

    return locations
      .map(name => {
        if (name === 'Current Location') {
          return { name, score: -1 };
        }

        // Check if Amharic query matches this candidate's station
        if (isQueryAmharic) {
          const assocStations = STATIONS.filter(s => 
            s.name.toLowerCase().includes(name.toLowerCase()) || 
            s.addr.toLowerCase().includes(name.toLowerCase())
          );
          const amMatch = assocStations.some(s => 
            s.am.includes(destination.trim()) || s.addrAm.includes(destination.trim())
          );
          if (amMatch) {
            return { name, score: 900 };
          }
        }

        const score = getFuzzyMatchScore(destination, name);
        return { name, score };
      })
      .filter(item => item.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.name)
      .slice(0, 5);
  }, [destination, locations]);

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
    <div className="flex flex-col gap-4">
      <div className="bg-slate-50/80 rounded-[28px] p-4 border border-slate-100/80 shadow-[0_4px_24px_rgba(15,23,42,0.02)]">
        <div className="flex flex-col gap-3 relative">
          {/* Origin */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50/50 focus-within:border-slate-900/40 focus-within:bg-white transition-all shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 shrink-0">
                <MapPin className="w-4 h-4 fill-current" />
              </div>
              <div className="flex-1">
                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none mb-0.5">{lang === 'am' ? 'መነሻ' : 'Origin'}</div>
                <input 
                  value={origin}
                  onChange={(e) => { setOrigin(e.target.value); setShowOriginAuto(true); }}
                  onFocus={() => setShowOriginAuto(true)}
                  placeholder={lang === 'am' ? 'የት መነሳት ይፈልጋሉ?' : 'Where are you starting from?'}
                  className="bg-transparent border-none outline-none w-full text-xs font-black text-slate-800 placeholder-slate-400 leading-none py-0.5"
                />
              </div>
            </div>
            {showOriginAuto && filteredOrigin.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 rounded-2xl mt-1.5 shadow-[0_12px_44px_rgba(15,23,42,0.08)] overflow-hidden">
                {filteredOrigin.map(l => {
                  const amLabel = amharicLabels.get(l);
                  return (
                    <button 
                      key={l}
                      type="button"
                      onClick={() => { setOrigin(l); setShowOriginAuto(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs border-b border-slate-50 last:border-none transition-colors cursor-pointer"
                    >
                      {l === 'Current Location' ? (
                        <span className="font-bold text-slate-700">
                          {lang === 'am' ? '📍 አሁን ያሉበት ቦታ' : '📍 Current Location'}
                        </span>
                      ) : (
                        <div className="flex justify-between items-center w-full">
                          <span className="font-extrabold text-slate-800">{l}</span>
                          {amLabel ? (
                            <span className="text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 shrink-0">
                              {amLabel}
                            </span>
                          ) : null}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Swap Button */}
          <div className="absolute right-6 top-[40px] -translate-y-1/2 z-10">
            <button 
              onClick={handleSwap}
              className="p-2 bg-white hover:bg-slate-50 rounded-full border border-slate-100 shadow-md text-slate-700 active:scale-95 transition-all outline-none cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
            </button>
          </div>

          {/* Destination */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50/50 focus-within:border-slate-900/40 focus-within:bg-white transition-all shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <MapPin className="w-4 h-4 fill-current" />
              </div>
              <div className="flex-1">
                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none mb-0.5">{lang === 'am' ? 'መድረሻ' : 'Destination'}</div>
                <input 
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setShowDestAuto(true); }}
                  onFocus={() => setShowDestAuto(true)}
                  placeholder={lang === 'am' ? 'የት መድረስ ይፈልጋሉ?' : 'Where do you want to go?'}
                  className="bg-transparent border-none outline-none w-full text-xs font-black text-slate-800 placeholder-slate-400 leading-none py-0.5"
                />
              </div>
            </div>
            {showDestAuto && filteredDest.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 rounded-2xl mt-1.5 shadow-[0_12px_44px_rgba(15,23,42,0.08)] overflow-hidden">
                {filteredDest.map(l => {
                  const amLabel = amharicLabels.get(l);
                  return (
                    <button 
                      key={l}
                      type="button"
                      onClick={() => { setDestination(l); setShowDestAuto(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs border-b border-slate-50 last:border-none transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="font-extrabold text-slate-800">{l}</span>
                        {amLabel ? (
                          <span className="text-[9px] text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100 shrink-0">
                            {amLabel}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button 
            onClick={handleSearch}
            disabled={isSearching}
            className="w-full py-4 bg-slate-900 border border-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgba(15,23,42,0.12)] disabled:opacity-35 cursor-pointer leading-none"
          >
            {isSearching ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full"
              />
            ) : (
              <Navigation className="w-3.5 h-3.5 fill-current" />
            )}
            {isSearching 
              ? (lang === 'am' ? 'በማስላት ላይ...' : 'Calculating...') 
              : (lang === 'am' ? 'አቅጣጫዎችን ፈልግ' : 'Find Routes')}
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
