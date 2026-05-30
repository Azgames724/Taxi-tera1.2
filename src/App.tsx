import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Menu, 
  Search as SearchIcon, 
  Navigation, 
  MapPin, 
  X, 
  Star, 
  Bus, 
  Clock, 
  Share2, 
  ChevronLeft,
  Info,
  Map as MapIcon,
  Route as RouteIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Map from './components/Map';
import TripPlanner from './components/TripPlanner';
import { 
  STATIONS,
  ROUTES, 
  TRANSLATIONS, 
  Station,
  Route as TransitRoute,
  COORDS
} from './data/transitData';
import { TripPath } from './lib/routing';

import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ADDIS_BOUNDS = {
  minLat: 8.82,
  maxLat: 9.12,
  minLng: 38.60,
  maxLng: 38.90
};

function isInsideAddis(lat: number, lng: number): boolean {
  return (
    lat >= ADDIS_BOUNDS.minLat &&
    lat <= ADDIS_BOUNDS.maxLat &&
    lng >= ADDIS_BOUNDS.minLng &&
    lng <= ADDIS_BOUNDS.maxLng
  );
}

const BrandEmblem = () => (
  <div className="relative flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-cyan-500 via-emerald-500 to-amber-500 rounded-[28px] p-[3px] shadow-[0_16px_36px_-6px_rgba(8,145,178,0.35)] mb-6 select-none">
    <div className="w-full h-full bg-slate-900 rounded-[25px] flex flex-col items-center justify-center relative overflow-hidden">
      {/* Abstract geometric route indicators inside the emblem */}
      <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-cyan-500/15 -translate-y-1/2" />
      <div className="absolute left-1/2 top-0 bottom-0 w-[1.5px] bg-amber-500/15 -translate-x-1/2" />
      <div className="absolute inset-2 border border-slate-800/60 rounded-[18px] pointer-events-none" />
      
      {/* Ambient background pulsing aura */}
      <div className="absolute w-10 h-10 bg-cyan-400/10 rounded-full blur-md" />
      
      <Bus className="w-8 h-8 text-cyan-400 drop-shadow-[0_2px_8px_rgba(34,211,238,0.4)] relative z-10" />
    </div>
    
    {/* Overlapping direction badge */}
    <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white rounded-full p-1.5 border-[2.5px] border-white shadow-md flex items-center justify-center">
      <Navigation className="w-3.5 h-3.5 fill-current text-white rotate-45" />
    </div>
  </div>
);

export const AVATARS = [
  { id: '1', emoji: '🦊', bg: 'bg-gradient-to-tr from-amber-500 via-orange-400 to-rose-400', label: 'Sunset Fox' },
  { id: '2', emoji: '👾', bg: 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-violet-600', label: 'Arcade Monster' },
  { id: '3', emoji: '🤖', bg: 'bg-gradient-to-tr from-cyan-400 via-sky-400 to-blue-500', label: 'Future Bot' },
  { id: '4', emoji: '🐱', bg: 'bg-gradient-to-tr from-pink-400 via-rose-400 to-red-500', label: 'Neko Pink' },
  { id: '5', emoji: '⚡', bg: 'bg-gradient-to-tr from-emerald-400 via-teal-400 to-cyan-500', label: 'Neon Spark' },
  { id: '6', emoji: '🐼', bg: 'bg-gradient-to-tr from-slate-500 via-zinc-600 to-neutral-700', label: 'Panda Noir' }
];

export default function App() {
  const [lang, setLang] = useState<'en' | 'am'>(() => {
    return (localStorage.getItem('ttLang') as 'en' | 'am') || 'en';
  });
  const [isSplash, setIsSplash] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stations' | 'trips'>('trips');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [activePath, setActivePath] = useState<TripPath | null>(null);
  const [plannerInitialState, setPlannerInitialState] = useState<{ origin?: string, dest?: string }>({});
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [plannerOrigin, setPlannerOrigin] = useState('');
  const [plannerDestination, setPlannerDestination] = useState('');

  const plannerStartCoords = useMemo<[number, number] | null>(() => {
    if (!plannerOrigin) return null;
    if (plannerOrigin === 'Current Location') {
      return userLocation;
    }
    return COORDS[plannerOrigin] || null;
  }, [plannerOrigin, userLocation]);

  const plannerEndCoords = useMemo<[number, number] | null>(() => {
    if (!plannerDestination) return null;
    return COORDS[plannerDestination] || null;
  }, [plannerDestination]);
  const [mapCenter, setMapCenter] = useState<[number, number]>([9.0222, 38.7469]);
  const [mapZoom, setMapZoom] = useState(14);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelHeight, setPanelHeight] = useState<'collapsed' | 'expanded' | 'full'>('collapsed');
  const [favorites, setFavorites] = useState<number[]>(() => {
    return JSON.parse(localStorage.getItem('ttFavs') || '[]');
  });
  const [isOffline, setIsOffline] = useState(() => {
    const forced = localStorage.getItem('forceOffline');
    if (forced !== null) {
      return forced === 'true';
    }
    return !navigator.onLine;
  });

  const toggleOffline = useCallback(() => {
    setIsOffline(prev => {
      const next = !prev;
      localStorage.setItem('forceOffline', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const [showFavsOnly, setShowFavsOnly] = useState(false);

  // User details states for onboarding and customization
  const [userName, setUserName] = useState<string>(() => {
    return localStorage.getItem('ttUserName') || '';
  });
  const [userAvatarId, setUserAvatarId] = useState<string>(() => {
    return localStorage.getItem('ttUserAvatarId') || '1';
  });
  const [isOnboarding, setIsOnboarding] = useState<boolean>(() => {
    return !localStorage.getItem('ttUserName');
  });
  const [tempNameInput, setTempNameInput] = useState('');
  const [tempAvatarId, setTempAvatarId] = useState<string>('1');
  const [isNameEditOpen, setIsNameEditOpen] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      if (localStorage.getItem('forceOffline') !== 'true') {
        setIsOffline(false);
      }
    };
    const handleOffline = () => {
      if (localStorage.getItem('forceOffline') !== 'false') {
        setIsOffline(true);
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Update state when panelOpen prop changes from external sources
  useEffect(() => {
    if (panelOpen && panelHeight === 'collapsed') {
      setPanelHeight('expanded');
    }
    if (!panelOpen && panelHeight !== 'collapsed') {
      setPanelHeight('collapsed');
    }
  }, [panelOpen]);

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const timer = setTimeout(() => setIsSplash(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem('ttLang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('ttFavs', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (isInsideAddis(lat, lng)) {
            const loc: [number, number] = [lat, lng];
            setUserLocation(loc);
            setMapCenter(loc);
          } else {
            console.warn('Geolocation outside Addis Ababa. Keeping map content locked in Addis Ababa.');
          }
        },
        () => console.warn('Location access denied')
      );
    }
  }, []);

  const filteredStations = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const list = showFavsOnly 
      ? STATIONS.filter(s => favorites.includes(s.id)) 
      : STATIONS;
    return list.filter(s => 
      s.name.toLowerCase().includes(query) || 
      s.am.includes(query) ||
      s.t.includes(query)
    );
  }, [searchQuery, showFavsOnly, favorites]);

  const filteredRoutes = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return ROUTES.filter(r => 
      r.name.toLowerCase().includes(query) || 
      r.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const handleStationClick = useCallback((s: Station | string) => {
    let station: Station;
    if (typeof s === 'string') {
      const existing = STATIONS.find(st => st.name === s || st.am === s);
      if (existing) {
        station = existing;
      } else {
        const pos = COORDS[s];
        const destinations = ROUTES.filter(r => r.from.includes(s) || s.includes(r.from)).map(r => r.to);
        station = {
          id: -1,
          name: s,
          am: s,
          t: 'minibus',
          lat: pos ? pos[0] : mapCenter[0],
          lng: pos ? pos[1] : mapCenter[1],
          addr: 'Mobile Transport Hub',
          addrAm: 'ተንቀሳቃሽ የመጓጓዣ መገናኛ',
          r: destinations.length > 0 ? Array.from(new Set(destinations)) : ['Check Local Board'],
          rat: 4.2,
          h: ['5:30–20:30', '5:30–20:30', '5:30–20:30', '5:30–20:30', '5:30–21:00', '6:00–20:00', '7:00–17:00']
        };
      }
    } else {
      station = s;
    }

    setSelectedStation(station);
    setMapCenter([station.lat, station.lng]);
    setMapZoom(16);
    // Don't fully hide, just collapse
    setPanelOpen(false);
    setPanelHeight('collapsed');
  }, [mapCenter]);

  const handleLocateMe = useCallback(() => {
    if (userLocation && isInsideAddis(userLocation[0], userLocation[1])) {
      setMapCenter(userLocation);
      setMapZoom(15);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (isInsideAddis(lat, lng)) {
          const loc: [number, number] = [lat, lng];
          setUserLocation(loc);
          setMapCenter(loc);
          setMapZoom(15);
        } else {
          // Reset view to central Addis Ababa
          setMapCenter([9.0220, 38.7523]);
          setMapZoom(14);
        }
      });
    }
  }, [userLocation]);

  const toggleFavorite = useCallback((id: number) => {
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  }, []);

  const handlePathSelect = useCallback((path: TripPath | null) => {
    setActivePath(path);
    if (path && path.legs.length > 0) {
      const start = COORDS[path.legs[0].from];
      if (start) {
        setMapCenter(start);
        setMapZoom(15);
      }
    }
  }, []);

  if (isSplash) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50/95 flex flex-col items-center justify-center p-6 font-sans select-none overflow-hidden">
        {/* Dynamic decorative warm light background gradients */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/10 via-amber-400/5 to-transparent pointer-events-none" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm bg-white/90 backdrop-blur-xl border border-slate-200/40 rounded-[36px] p-10 shadow-[0_32px_64px_-16px_rgba(15,23,42,0.08)] flex flex-col items-center text-center relative z-10"
        >
          {/* Custom Beautiful Brand Emblem */}
          <motion.div 
            animate={{ 
              y: [0, -6, 0],
            }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
            className="flex items-center justify-center"
          >
            <BrandEmblem />
          </motion.div>
          
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mt-2">
            {lang === 'en' ? 'Taxi Tera' : 'ታክሲ ተራ'}
          </h2>
          <p className="text-cyan-600 text-[10px] font-black uppercase tracking-widest mt-2 bg-cyan-50 border border-cyan-100/50 px-3 py-1 rounded-full">
            {lang === 'en' ? 'Smart Transit Assistant' : 'ስማርት ትራንዚት ረዳት'}
          </p>
          
          <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-[260px] mt-4 mb-6">
            {lang === 'en' 
              ? 'Addis Ababa local network routes and taxi terminals — always available offline.' 
              : 'የአዲስ አበባ የአካባቢ መስመሮች እና የታክሲ መቆሚያዎች — ሁልጊዜም ከመስመር ውጭ ዝግጁ።'}
          </p>

          <div className="flex gap-2 justify-center items-center h-4">
            {[0, 1, 2].map(i => (
              <motion.div 
                key={i}
                animate={{ 
                  opacity: [0.3, 1, 0.3], 
                  scale: [0.9, 1.25, 0.9],
                  backgroundColor: ["#94a3b8", "#0891b2", "#94a3b8"]
                }}
                transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.18 }}
                className="w-2 h-2 rounded-full"
              />
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (isOnboarding) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none overflow-hidden">
        {/* Dynamic decorative warm light background gradients */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/10 via-amber-400/5 to-transparent pointer-events-none" />
        
        {/* Language selector toggle in top-right */}
        <div className="absolute top-6 right-6 flex items-center gap-2 z-50">
          <button 
            type="button"
            onClick={() => setLang(l => l === 'en' ? 'am' : 'en')}
            className="px-4 py-2 bg-white/90 backdrop-blur-md shadow-[0_4px_20px_rgba(15,23,42,0.05)] rounded-full border border-slate-200/50 font-black text-[10px] text-slate-800 hover:bg-slate-50 active:scale-95 transition-all outline-none cursor-pointer flex items-center gap-1.5"
          >
            <span>🌐</span>
            <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
          </button>
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-slate-200/50 rounded-[36px] p-8 sm:p-10 shadow-[0_32px_64px_-16px_rgba(15,23,42,0.1)] flex flex-col items-center relative z-10"
        >
          <BrandEmblem />

          <h2 className="text-xl font-black text-slate-900 tracking-tight leading-none text-center">
            {lang === 'en' ? 'Welcome to Taxi Tera' : 'እንኳን ወደ ታክሲ ተራ በደህና መጡ'}
          </h2>
          <p className="text-cyan-600 text-[10px] font-black uppercase tracking-widest mt-2.5 bg-cyan-50 border border-cyan-100/50 px-3 py-1 rounded-full text-center">
            {lang === 'en' ? 'Addis Smart Transit' : 'አዲስ ስማርት ትራንዚት'}
          </p>
          
          <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[280px] mt-3.5 mb-5 text-center">
            {lang === 'en' 
              ? 'Personalize your offline transit experience. Choose a custom avatar and enter your name.' 
              : 'የእርስዎን የእለት ተእለት ጉዞ ረዳት ያብጁ። ለመጀመር ያህል አምሳያ መርጠው ስምዎን ያስገቡ።'}
          </p>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (tempNameInput.trim()) {
                const finalName = tempNameInput.trim();
                setUserName(finalName);
                setUserAvatarId(tempAvatarId);
                localStorage.setItem('ttUserName', finalName);
                localStorage.setItem('ttUserAvatarId', tempAvatarId);
                setIsOnboarding(false);
              }
            }}
            className="w-full flex flex-col gap-4"
          >
            {/* High-end Avatar selector */}
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center justify-between w-full px-1 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {lang === 'en' ? 'Choose Avatar' : 'አምሳያ ይምረጡ'}
                </span>
                <span className="text-[9px] font-mono text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded-full border border-cyan-100">
                  {AVATARS.find(a => a.id === tempAvatarId)?.label || ''}
                </span>
              </div>
              
              <div className="grid grid-cols-6 gap-2 w-full bg-slate-50/70 p-2.5 rounded-2xl border border-slate-100">
                {AVATARS.map((avatar) => {
                  const isSelected = tempAvatarId === avatar.id;
                  return (
                    <button
                      key={avatar.id}
                      type="button"
                      onClick={() => setTempAvatarId(avatar.id)}
                      className={cn(
                        "relative w-9 h-9 rounded-xl flex items-center justify-center text-lg transition-all duration-300 transform active:scale-95 cursor-pointer border shadow-sm",
                        avatar.bg,
                        isSelected 
                          ? "border-slate-950 scale-110 ring-[3px] ring-slate-950/15 z-10" 
                          : "border-slate-200/40 opacity-70 hover:opacity-100 hover:scale-105"
                      )}
                      title={avatar.label}
                    >
                      <span>{avatar.emoji}</span>
                      {/* Selected dot indicator */}
                      {isSelected && (
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-slate-950 text-white rounded-full border border-white flex items-center justify-center text-[7px] font-black">
                          ✓
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gorgeous Name Input card field */}
            <div className="w-full relative">
              <label className="block text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">
                {lang === 'en' ? 'Your Name' : 'የእርስዎ ስም'}
              </label>
              <div className="relative">
                <input 
                  type="text"
                  value={tempNameInput}
                  onChange={(e) => setTempNameInput(e.target.value)}
                  placeholder={lang === 'en' ? 'e.g., Alazar' : 'ምሳሌ፡ አልዓዛር'}
                  className="w-full bg-slate-50/90 text-slate-800 focus:text-slate-900 border border-slate-200/60 rounded-2xl pl-11 pr-5 py-4 text-xs font-bold outline-none focus:border-slate-950 focus:bg-white transition-all duration-300 shadow-[inset_0_2px_4px_rgba(15,23,42,0.01)] placeholder:text-slate-400"
                  maxLength={18}
                  required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors pointer-events-none">
                  <span className="text-sm">👋</span>
                </div>
              </div>
            </div>

            <button 
              type="submit"
              disabled={!tempNameInput.trim()}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all duration-200 shadow-md disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer mt-1"
            >
              <span>{lang === 'en' ? "Get Started" : "እንጀምር"}</span>
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col font-sans">
      {/* Premium Floating iOS-style Top Status Bar */}
      <div className="absolute top-4 left-4 right-4 z-[1000] pointer-events-none">
        <div className="max-w-md mx-auto flex flex-col gap-2.5">
          {/* Top Row: User Profile & Quick Switchers */}
          <div className="flex items-center justify-between pointer-events-auto">
            <button 
              onClick={() => {
                setTempNameInput(userName);
                setIsNameEditOpen(true);
              }}
              className="flex items-center gap-2.5 bg-white/95 backdrop-blur-md p-1.5 pr-4 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100/80 hover:bg-slate-50 transition-all pointer-events-auto cursor-pointer text-left focus:outline-none"
            >
              <div className="relative shrink-0">
                {(() => {
                  const avatar = AVATARS.find(a => a.id === userAvatarId) || AVATARS[0];
                  return (
                    <div className={cn(
                      "w-8 h-8 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-sm shrink-0",
                      avatar.bg
                    )}>
                      {avatar.emoji}
                    </div>
                  );
                })()}
                <span className={cn(
                  "absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white",
                  isOffline ? "bg-rose-500" : "bg-emerald-500"
                )} />
              </div>
              <div className="flex flex-col min-w-0 max-w-[100px]">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 truncate">Addis Ababa</span>
                <span className="text-xs font-black text-slate-800 leading-none truncate">
                  {lang === 'am' ? `ሰላም፥ ${userName || 'User'}` : `Selam, ${userName || 'User'}`}
                </span>
              </div>
            </button>

            <div className="flex gap-1.5 matches-action">
              <button 
                onClick={() => setLang(l => l === 'en' ? 'am' : 'en')}
                className="w-9 h-9 bg-white/95 backdrop-blur-md rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center font-black text-[10px] text-slate-700 active:scale-95 transition-all outline-none cursor-pointer"
              >
                {lang === 'en' ? 'AM' : 'EN'}
              </button>
              <button 
                onClick={() => setIsMenuOpen(true)}
                className="w-9 h-9 bg-white/95 backdrop-blur-md rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center text-slate-500 hover:text-primary active:scale-95 transition-all outline-none relative cursor-pointer"
              >
                <Menu className="w-4.5 h-4.5" />
                {!isOffline && (
                  <span className="absolute top-2.5 right-2.5 w-1.5 h-1.5 bg-rose-500 rounded-full border border-white" />
                )}
              </button>
            </div>
          </div>

          {/* High-fidelity Stat Pills */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide pointer-events-auto">
            <button 
              onClick={() => { setShowFavsOnly(true); setActiveTab('stations'); setPanelHeight('expanded'); setPanelOpen(true); }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm shrink-0 transition-all border",
                showFavsOnly 
                  ? "bg-amber-500 text-white border-amber-500" 
                  : "bg-white/90 backdrop-blur-sm text-slate-700 border-slate-100 hover:bg-slate-50"
              )}
            >
              ★ Favorites ({favorites.length})
            </button>
            <button 
              onClick={toggleOffline}
              title={lang === 'en' ? "Toggle Offline Mode (Low Internet)" : "የመገናኛ ሁነታን ቀይር (ደካማ ኢንተርኔት)"}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider shadow-sm shrink-0 transition-all border cursor-pointer",
                isOffline 
                  ? "bg-rose-50 text-rose-600 border-rose-100/85 hover:bg-rose-100/60 animate-pulse" 
                  : "bg-white/90 backdrop-blur-sm text-slate-700 border-slate-100 hover:bg-slate-50"
              )}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full", isOffline ? "bg-rose-500" : "bg-emerald-400 animate-pulse")} />
              {isOffline 
                ? (lang === 'en' ? 'Offline Mode' : 'ኦፍላይን ሁነታ') 
                : (lang === 'en' ? 'Online Mode' : 'ኦንላይን ሁነታ')}
            </button>
          </div>
        </div>
      </div>

      {/* Map View */}
      <div className="flex-1 relative overflow-hidden bg-slate-100">
        <Map 
          center={mapCenter}
          zoom={mapZoom}
          userLocation={userLocation}
          selectedStation={selectedStation}
          activePath={activePath}
          lang={lang}
          onStationClick={handleStationClick}
          panelOpen={panelOpen}
          isOffline={isOffline}
          plannerStart={plannerStartCoords}
          plannerEnd={plannerEndCoords}
        />

        {/* Premium Gradient Fades - transitioning cleanly from background color to map */}
        <div className="absolute top-0 inset-x-0 h-28 bg-gradient-to-b from-slate-50 via-slate-50/40 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-slate-50 via-slate-50/40 to-transparent pointer-events-none z-10" />

        {/* Floating Actions */}
        <div className="absolute bottom-32 right-4 z-40 flex flex-col gap-2">
          <button 
            onClick={handleLocateMe}
            className="w-10 h-10 bg-white/95 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-100 flex items-center justify-center text-primary group active:scale-90 transition-all cursor-pointer"
          >
            <Navigation className="w-4.5 h-4.5 group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </div>

      {/* Slide-up Bottom Panel */}
      <motion.div 
        initial={false}
        animate={{ 
          y: selectedStation ? '100%' : 0,
          height: panelHeight === 'expanded' ? '60vh' : panelHeight === 'full' ? '92vh' : '135px'
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
        drag={selectedStation ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.05}
        onDragEnd={(_, info) => {
          const velocity = info.velocity.y;
          const offset = info.offset.y;

          if (velocity > 400 || offset > 100) {
            setPanelHeight('collapsed');
            setPanelOpen(false);
          } else if (velocity < -400 || offset < -100) {
            setPanelHeight('full');
            setPanelOpen(true);
          } else if (Math.abs(offset) > 40) {
            if (offset < 0) {
              setPanelHeight(panelHeight === 'collapsed' ? 'expanded' : 'full');
              setPanelOpen(true);
            } else {
              setPanelHeight(panelHeight === 'full' ? 'expanded' : 'collapsed');
              if (panelHeight === 'expanded') setPanelOpen(false);
            }
          }
        }}
        className={cn(
          "fixed inset-x-0 bottom-0 bg-white rounded-t-[36px] shadow-[0_-8px_40px_rgba(0,0,0,0.08)] flex flex-col border-t border-slate-100 overflow-hidden",
          panelHeight === 'full' ? "z-[1050]" : "z-[50]"
        )}
      >
        {/* iOS-style slide handle */}
        <div 
          className="p-3 shrink-0 cursor-grab active:cursor-grabbing flex flex-col items-center"
          onClick={() => {
            if (panelHeight === 'collapsed') {
              setPanelHeight('expanded');
              setPanelOpen(true);
            } else {
              setPanelHeight('collapsed');
              setPanelOpen(false);
            }
          }}
        >
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Search places, areas... inside the bottom-sheet directly, mirroring exactly screen reference */}
        {activeTab === 'stations' && (
          <div className="px-4 pb-3 shrink-0">
            <div className="bg-slate-100/90 rounded-2xl p-1.5 flex items-center hover:bg-slate-200/50 transition-all border border-slate-200/5">
              <div className="pl-2.5 pr-2 text-slate-400">
                <SearchIcon className="w-4 h-4" />
              </div>
              <input 
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (panelHeight === 'collapsed') {
                    setPanelHeight('expanded');
                    setPanelOpen(true);
                  }
                }}
                onFocus={() => {
                  if (panelHeight === 'collapsed') {
                    setPanelHeight('expanded');
                    setPanelOpen(true);
                  }
                }}
                placeholder={lang === 'en' ? "Search places, areas, teras..." : "ጣቢያዎችን, አካባቢዎችን, ተራዎችን ይፈልጉ..."}
                className="bg-transparent border-none outline-none w-full text-xs font-bold text-slate-800 placeholder-slate-400 leading-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-1 px-2 text-slate-400">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-1.5 scrollbar-hide pb-36">
          <AnimatePresence mode="wait" initial={false}>
            {activeTab === 'stations' ? (
              <motion.div 
                key="stations"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-6"
              >
                {/* Major Stations (Only shown when viewing Favorites) */}
                {showFavsOnly && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <h3 className="text-base font-black text-slate-800">
                        {lang === 'en' ? 'Saved Stations' : 'የተቀመጡ ጣቢያዎች'}
                      </h3>
                    </div>
                    {filteredStations.map((s, idx) => (
                      <motion.div 
                        key={`station-${s.id}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        onClick={() => handleStationClick(s)}
                        className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50/50 transition-all cursor-pointer group"
                      >
                        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-xl shadow-sm border border-slate-100 shrink-0">
                          {s.t === 'minibus' ? '🚌' : s.t === 'bajaj' ? '🛺' : '🚗'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-800 truncate">{lang === 'am' ? s.am : s.name}</div>
                          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                            {s.addr}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-[11px] font-black text-primary">★ {s.rat}</div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(s.id); }}
                            className={cn(
                              "transition-transform active:scale-90",
                              favorites.includes(s.id) ? "text-amber-400" : "text-slate-200"
                            )}
                          >
                            <Star className={cn("w-4 h-4", favorites.includes(s.id) && "fill-current")} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    {filteredStations.length === 0 && (
                      <div className="text-center py-8 text-xs text-slate-400 font-bold">
                        {lang === 'en' ? 'No saved stations yet' : 'እስካሁን ምንም የተቀመጡ ጣቢያዎች የሉም'}
                      </div>
                    )}
                  </div>
                )}

                {/* All Routes */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-base font-black text-slate-800">{t.routes}</h3>
                  </div>
                  {filteredRoutes.slice(0, 30).map((r, idx) => (
                    <div 
                      key={`route-${idx}`}
                      onClick={() => handleStationClick(r.from)}
                      className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-100 hover:border-primary/20 hover:bg-slate-50/50 transition-all cursor-pointer group"
                    >
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-500 border border-slate-100 shrink-0 group-hover:bg-amber-100/60 group-hover:text-amber-600 group-hover:border-amber-200/50 transition-all duration-300">
                        <RouteIcon className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-800 group-hover:text-slate-900 transition-colors truncate">{r.from}</div>
                      </div>
                      <div className="text-slate-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all duration-300 pr-1 shrink-0">
                        <span className="text-base font-medium leading-none">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="trips"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <TripPlanner 
                  lang={lang} 
                  userLocation={userLocation}
                  initialOrigin={plannerInitialState.origin}
                  initialDestination={plannerInitialState.dest}
                  onPathSelect={handlePathSelect} 
                  onLocationChange={(orig, dest) => {
                    setPlannerOrigin(orig);
                    setPlannerDestination(dest);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Station Detail Modal (Bottom Sheet style) */}
      <AnimatePresence>
        {selectedStation && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedStation(null)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[2000]"
            />
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: "spring", damping: 32, stiffness: 320, mass: 0.95 }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                if (info.offset.y > 150 || info.velocity.y > 500) {
                  setSelectedStation(null);
                }
              }}
              className="fixed inset-x-0 bottom-0 z-[2001] bg-white flex flex-col rounded-t-[40px] shadow-[0_-12px_44px_rgba(15,23,42,0.12)] max-h-[85vh] overflow-hidden border-t border-slate-100/50"
            >
              {/* iOS drag handle indicator strip */}
              <div className="w-full flex justify-center pt-3 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>

              {/* Premium Header - Zero color blocks, gorgeous clean typography layout */}
              <div className="px-6 pt-3 pb-4 flex items-center justify-between shrink-0 border-b border-slate-50">
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Glowing Transport Icon Box */}
                  <div className={cn(
                    "w-12 h-12 rounded-[18px] flex items-center justify-center shadow-sm shrink-0 border border-slate-100/50",
                    selectedStation.t === 'minibus' 
                      ? "bg-cyan-50 text-cyan-600" 
                      : selectedStation.t === 'bajaj'
                        ? "bg-amber-50 text-amber-600"
                        : "bg-slate-50 text-slate-700"
                  )}>
                    {selectedStation.t === 'minibus' && <Bus className="w-5 h-5" />}
                    {selectedStation.t === 'bajaj' && <span className="text-xl leading-none">🛺</span>}
                    {selectedStation.t === 'taxi' && <RouteIcon className="w-5 h-5 text-indigo-500" />}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">
                      {selectedStation.t === 'minibus' 
                        ? (lang === 'en' ? 'Minibus Tera' : 'የሚኒባስ ተራ') 
                        : selectedStation.t === 'bajaj'
                          ? (lang === 'en' ? 'Bajaj Station' : 'የባጃጅ ጣቢያ')
                          : (lang === 'en' ? 'Taxi Station' : 'የታክሲ ጣቢያ')}
                    </span>
                    <h2 className="text-lg font-black text-slate-800 tracking-tight leading-snug truncate">
                      {lang === 'am' ? selectedStation.am : selectedStation.name}
                    </h2>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold mt-0.5 truncate">
                      <MapPin className="w-3 h-3 text-slate-300 shrink-0" />
                      <span className="truncate">{lang === 'am' ? selectedStation.addrAm : selectedStation.addr}</span>
                    </div>
                  </div>
                </div>

                {/* Top header control buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button 
                    onClick={() => toggleFavorite(selectedStation.id)}
                    className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100/80 text-slate-600 transition-colors cursor-pointer flex items-center justify-center border border-slate-100 outline-none"
                  >
                    <Star className={cn("w-4.5 h-4.5", favorites.includes(selectedStation.id) ? "fill-amber-400 text-amber-400" : "text-slate-400")} />
                  </button>
                  <button 
                    onClick={() => setSelectedStation(null)}
                    className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center border border-slate-200/10 outline-none"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Detail Content Section (Scrollable) */}
              <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
                
                {/* Micro capsules info grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50/75 rounded-2xl p-3 text-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)] border border-slate-100">
                    <div className="text-cyan-600 font-black text-xs flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-ping shrink-0" />
                      <span>{lang === 'en' ? 'Active' : 'አክቲቭ'}</span>
                    </div>
                    <div className="text-[8px] text-slate-400 font-black uppercase tracking-wider mt-1">{lang === 'en' ? 'Operational' : 'ሁኔታ'}</div>
                  </div>

                  <div className="bg-slate-50/75 rounded-2xl p-3 text-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)] border border-slate-100">
                    <div className="text-slate-800 font-extrabold text-sm leading-none">{selectedStation.r.length}</div>
                    <div className="text-[8px] text-slate-400 font-black uppercase tracking-wider mt-1.5">{lang === 'en' ? 'Direct routes' : 'ቀጥታ መንገዶች'}</div>
                  </div>

                  <div className="bg-slate-50/75 rounded-2xl p-3 text-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.01)] border border-slate-100">
                    <div className="text-amber-500 font-black text-xs flex items-center justify-center gap-0.5 leading-none">
                      <span>★</span>
                      <span>{selectedStation.rat}</span>
                    </div>
                    <div className="text-[8px] text-slate-400 font-black uppercase tracking-wider mt-1.5">{lang === 'en' ? 'Rating' : 'ደረጃ'}</div>
                  </div>
                </div>

                {/* Direct destinations */}
                <div className="mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <RouteIcon className="w-4 h-4 text-slate-400" />
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {lang === 'en' ? 'Direct Destinations' : 'ቀጥታ መዳረሻዎች'}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedStation.r.map(r => (
                      <span key={r} className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 transition-colors shadow-sm animate-in fade-in zoom-in-95 duration-150">
                        📍 {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Operating Hours */}
                <div className="mt-6 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                      {lang === 'en' ? 'Operating Hours' : 'የስራ ሰዓታት'}
                    </h3>
                  </div>
                  <div className="bg-slate-50/60 rounded-2xl border border-slate-100/70 divide-y divide-slate-100/40 overflow-hidden shadow-[inset_0_2px_4px_rgba(0,0,0,0.012)]">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                      const dayTranslation = lang === 'am' 
                        ? ['ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ', 'እሁድ'][idx] 
                        : day;
                      return (
                        <div key={day} className="flex justify-between px-4 py-3.5 text-xs font-medium">
                          <span className="font-bold text-slate-400">{dayTranslation}</span>
                          <span className="font-black text-slate-700">{selectedStation.h[idx]}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>

              {/* Persistent Sticking Action buttons at bottom margin */}
              <div className="p-4 bg-white border-t border-slate-50 shrink-0 flex gap-3 pb-8">
                <button 
                  onClick={() => {
                    setPlannerInitialState({ origin: selectedStation.name });
                    setActiveTab('trips');
                    setPanelOpen(true);
                    setSelectedStation(null);
                  }}
                  className="flex-1 py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all shadow-[0_8px_30px_rgba(15,23,42,0.12)] flex items-center justify-center gap-2 cursor-pointer leading-none"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {lang === 'en' ? 'Set as Origin' : 'መነሻ አድርግ'}
                </button>
                <button 
                  onClick={() => {
                    setPlannerInitialState({ dest: selectedStation.name });
                    setActiveTab('trips');
                    setPanelOpen(true);
                    setSelectedStation(null);
                  }}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer leading-none border border-slate-200/20"
                >
                  <Navigation className="w-3.5 h-3.5 fill-current text-slate-700" />
                  {lang === 'en' ? 'Set as Destination' : 'መድረሻ አድርግ'}
                </button>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Side Menu Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9998]"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-80 bg-white z-[9999] shadow-2xl flex flex-col p-6"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
                    <Bus className="w-6 h-6" />
                  </div>
                  <span className="font-black text-xl tracking-tighter">Taxi Tera</span>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {[
                  { icon: Bus, label: lang === 'en' ? 'Stations' : 'ጣቢያዎች', id: 'stations' },
                  { icon: Navigation, label: lang === 'en' ? 'Trip Planner' : 'ጉዞ አቅድ', id: 'trips' },
                  { icon: Star, label: lang === 'en' ? 'Favorites' : 'ተወዳጆች', id: 'favs' },
                  { icon: Info, label: lang === 'en' ? 'About App' : 'ስለ መተግበሪያው', id: 'about' }
                ].map((item) => (
                  <button 
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'stations' || item.id === 'trips') {
                        setActiveTab(item.id as any);
                        setPanelOpen(true);
                        setIsMenuOpen(false);
                      } else if (item.id === 'about') {
                        setIsAboutOpen(true);
                        setIsMenuOpen(false);
                      } else {
                        setIsMenuOpen(false);
                      }
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <item.icon className="w-5 h-5 text-slate-400 group-hover:text-primary transition-colors" />
                    <span className="font-bold text-slate-700">{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    AM
                  </div>
                  <div>
                    <div className="font-bold text-slate-800">Taxi Tera</div>
                    <div className="text-[10px] text-primary font-black uppercase tracking-wider mb-0.5">Developed by Tejo Interactives</div>
                    <div className="text-[10px] text-slate-400">v1.0.2 Beta Build</div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setLang(l => l === 'en' ? 'am' : 'en');
                    setIsMenuOpen(false);
                  }}
                  className="w-full py-3 bg-slate-100 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-200 transition-all"
                >
                  Change to {lang === 'en' ? 'Amharic' : 'English'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {isAboutOpen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[10000] p-6 flex items-center justify-center bg-slate-900/40 backdrop-blur-md"
          >
            <div className="bg-white w-full max-w-md rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
              <div className="p-8 pb-4 text-center">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Bus className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Taxi Tera</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Developed by Tejo Interactives</p>
                <p className="text-slate-400 text-sm mt-2">Addis Ababa Smart Transit</p>
              </div>
              
              <div className="flex-1 overflow-y-auto px-8 py-4 space-y-6 text-slate-600">
                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Our Mission</h3>
                  <p className="text-sm leading-relaxed">
                    Taxi Tera is designed to help commuters in Addis Ababa navigate the city's complex minibus and light rail network with ease using precise location-based routing.
                  </p>
                </section>
                
                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Real Road Data</h3>
                  <p className="text-sm leading-relaxed">
                    Unlike other apps, we calculate actual walking and driving paths using OSRM geometry, ensuring you see the exact road path, not just a straight line.
                  </p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-800 mb-2">Open Transit</h3>
                  <p className="text-sm leading-relaxed">
                    Built for the community, by the community. We aim to map every "Taxi Tera" (Taxi Hub) in the city to reduce wait times and transfer confusion.
                  </p>
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 mt-auto">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all"
                >
                  Got it!
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Name Edit Modal */}
      <AnimatePresence>
        {isNameEditOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[11000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-sm rounded-[32px] p-6 shadow-2xl border border-slate-100 flex flex-col relative pointer-events-auto"
            >
              <button 
                onClick={() => setIsNameEditOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors cursor-pointer focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center w-full">
                {(() => {
                  const avatar = AVATARS.find(a => a.id === userAvatarId) || AVATARS[0];
                  return (
                    <div className={cn(
                      "w-16 h-16 rounded-full border-2 border-white shadow-md flex items-center justify-center text-2xl mb-4 shrink-0",
                      avatar.bg
                    )}>
                      {avatar.emoji}
                    </div>
                  );
                })()}
                <h3 className="font-black text-lg text-slate-800">
                  {lang === 'en' ? 'Update Profile' : 'መገለጫዎን ያዘምኑ'}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 mb-5">
                  {lang === 'en' ? 'Change your display name and avatar' : 'በመተግበሪያው ላይ የሚታየውን ስምዎን እና ምስልዎን ይቀይሩ'}
                </p>

                {/* Avatar chooser list */}
                <div className="flex flex-col items-center w-full mb-5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    {lang === 'en' ? 'Choose Avatar' : 'ምስል ይምረጡ'}
                  </span>
                  <div className="flex gap-2 w-full justify-center overflow-x-auto pb-1 scrollbar-hide">
                    {AVATARS.map((avatar) => {
                      const isSelected = userAvatarId === avatar.id;
                      return (
                        <button
                          key={avatar.id}
                          type="button"
                          onClick={() => {
                            setUserAvatarId(avatar.id);
                            localStorage.setItem('ttUserAvatarId', avatar.id);
                          }}
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center text-base transition-all active:scale-95 cursor-pointer border-2 shadow-sm shrink-0",
                            avatar.bg,
                            isSelected ? "border-slate-800 scale-110 ring-4 ring-slate-800/10" : "border-white"
                          )}
                        >
                          {avatar.emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full mb-4">
                  <input 
                    type="text"
                    value={userName}
                    onChange={(e) => {
                      setUserName(e.target.value);
                      localStorage.setItem('ttUserName', e.target.value);
                    }}
                    placeholder={lang === 'en' ? 'Display Name' : 'የሚታይ ስም'}
                    className="w-full bg-slate-100 text-slate-800 font-bold border border-slate-200/50 rounded-xl px-4 py-3 text-sm text-center outline-none focus:border-slate-800 focus:bg-white transition-all"
                    maxLength={20}
                  />
                </div>

                <button 
                  onClick={() => setIsNameEditOpen(false)}
                  className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform cursor-pointer"
                >
                  {lang === 'en' ? 'Save Changes' : 'ለውጦችን አስቀምጥ'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Premium Bottom Tab Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-100/70 p-2 pb-5 sm:p-2.5 sm:pb-3.5 flex justify-around items-center z-[1100] shadow-[0_-4px_24px_rgba(0,0,0,0.03)] select-none">
        {[
          { id: 'trips', label: lang === 'en' ? 'Planner' : 'አቅጣጫ', icon: Navigation },
          { id: 'favs', label: lang === 'en' ? 'Favorites' : 'ተወዳጆች', icon: Star },
          { id: 'about', label: lang === 'en' ? 'About Tejo' : 'ስለ መተግበሪያው', icon: Info }
        ].map((item) => {
          const isActive = (item.id === 'trips')
            ? (activeTab === 'trips' && panelOpen)
            : (item.id === 'favs')
              ? (activeTab === 'stations' && showFavsOnly && panelOpen)
              : false;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'trips') {
                  setActiveTab('trips');
                  setPanelHeight('expanded');
                  setPanelOpen(true);
                } else if (item.id === 'favs') {
                  setShowFavsOnly(true);
                  setActiveTab('stations');
                  setPanelHeight('expanded');
                  setPanelOpen(true);
                } else if (item.id === 'about') {
                  setIsAboutOpen(true);
                }
              }}
              className="flex flex-col items-center justify-center py-1 px-4 rounded-xl transition-all cursor-pointer relative"
            >
              <item.icon className={cn(
                "w-5 h-5 mb-0.5 transition-all duration-200 active:scale-95",
                isActive ? "text-primary stroke-[2.5]" : "text-slate-400 stroke-[1.8]"
              )} />
              <span className={cn(
                "text-[9px] font-black tracking-tight transition-colors duration-150",
                isActive ? "text-primary" : "text-slate-400"
              )}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  );
}

