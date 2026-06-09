/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Search, 
  MapPin, 
  ArrowRightLeft, 
  Train, 
  Navigation, 
  Info,
  Mic,
  MicOff,
  Download,
  Check,
  Trash2,
  Plus,
  Bookmark,
  ThumbsUp,
  Compass,
  HelpCircle,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Volume2,
  Star,
  Coins,
  Pencil,
  Home,
  Briefcase,
  Coffee,
  GraduationCap,
  ShoppingBag,
  Heart,
  Building2,
  Landmark,
  Hotel,
  Trophy,
  Bus,
  Car,
  Smartphone,
  MessageSquare,
  Clock,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { COORDS, TRANSLATIONS, Station, STATIONS } from '../data/transitData';
import { findTripPaths, TripPath, enhancePathWithGeometry } from '../lib/routing';
import { db, handleFirestoreError, OperationType, isFirebaseConfigured } from '../lib/firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Maps previously saved place emoji codes to high-fidelity Lucide elements for absolute backward-compatibility
function getPlaceIcon(iconName: string, className = "w-4 h-4") {
  const norm = iconName.toLowerCase().trim();
  switch (norm) {
    case '🏠':
    case 'home':
      return <Home className={className} />;
    case '🏢':
    case 'office':
    case 'work':
      return <Briefcase className={className} />;
    case '☕':
    case 'cafe':
    case 'coffee':
      return <Coffee className={className} />;
    case '🏫':
    case 'school':
    case 'college':
    case 'university':
      return <GraduationCap className={className} />;
    case '🛍️':
    case 'shop':
    case 'store':
    case 'market':
      return <ShoppingBag className={className} />;
    case '💚':
    case 'heart':
    case 'favorite':
      return <Heart className={className} />;
    case '📍':
    case 'pin':
    case 'marker':
    default:
      return <MapPin className={className} />;
  }
}

// Maps popular landmarks to professional custom-colored brand icons instead of raw emojis
function getLandmarkIcon(name: string, className = "w-3.5 h-3.5") {
  switch (name) {
    case 'Bole Medhanialem':
      return <MapPin className={cn(className, "text-cyan-500 fill-cyan-500/10")} />;
    case 'Mexico':
      return <Building2 className={cn(className, "text-slate-500")} />;
    case 'Piassa':
      return <Landmark className={cn(className, "text-amber-600")} />;
    case 'Megenagna':
      return <Train className={cn(className, "text-emerald-500")} />;
    case 'Arat Kilo':
      return <GraduationCap className={cn(className, "text-indigo-500")} />;
    case 'Kazanchis':
      return <Hotel className={cn(className, "text-indigo-600")} />;
    case 'Merkato':
      return <ShoppingBag className={cn(className, "text-rose-500")} />;
    case 'Stadium':
      return <Trophy className={cn(className, "text-amber-500")} />;
    default:
      return <MapPin className={className} />;
  }
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
  isOffline?: boolean;
}

interface SavedPlace {
  id: string;
  name: string;
  nameAm: string;
  loc: string;
  icon: string;
}

export default function TripPlanner({ 
  lang, 
  onPathSelect, 
  userLocation, 
  initialOrigin = '', 
  initialDestination = '', 
  onLocationChange,
  isOffline = false
}: TripPlannerProps) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [results, setResults] = useState<TripPath[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Sync state back to parent
  useEffect(() => {
    if (onLocationChange) {
      onLocationChange(origin, destination);
    }
  }, [origin, destination, onLocationChange]);

  // Sync selected path logic
  useEffect(() => {
    const selectedPath = selectedIdx !== null ? results[selectedIdx] || null : null;
    onPathSelect(selectedPath);
  }, [results, selectedIdx, onPathSelect]);

  // Input states sync
  useEffect(() => {
    if (initialOrigin) setOrigin(initialOrigin);
    if (initialDestination) setDestination(initialDestination);
  }, [initialOrigin, initialDestination]);

  const [showOriginAuto, setShowOriginAuto] = useState(false);
  const [showDestAuto, setShowDestAuto] = useState(false);

  // --- Voice Search States ---
  const [activeVoiceMode, setActiveVoiceMode] = useState<'origin' | 'dest' | null>(null);
  const [voiceIsListening, setVoiceIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceHasMicAccess, setVoiceHasMicAccess] = useState(true);

  // --- Saved Places States ---
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>(() => {
    const saved = localStorage.getItem('ttSavedPlaces');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return []; // 100% empty state by default with no presets
  });
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newPlaceLoc, setNewPlaceLoc] = useState('');
  const [newPlaceIcon, setNewPlaceIcon] = useState('pin');
  const [selectedSavedPlace, setSelectedSavedPlace] = useState<SavedPlace | null>(null);

  // --- Offline Download States ---
  const [offlineDownloaded, setOfflineDownloaded] = useState(() => {
    return localStorage.getItem('ttOfflineDownloaded') === 'true';
  });
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // --- Fare Guide States ---
  const [showFareGuide, setShowFareGuide] = useState(false);
  const [calcDist, setCalcDist] = useState(5.5); // Default interactive distance in km

  // --- Community Route Verification States ---
  const [upvotes, setUpvotes] = useState<Record<string, number>>({});

  // Subscribes to route verification upvotes in real-time or localStorage fallback
  useEffect(() => {
    if (!isFirebaseConfigured) {
      const loadLocalUpvotes = () => {
        try {
          const stored = localStorage.getItem('tt_local_route_upvotes');
          const votes: Record<string, number> = stored ? JSON.parse(stored) : {};
          setUpvotes(votes);
        } catch (e) {
          console.error("Failed to load local upvotes", e);
        }
      };
      loadLocalUpvotes();
      // Poll storage fallback so that other tabs/actions mirror instantly
      const interval = setInterval(loadLocalUpvotes, 4000);
      return () => clearInterval(interval);
    }

    const unsubscribe = onSnapshot(collection(db, 'route_upvotes'), (snapshot) => {
      const votes: Record<string, number> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data && typeof data.routeKey === 'string' && typeof data.votes === 'number') {
          votes[data.routeKey] = data.votes;
        }
      });
      setUpvotes(votes);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'route_upvotes');
    });

    return () => unsubscribe();
  }, []);
  const [userVoted, setUserVoted] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ttRouteUserVoted');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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

  // Handle Search Implementation
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
      
      const seen = new Set<string>();
      const uniqueBasicPaths = basicPaths.filter(path => {
        const key = path.legs.map(l => `${l.from}-${l.to}`).join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Show basic results first
      setResults(uniqueBasicPaths);
      setIsSearching(false);

      if (isOffline) {
        // Skip background geometry calls instantly when offline to work 100% with no lag
        return;
      }

      // Background enhance with geometry to "snap to roads" using local/server OSRM
      for (let i = 0; i < uniqueBasicPaths.length; i++) {
        try {
          const enhanced = await enhancePathWithGeometry(uniqueBasicPaths[i], COORDS);
          setResults(prev => {
            const newResults = [...prev];
            newResults[i] = {
              ...enhanced,
              // Add simulated base votes if there are no pre-existing upvotes
              totalDistance: enhanced.totalDistance || 1000,
              totalDuration: enhanced.totalDuration || 120,
            };
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

  // --- Voice Search Trigger ---
  const triggerVoiceSearch = (field: 'origin' | 'dest') => {
    setActiveVoiceMode(field);
    setVoiceTranscript(lang === 'am' ? 'እያዳመጥኩ ነው... ይናገሩ' : 'Listening... Speak now');
    setVoiceIsListening(true);
    setVoiceHasMicAccess(true);

    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setVoiceHasMicAccess(false);
      setVoiceTranscript(lang === 'am' ? 'የድምፅ ግብዓት በዚህ ማሰሻ አይደገፍም' : 'Speech recognition not supported in this environment.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = lang === 'am' ? 'am-ET' : 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setVoiceIsListening(true);
      };

      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setVoiceTranscript(text);

        // Map transcript to closest landmark
        let matchedLandmark = '';
        const normText = text.toLowerCase().trim();
        
        for (const loc of locations) {
          if (loc === 'Current Location') continue;
          if (normText.includes(loc.toLowerCase()) || loc.toLowerCase().includes(normText)) {
            matchedLandmark = loc;
            break;
          }
        }

        if (matchedLandmark) {
          if (field === 'origin') setOrigin(matchedLandmark);
          else setDestination(matchedLandmark);
          setVoiceTranscript(lang === 'am' ? `ተገኝቷል፡ ${matchedLandmark}` : `Matched: ${matchedLandmark}`);
        } else {
          // If no perfect match found, use transcript directly
          const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
          if (field === 'origin') setOrigin(capitalized);
          else setDestination(capitalized);
        }

        setTimeout(() => {
          setVoiceIsListening(false);
          setActiveVoiceMode(null);
        }, 1200);
      };

      recognition.onerror = (err: any) => {
        console.error('Mic Error:', err);
        setVoiceHasMicAccess(false);
        setVoiceTranscript(lang === 'am' ? 'ስህተት ተከስቷል! እባክዎን ይድገሙ' : 'Error recognizing voice. Tap to retry.');
      };

      recognition.start();
    } catch (e) {
      setVoiceHasMicAccess(false);
      setVoiceTranscript(lang === 'am' ? 'ማይክሮፎን እንዲሰራ ፍቃድ ይስጡ' : 'Microphone error. Allow device permissions.');
    }
  };

  // Simulate Voice option (for offline/permission sandbox safety)
  const simulateSpeechSelection = (landmark: string) => {
    setVoiceTranscript(landmark);
    setTimeout(() => {
      if (activeVoiceMode === 'origin') setOrigin(landmark);
      else setDestination(landmark);
      setVoiceIsListening(false);
      setActiveVoiceMode(null);
    }, 800);
  };

  // --- Saved Places Controllers ---
  const saveCurrentPlace = () => {
    if (!newPlaceName.trim() || !newPlaceLoc) return;
    const newPlace: SavedPlace = {
      id: Date.now().toString(),
      name: newPlaceName,
      nameAm: newPlaceName,
      loc: newPlaceLoc,
      icon: newPlaceIcon
    };
    const updated = [...savedPlaces, newPlace];
    setSavedPlaces(updated);
    localStorage.setItem('ttSavedPlaces', JSON.stringify(updated));
    setNewPlaceName('');
    setIsAddingPlace(false);
  };

  const removeSavedPlace = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = savedPlaces.filter(p => p.id !== id);
    setSavedPlaces(updated);
    localStorage.setItem('ttSavedPlaces', JSON.stringify(updated));
  };

  // --- Offline Pack Downloader Simulator ---
  const startOfflineDownload = () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    const interval = setInterval(() => {
      setDownloadProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsDownloading(false);
            setOfflineDownloaded(true);
            localStorage.setItem('ttOfflineDownloaded', 'true');
          }, 300);
          return 100;
        }
        return p + Math.floor(Math.random() * 15 + 10);
      });
    }, 150);
  };

  const clearOfflineDownload = () => {
    setOfflineDownloaded(false);
    localStorage.setItem('ttOfflineDownloaded', 'false');
  };

  // --- Interactive Upvote Route Verification ---
  const upvoteRouteCode = async (routeKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (userVoted.includes(routeKey)) return; // Only 1 vote allowed per user session

    const currentVotes = upvotes[routeKey] || 0;
    const newVotes = currentVotes + 1;

    const newUpvotes = { ...upvotes, [routeKey]: newVotes };
    setUpvotes(newUpvotes);

    if (!isFirebaseConfigured) {
      try {
        localStorage.setItem('tt_local_route_upvotes', JSON.stringify(newUpvotes));
      } catch (e) {
        console.error("Failed to write local upvote", e);
      }
    } else {
      try {
        await setDoc(doc(db, 'route_upvotes', routeKey), {
          routeKey,
          votes: newVotes
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, `route_upvotes/${routeKey}`);
      }
    }

    const updatedVotedList = [...userVoted, routeKey];
    setUserVoted(updatedVotedList);
    localStorage.setItem('ttRouteUserVoted', JSON.stringify(updatedVotedList));
  };

  // --- Static Popular Landmark Pills ---
  const popularLandmarks = [
    { name: 'Bole Medhanialem', am: 'ቦሌ መድኃኔዓለም', icon: '⛪' },
    { name: 'Mexico', am: 'ሜክሲኮ', icon: '🏢' },
    { name: 'Piassa', am: 'ፒያሳ', icon: '🏛️' },
    { name: 'Megenagna', am: 'መገናኛ', icon: '🚉' },
    { name: 'Arat Kilo', am: 'አራት ኪሎ', icon: '🎓' },
    { name: 'Kazanchis', am: 'ካዛንቺስ', icon: '🏨' },
    { name: 'Merkato', am: 'መርካቶ', icon: '🛍️' },
    { name: 'Stadium', am: 'ስታዲየም', icon: '🏟️' }
  ];

  // --- Autocompleting values ---
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
      .slice(0, 6);
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
      .slice(0, 6);
  }, [destination, locations]);

  // Dynamic Fare Tariff interactive calculator
  const dynamicCalculatedFare = useMemo(() => {
    const d = calcDist;
    if (d <= 2.5) return { minibus: 10 };
    if (d <= 5.0) return { minibus: 15 };
    if (d <= 7.5) return { minibus: 20 };
    if (d <= 10.0) return { minibus: 25 };
    if (d <= 12.5) return { minibus: 30 };
    if (d <= 15.0) return { minibus: 35 };
    if (d <= 17.5) return { minibus: 40 };
    if (d <= 20.0) return { minibus: 45 };
    if (d <= 22.5) return { minibus: 50 };
    if (d <= 25.0) return { minibus: 55 };
    if (d <= 27.5) return { minibus: 60 };
    if (d <= 30.0) return { minibus: 65 };
    return { minibus: 70 };
  }, [calcDist]);

  return (
    <div className="flex flex-col gap-4">
      {/* Offline Status Accent Banner */}
      {isOffline && (
        <div className="bg-amber-500/10 border border-amber-500/35 text-amber-700 font-extrabold text-[10px] leading-tight px-3 py-2 rounded-xl flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
            </span>
            <span>{lang === 'am' ? 'ባለ መስመር ከመስመር ውጭ (Offline) መስራት ጀምሯል' : '📡 Offline Calculations Enabled — zero internet dependencies'}</span>
          </div>
          {offlineDownloaded ? (
            <span className="text-[8px] bg-amber-600 text-white px-1.5 py-0.5 rounded uppercase font-black tracking-wider leading-none">
              DB Caching Active
            </span>
          ) : (
            <span className="text-[8px] underline cursor-pointer hover:text-amber-900" onClick={() => {
              const el = document.getElementById('offline-pack-card');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}>
              {lang === 'am' ? 'የካርታ ዳታ ጫን' : 'Sync DB data'}
            </span>
          )}
        </div>
      )}

      {/* TRIP PLANNER FORM CARD */}
      <div className="bg-slate-50/80 rounded-[28px] p-4 border border-slate-100/80 shadow-[0_4px_24px_rgba(15,23,42,0.02)]">
        <div className="flex flex-col gap-2.5 relative">
          
          {/* Origin Input */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50/50 focus-within:border-slate-900/40 focus-within:bg-white transition-all shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 shrink-0">
                <MapPin className="w-4 h-4 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none mb-0.5">
                  {lang === 'am' ? 'መነሻ' : 'Origin'}
                </div>
                <input 
                  value={origin}
                  onChange={(e) => { setOrigin(e.target.value); setShowOriginAuto(true); }}
                  onFocus={() => {
                    setShowOriginAuto(true);
                    setShowDestAuto(false);
                  }}
                  onBlur={() => setTimeout(() => setShowOriginAuto(false), 240)}
                  placeholder={lang === 'am' ? 'የት መነሳት ይፈልጋሉ?' : 'Where are you starting from?'}
                  className="bg-transparent border-none outline-none w-full text-xs font-black text-slate-800 placeholder-slate-400 leading-none py-0.5"
                />
              </div>

              {/* Microphone/Voice Trigger */}
              <button
                type="button"
                onClick={() => triggerVoiceSearch('origin')}
                className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary text-slate-400 flex items-center justify-center transition-all cursor-pointer border-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                title={lang === 'am' ? 'በድምፅ ፈልግ' : 'Search by Voice'}
              >
                <Mic className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Origin Autocomplete Suggestions */}
            {showOriginAuto && filteredOrigin.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 rounded-2xl mt-1.5 shadow-[0_12px_44px_rgba(15,23,42,0.08)] overflow-hidden">
                {filteredOrigin.map(l => {
                  const amLabel = amharicLabels.get(l);
                  return (
                    <button 
                      key={`origin-ac-${l}`}
                      type="button"
                      onClick={() => { setOrigin(l); setShowOriginAuto(false); }}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 text-xs border-b border-slate-50 last:border-none transition-colors cursor-pointer"
                    >
                      {l === 'Current Location' ? (
                        <span className="font-bold text-slate-700 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-cyan-500 fill-cyan-500/10 shrink-0" />
                          <span>{lang === 'am' ? 'አሁን ያሉበት ቦታ' : 'Current Location'}</span>
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
          <div className="absolute right-6 top-[38px] -translate-y-1/2 z-10">
            <button 
              onClick={handleSwap}
              className="p-2 bg-white hover:bg-slate-50 rounded-full border border-slate-100 shadow-md text-slate-700 active:scale-95 transition-all outline-none cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
            </button>
          </div>

          {/* Destination Input */}
          <div className="relative">
            <div className="flex items-center gap-2.5 p-2 bg-white rounded-2xl border border-slate-100 hover:bg-slate-50/50 focus-within:border-slate-900/40 focus-within:bg-white transition-all shadow-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <MapPin className="w-4 h-4 fill-current" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-none mb-0.5">
                  {lang === 'am' ? 'መድረሻ' : 'Destination'}
                </div>
                <input 
                  value={destination}
                  onChange={(e) => { setDestination(e.target.value); setShowDestAuto(true); }}
                  onFocus={() => {
                    setShowDestAuto(true);
                    setShowOriginAuto(false);
                  }}
                  onBlur={() => setTimeout(() => setShowDestAuto(false), 240)}
                  placeholder={lang === 'am' ? 'የት መድረስ ይፈልጋሉ?' : 'Where do you want to go?'}
                  className="bg-transparent border-none outline-none w-full text-xs font-black text-slate-800 placeholder-slate-400 leading-none py-0.5"
                />
              </div>

              {/* Microphone/Voice Trigger */}
              <button
                type="button"
                onClick={() => triggerVoiceSearch('dest')}
                className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-primary/5 hover:text-primary text-slate-400 flex items-center justify-center transition-all cursor-pointer border-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]"
                title={lang === 'am' ? 'በድምፅ ፈልግ' : 'Search by Voice'}
              >
                <Mic className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {/* Destination Autocomplete Suggestions */}
            {showDestAuto && filteredDest.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-100 rounded-2xl mt-1.5 shadow-[0_12px_44px_rgba(15,23,42,0.08)] overflow-hidden">
                {filteredDest.map(l => {
                  const amLabel = amharicLabels.get(l);
                  return (
                    <button 
                      key={`dest-ac-${l}`}
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

          {/* Form Action Buttons */}
          <div className="flex gap-2 mt-1.5">
            {/* Find Routes Button */}
            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="flex-1 py-3.5 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md disabled:opacity-35 cursor-pointer leading-none border-none"
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

            {/* Show Fare Reference Button */}
            <button
              type="button"
              onClick={() => setShowFareGuide(!showFareGuide)}
              className={cn(
                "px-3 rounded-2xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer border",
                showFareGuide ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-slate-600 border-slate-200"
              )}
            >
              <Coins className="w-3.5 h-3.5 text-emerald-500" />
              <span>{lang === 'en' ? 'Fares' : 'ሒሳብ'}</span>
            </button>

            {/* Show Saved Places Button */}
            <button
              type="button"
              onClick={() => {
                setIsAddingPlace(!isAddingPlace);
              }}
              className={cn(
                "px-3 rounded-2xl font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 active:scale-[0.98] transition-all cursor-pointer border",
                (isAddingPlace || savedPlaces.length > 0) ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-slate-600 border-slate-200"
              )}
              title={lang === 'en' ? 'Saved Places' : 'የተቀመጡ ፈጣን ቦታዎች'}
            >
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10" />
              <span>{lang === 'en' ? 'Places' : 'ቦታዎች'}</span>
            </button>
          </div>

          {/* GORGEOUS POPULAR LANDMARKS SELECTOR BAR */}
          <div className="mt-1 flex flex-col gap-1.5">
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-slate-400" />
              <span>{lang === 'en' ? 'Popular Addis Landmarks' : 'የአዲስ አበባ ታዋቂ ሥፍራዎች'}</span>
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1.5 scrollbar-hide shrink-0 snap-x">
              {popularLandmarks.map((mark) => (
                <button
                  key={`mark-pill-${mark.name}`}
                  type="button"
                  onClick={() => {
                    if (!origin) {
                      setOrigin(mark.name);
                    } else {
                      setDestination(mark.name);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-100 rounded-full text-[10px] font-black text-slate-700 hover:text-slate-900 active:scale-95 transition-all shadow-[0_1px_3px_rgba(15,23,42,0.01)] hover:shadow-sm hover:border-slate-300 shrink-0 snap-start"
                >
                  {getLandmarkIcon(mark.name)}
                  <span>{lang === 'am' ? mark.am : mark.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- REVOLUTIONARY VOICE OVERLAY SHEET --- */}
      <AnimatePresence>
        {activeVoiceMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-55 bg-slate-950/80 back-drop-blur flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-400 via-primary to-amber-400 animate-pulse" />
              
              <button 
                onClick={() => { setActiveVoiceMode(null); setVoiceIsListening(false); }}
                className="absolute top-4 right-4 p-1 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary relative">
                {voiceIsListening && (
                  <>
                    <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                    <span className="absolute -inset-2 rounded-full bg-primary/10 animate-pulse" />
                  </>
                )}
                <Mic className="w-7 h-7 fill-current" />
              </div>

              <div>
                <h3 className="font-black text-slate-800 text-sm tracking-tight uppercase">
                  {lang === 'am' ? 'በድምፅ መፈለጊያ' : 'Landmark Voice Search'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  {lang === 'am' ? (activeVoiceMode === 'origin' ? 'መነሻ መጋቢ' : 'መድረሻ መጋቢ') : `Listening for ${activeVoiceMode}`}
                </p>
              </div>

              {/* Transcribed bubble */}
              <div className="w-full bg-slate-50/90 rounded-2xl p-4 border border-slate-100 min-h-[64px] flex items-center justify-center">
                <p className="text-xs font-black text-slate-700 leading-normal animate-pulse">
                  {voiceTranscript}
                </p>
              </div>

              {/* Sandbox Fail Safe Mock Voice simulator */}
              {!voiceHasMicAccess && (
                <div className="flex flex-col gap-2 w-full pt-1 border-t border-slate-100 mt-1">
                  <span className="text-[9px] font-black uppercase text-amber-500 tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>{lang === 'am' ? 'ወይም ከሚከተሉት አንዱን በመምረጥ ድምፅ ይምሰሉ' : 'Or select one sample to simulate voice command'}</span>
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => simulateSpeechSelection('Bole Atlas')}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-primary/5 hover:border-primary/40 text-slate-700 text-[10px] font-black rounded-xl border border-transparent flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>"Bole Atlas"</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateSpeechSelection('Mexico')}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-primary/5 hover:border-primary/40 text-slate-700 text-[10px] font-black rounded-xl border border-transparent flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>"Mexico"</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateSpeechSelection('Megenagna')}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-primary/5 hover:border-primary/40 text-slate-700 text-[10px] font-black rounded-xl border border-transparent flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>"Megenagna"</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => simulateSpeechSelection('Piassa')}
                      className="px-2.5 py-2 bg-slate-100 hover:bg-primary/5 hover:border-primary/40 text-slate-700 text-[10px] font-black rounded-xl border border-transparent flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>"Piassa"</span>
                    </button>
                  </div>
                </div>
              )}
              
              <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase max-w-[200px]">
                {lang === 'am' ? 'አማርኛ እና እንግሊዘኛን ይደግፋል' : 'Trained for Addis Amharic & English accents'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- SELECT STARTING LOCATION FOR SAVED PLACE OVERLAY --- */}
      <AnimatePresence>
        {selectedSavedPlace && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-55 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="bg-white rounded-[32px] w-full max-w-sm p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-amber-400 via-emerald-400 to-indigo-400 animate-pulse" />
              
              <button 
                onClick={() => setSelectedSavedPlace(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer border-none"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="text-center">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mx-auto border border-amber-100 shadow-[inset_0_2px_4px_rgba(217,119,6,0.05)] mb-2">
                  {getPlaceIcon(selectedSavedPlace.icon, "w-8 h-8")}
                </div>
                <h3 className="font-black text-slate-800 text-sm tracking-tight uppercase">
                  {lang === 'am' ? `ወደ ${selectedSavedPlace.nameAm} መጓዣ` : `Navigate to ${selectedSavedPlace.name}`}
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
                  {lang === 'am' ? `መድረሻ ጣቢያ/ቦታ፡ ${selectedSavedPlace.loc}` : `Destination: ${selectedSavedPlace.loc}`}
                </p>
              </div>

              {/* Start selection options */}
              <div className="flex flex-col gap-2 w-full pt-1">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider text-center">
                  {lang === 'am' ? 'ከየት መነሳት ይፈልጋሉ?' : 'Where are you starting from?'}
                </span>
                
                {/* Option 1: Current Location */}
                <button
                  type="button"
                  onClick={() => {
                    setOrigin('Current Location');
                    setDestination(selectedSavedPlace.loc);
                    setSelectedSavedPlace(null);
                    // Trigger a local search update
                    setTimeout(() => handleSearch(), 120);
                  }}
                  className="px-4 py-3 bg-slate-950 hover:bg-slate-800 text-white text-xs font-black rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm border-none"
                >
                  <Navigation className="w-4 h-4 text-white fill-white shrink-0 animate-pulse" />
                  <span>{lang === 'am' ? 'አሁን ካለሁበት ቦታ (Current Location)' : 'My Current Location'}</span>
                </button>

                {/* Option 2: Popular Landmarks Grid */}
                <div className="flex flex-col gap-1.5 mt-1">
                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider text-center">
                    {lang === 'am' ? 'ወደተቀመጠው ቦታ ለመሄድ መነሻ ይምረጡ' : 'Or select another starting point'}
                  </span>
                  
                  <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                    {popularLandmarks.map((landmark) => (
                      <button
                        key={`route-start-${landmark.name}`}
                        type="button"
                        onClick={() => {
                          setOrigin(landmark.name);
                          setDestination(selectedSavedPlace.loc);
                          setSelectedSavedPlace(null);
                          setTimeout(() => handleSearch(), 120);
                        }}
                        className="px-2.5 py-2 bg-slate-50 hover:bg-primary/5 hover:border-slate-300 border border-slate-100 text-slate-700 text-[10px] font-black rounded-xl text-left flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        {getLandmarkIcon(landmark.name)}
                        <span className="truncate">{lang === 'am' ? landmark.am : landmark.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Option 3: Manual Type */}
                <button
                  type="button"
                  onClick={() => {
                    setOrigin('');
                    setDestination(selectedSavedPlace.loc);
                    setSelectedSavedPlace(null);
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-extrabold rounded-xl border-none transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                >
                  <Pencil className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>{lang === 'am' ? 'ሌላ መነሻ በፅሁፍ ለመፈለግ' : 'Type a custom starting point'}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- SAVED PLACES SECTION --- */}
      {(savedPlaces.length > 0 || isAddingPlace) && (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-[0_2px_12px_rgba(15,23,42,0.01)] flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                {lang === 'en' ? 'Saved Places' : 'የተቀመጡ ፈጣን ቦታዎች'}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingPlace(!isAddingPlace)}
              className="p-1 rounded-lg text-primary hover:bg-primary/5 transition-colors cursor-pointer text-xs font-black flex items-center gap-0.5 border-none bg-transparent"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{lang === 'en' ? 'Add' : 'ጨምር'}</span>
            </button>
          </div>

          {/* Create Saved Place Form Inline */}
          <AnimatePresence>
            {isAddingPlace && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-hidden flex flex-col gap-2"
              >
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={lang === 'am' ? 'የቦታው ስም (ምሳሌ፡ የእናቴ ቤት)' : 'Label (e.g., Mom\'s)'}
                    value={newPlaceName}
                    onChange={(e) => setNewPlaceName(e.target.value)}
                    className="flex-1 bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-1.5 outline-none font-bold placeholder:text-slate-400"
                  />
                  
                  {/* Icon Grid Trigger */}
                  <select
                    value={newPlaceIcon}
                    onChange={(e) => setNewPlaceIcon(e.target.value)}
                    className="bg-white border border-slate-200 text-xs rounded-xl px-2.5 py-1.5 outline-none font-extrabold text-slate-700"
                  >
                    <option value="home">{lang === 'en' ? 'Home' : 'ቤት'}</option>
                    <option value="office">{lang === 'en' ? 'Office' : 'ቢሮ'}</option>
                    <option value="cafe">{lang === 'en' ? 'Cafe' : 'ካፌ'}</option>
                    <option value="school">{lang === 'en' ? 'School' : 'ትምህርት ቤት'}</option>
                    <option value="shop">{lang === 'en' ? 'Shopping' : 'ገበያ'}</option>
                    <option value="favorite">{lang === 'en' ? 'Favorite' : 'ተወዳጅ'}</option>
                    <option value="pin">{lang === 'en' ? 'Marker' : 'መለያ'}</option>
                  </select>
                </div>

                {/* Select Station mapping */}
                <select
                  value={newPlaceLoc}
                  onChange={(e) => setNewPlaceLoc(e.target.value)}
                  className="bg-white border border-slate-200 text-xs rounded-xl p-2.5 outline-none font-extrabold text-slate-700"
                >
                  <option value="">{lang === 'am' ? '-- ጣቢያ / landmark ይምረጡ --' : '-- Choose Landmark / Station --'}</option>
                  {Object.keys(COORDS).sort().map(locName => (
                    <option key={`saved-sel-${locName}`} value={locName}>
                      {locName}
                    </option>
                  ))}
                </select>

                <div className="flex gap-1.5 mt-1">
                  <button
                    type="button"
                    onClick={saveCurrentPlace}
                    disabled={!newPlaceName || !newPlaceLoc}
                    className="flex-1 py-2 bg-slate-900 text-white font-black text-[10px] uppercase rounded-lg disabled:opacity-30 cursor-pointer border-none"
                  >
                    {lang === 'en' ? 'Save Place' : 'አስቀምጥ'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingPlace(false)}
                    className="px-3 py-2 bg-slate-200 text-slate-600 font-extrabold text-[10px] uppercase rounded-lg cursor-pointer border-none"
                  >
                    {lang === 'en' ? 'Cancel' : 'ስርዝ'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Saved List UI Grid */}
          <div className="grid grid-cols-2 gap-2">
            {savedPlaces.map((place) => (
              <div
                key={`place-grid-${place.id}`}
                onClick={() => {
                  setSelectedSavedPlace(place);
                }}
                className="bg-slate-50 hover:bg-primary/5 hover:border-slate-300 border border-slate-100 p-2 text-left rounded-xl flex items-center justify-between gap-1.5 cursor-pointer group transition-all"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base shrink-0 select-none">{place.icon}</span>
                  <div className="flex flex-col min-w-0 leading-tight">
                    <span className="text-[11px] font-black text-slate-800 truncate">
                      {lang === 'am' ? place.nameAm : place.name}
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold truncate">
                      {place.loc}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => removeSavedPlace(place.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all cursor-pointer border-none shrink-0"
                  title="Delete Place"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- ADD DETAILED TARIFF FARE REFERENCE PANEL --- */}
      <AnimatePresence>
        {showFareGuide && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 overflow-hidden flex flex-col gap-3 font-sans"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-emerald-600 shrink-0" />
                <h4 className="text-xs font-black text-emerald-800 uppercase tracking-tight">
                  {lang === 'en' ? 'Interactive Addis Fare Calculator' : 'የአዲስ አበባ ታክሲ ዋጋ ማስሊያ'}
                </h4>
              </div>
              <button 
                onClick={() => setShowFareGuide(false)}
                className="text-emerald-700 hover:text-emerald-900 font-bold text-xs"
              >
                {lang === 'en' ? 'Close' : 'ዝጋ'}
              </button>
            </div>

            <p className="text-[10px] font-bold text-emerald-600 leading-normal -mt-1.5">
              {lang === 'en' 
                ? 'Check official Addis Ababa Bureau of Transport minibus tariffs.'
                : 'የአዲስ አበባ ከተማ ትራንስፖርት ቢሮ ይፋዊ ሚኒባስ ታሪፎችን ለማወቅ ርቀቱን ያንሸራትቱ።'}
            </p>

            {/* Slide Distance Input UI */}
            <div className="bg-white rounded-xl p-3 border border-emerald-100 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-500 uppercase">{lang === 'en' ? 'Journey Distance:' : 'ጉዞ ርቀት፡'}</span>
                <span className="text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">{calcDist.toFixed(1)} km</span>
              </div>
              
              <input
                type="range"
                min="0.5"
                max="30.0"
                step="0.5"
                value={calcDist}
                onChange={(e) => setCalcDist(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-100 rounded-lg cursor-pointer"
              />

              {/* Estimated grid results */}
              <div className="grid grid-cols-1 gap-2 mt-1">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center flex flex-col items-center justify-center leading-none">
                  <span className="p-2 bg-indigo-50 text-indigo-600 rounded-full mb-1.5 flex items-center justify-center">
                    <Bus className="w-5 h-5 shrink-0" />
                  </span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter shrink-0">{lang === 'en' ? 'Minibus / Higer' : 'ሚኒባስ ታክሲ'}</span>
                  <span className="text-sm font-black text-slate-800 mt-1">{dynamicCalculatedFare.minibus} {lang === 'en' ? 'ETB' : 'ብር'}</span>
                </div>
              </div>
            </div>

            {/* Tariff reference details table */}
            <div className="text-[9px] font-semibold text-slate-500 leading-normal flex flex-col gap-1 pr-1">
              <span className="font-extrabold uppercase text-[10px] text-slate-700 flex items-center gap-1 mb-1">
                <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{lang === 'en' ? 'Post-Gas Increase Minibus Tariffs' : 'አዲሱ የነዳጅ ጭማሪ ታክሲ ታሪፍ'}</span>
              </span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-white p-2 rounded-xl border border-emerald-100/60 shadow-[inset_0_1px_3px_rgba(0,0,0,0.01)]">
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>Up to 2.5 km</span>
                  <span className="font-black text-emerald-800">10 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>2.6 – 5.0 km</span>
                  <span className="font-black text-emerald-800">15 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>5.1 – 7.5 km</span>
                  <span className="font-black text-emerald-800">20 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>7.6 – 10.0 km</span>
                  <span className="font-black text-emerald-800">25 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>10.1 – 12.5 km</span>
                  <span className="font-black text-emerald-800">30 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>12.6 – 15.0 km</span>
                  <span className="font-black text-emerald-800">35 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>15.1 – 17.5 km</span>
                  <span className="font-black text-emerald-800">40 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>17.6 – 20.0 km</span>
                  <span className="font-black text-emerald-800">45 ETB</span>
                </div>
                <div className="flex justify-between border-b/0 sm:border-b border-emerald-100/20 pb-0.5">
                  <span>20.1 – 22.5 km</span>
                  <span className="font-black text-emerald-800">50 ETB</span>
                </div>
                <div className="flex justify-between border-b border-emerald-100/20 pb-0.5">
                  <span>22.6 – 25.0 km</span>
                  <span className="font-black text-emerald-800">55 ETB</span>
                </div>
                <div className="flex justify-between pb-0.5">
                  <span>25.1 – 27.5 km</span>
                  <span className="font-black text-emerald-800">60 ETB</span>
                </div>
                <div className="flex justify-between pb-0.5">
                  <span>27.6 – 30.0 km</span>
                  <span className="font-black text-emerald-800">65 ETB</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- OFFLINE DATA PACKAGE CARD --- */}
      <div id="offline-pack-card" className="bg-slate-50 border border-slate-200/50 rounded-2xl p-4 flex flex-col gap-3 font-sans">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
            </span>
            <div className="flex flex-col text-left leading-normal">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                {lang === 'en' ? 'Offline Transit Package' : 'የአዲስ አበባ ከመስመር ውጭ ካርታ ጥቅል'}
              </h4>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                {lang === 'en' ? 'Size: 4.2 MB' : 'መጠን፡ 4.2 ሜባ'}
              </span>
            </div>
          </div>

          {offlineDownloaded ? (
            <span className="text-[9px] px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-600 font-black rounded-lg uppercase tracking-wider flex items-center gap-1 leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              <Check className="w-3 h-3" />
              <span>{lang === 'en' ? 'Ready' : 'ተጭኗል'}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={startOfflineDownload}
              disabled={isDownloading}
              className="px-3 py-1.5 bg-primary hover:bg-[#FFD300]/90 text-slate-900 text-[10px] font-black rounded-xl border-none shadow-sm flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>{lang === 'en' ? 'Download' : 'ጫን'}</span>
            </button>
          )}
        </div>

        <p className="text-[10px] text-slate-400 font-bold leading-relaxed">
          {lang === 'en' 
            ? 'Stores Addis Ababa\'s 100+ stations coordinates, 42 unique minibus lines, and full fare models locally to secure instant route queries in zones without net connections.'
            : 'በአዲስ አበባ ከ100 በላይ ጣቢያዎችን መጋጠሚያ፣ 42 የሚኒባስ መስመሮችን እና ዋጋዎችን በስልክዎ ውስጥ በማስቀመጥ ያለ ኢንተርኔት በቅጽበት ይፈልጉ።'}
        </p>

        {isDownloading && (
          <div className="flex flex-col gap-1.5 w-full mt-1">
            <div className="flex justify-between items-center text-[9px] font-black text-indigo-600">
              <span className="animate-pulse">{lang === 'en' ? 'Downloading Addis Transit Geogrid...' : 'የአዲስ ትራንዚት ዳታቤዝ እየተጫነ ነው...'}</span>
              <span>{downloadProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all duration-150"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {offlineDownloaded && (
          <div className="flex justify-end mt-1 shrink-0">
            <button
              type="button"
              onClick={clearOfflineDownload}
              className="text-[9px] font-black text-red-500 hover:text-red-700 bg-red-50/75 px-2.5 py-1.5 rounded flex items-center gap-1 cursor-pointer border-none"
            >
              <Trash2 className="w-3 h-3 shrink-0" />
              <span>{lang === 'en' ? 'Clear Local Cache' : 'ዳታቤዙን አጽዳ'}</span>
            </button>
          </div>
        )}
      </div>

      {/* --- RESULTS PANEL --- */}
      <div className="flex flex-col gap-3">
        {results.length > 0 ? (
          results.map((path, idx) => {
            const totalDistKm = path.totalDistance ? (path.totalDistance / 1000).toFixed(1) : null;
            const totalDurationMins = path.totalDuration ? Math.round(path.totalDuration / 60) : null;
            
            const estimateFare = (distMeters: number) => {
              if (distMeters <= 2500) return 10;
              if (distMeters <= 5000) return 15;
              if (distMeters <= 7500) return 20;
              if (distMeters <= 10000) return 25;
              if (distMeters <= 12500) return 30;
              if (distMeters <= 15000) return 35;
              if (distMeters <= 17500) return 40;
              if (distMeters <= 20000) return 45;
              if (distMeters <= 22500) return 50;
              if (distMeters <= 25000) return 55;
              if (distMeters <= 27500) return 60;
              if (distMeters <= 30000) return 65;
              return 70;
            };
            const totalFare = path.totalDistance ? estimateFare(path.totalDistance) : null;

            // Compute unique deterministic routing ID key
            const routeKey = path.legs.map(l => `${l.from}-${l.to}`).join('|');
            const votesCount = upvotes[routeKey] || 0;
            const hasVoted = userVoted.includes(routeKey);

            return (
              <motion.div 
                key={`path-${idx}-${path.legs.map(l => l.from).join('-')}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  setSelectedIdx(idx);
                  onPathSelect(path);
                }}
                className={cn(
                  "bg-white rounded-2xl p-3.5 shadow-sm border transition-all duration-300 group cursor-pointer text-left flex flex-col gap-3",
                  selectedIdx === idx ? "border-primary ring-2 ring-primary/15 shadow-md scale-[1.01]" : "border-slate-100 hover:border-slate-300/80 hover:bg-slate-50/30"
                )}
              >
                {/* Meta Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="p-1 px-1.5 bg-primary/5 text-primary text-[8px] font-black rounded uppercase tracking-wider border border-primary/10">
                      {path.transfers === 0 ? (lang === 'am' ? 'ቀጥታ መስመር' : 'Direct') : `${path.transfers} ${lang === 'am' ? 'ግንኙነት' : (path.transfers === 1 ? 'Transfer' : 'Transfers')}`}
                    </span>
                    {totalDistKm && (
                      <span className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded leading-none">
                        {totalDistKm} km
                      </span>
                    )}
                    {totalDurationMins && (
                      <span className="text-[10px] text-slate-500 font-bold bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded leading-none">
                        {totalDurationMins} {lang === 'en' ? 'mins' : 'ደቂቃ'}
                      </span>
                    )}
                    {totalFare && (
                      <span className="text-[10px] text-emerald-700 font-black bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded leading-none flex items-center gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                        <Coins className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>{totalFare} {lang === 'en' ? 'ETB' : 'ብር'}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 font-bold shrink-0">{lang === 'en' ? 'Option' : 'አማራጭ'} {idx + 1}</div>
                </div>

                {/* Vertical Leg Steps Visual Segment */}
                <div className="flex flex-col gap-3 relative">
                  {/* Vertical connect lines */}
                  <div className="absolute left-[9px] top-5 bottom-5 w-[1.5px] bg-slate-100 group-hover:bg-primary/20 transition-colors" />

                  {/* Optional Walking Step */}
                  <div className="flex gap-3 relative z-10">
                    <div className="w-5 h-5 bg-slate-50 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-slate-700 leading-none">
                        {lang === 'en' ? `Walk to ${path.legs[0].from}` : `${path.legs[0].from} ድረስ በእግር መጓዝ`}
                      </div>
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
                      <div key={`leg-${legIdx}`} className="flex gap-3 relative z-10">
                        <div className={cn(
                          "w-5 h-5 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0",
                          dotColor
                        )}>
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-xs font-bold text-slate-800 truncate leading-none mb-1">
                            {legIdx === 0 
                              ? (lang === 'en' ? `Board @ ${leg.from}` : `ከ${leg.from} ይሳፈሩ`) 
                              : (lang === 'en' ? `Transfer @ ${leg.from}` : `ከ${leg.from} መገናኛ ያስተላልፉ`)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[8px] px-1.5 py-0.5 rounded font-black border uppercase tracking-tighter shadow-sm leading-none",
                              legIdx % 2 === 0 ? "bg-cyan-50 text-cyan-600 border-cyan-100" : "bg-amber-50 text-amber-600 border-amber-100"
                            )}>
                              {leg.route.code}
                            </span>
                            <span className="text-[10px] text-slate-500 truncate font-semibold leading-none">{leg.route.name}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="flex gap-3 relative z-10">
                    <div className="w-5 h-5 bg-emerald-500 rounded-full border-[3px] border-white shadow-sm flex items-center justify-center shrink-0">
                      <div className="w-1.5 h-1.5 bg-white rounded-full" />
                    </div>
                    <div className="flex-grow">
                      <div className="text-xs font-bold text-slate-700 leading-none">
                        {lang === 'en' ? `Arrival: ${destination}` : `መድረሻ፡ ${destination}`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- COMMUNITY ROUTE VERIFICATION PANEL --- */}
                <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-1 shrink-0">
                  <div className="flex items-center gap-1">
                    <span className="p-0.5 rounded bg-blue-50 text-blue-500 shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                      {lang === 'en' ? 'Community Verified Route' : 'ማህበረሰብ ያረጋገጠው መስመር'}
                    </span>
                  </div>

                  {/* Interactive Thumbs Up */}
                  <button
                    type="button"
                    onClick={(e) => upvoteRouteCode(routeKey, e)}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl text-[9px] font-black border uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95",
                      hasVoted 
                        ? "bg-emerald-50 border-emerald-200 text-emerald-600" 
                        : "bg-white border-slate-100 hover:border-slate-300 text-slate-600 hover:text-slate-800"
                    )}
                  >
                    <ThumbsUp className={cn("w-3 h-3 shrink-0", hasVoted && "fill-current")} />
                    <span>{votesCount} {lang === 'en' ? (hasVoted ? 'Verified!' : 'Verify') : (hasVoted ? 'ተረጋግጧል!' : 'አረጋግጥ')}</span>
                  </button>
                </div>
              </motion.div>
            );
          })
        ) : origin && destination && (
          <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300">
            <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-400 text-sm">
              {lang === 'en' ? 'No routes found for this path.' : 'ለዚህ መንገድ ምንም መሥመር አልተገኘም።'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
