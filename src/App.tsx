import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Route as RouteIcon,
  Heart,
  MessageSquare,
  Car,
  Flame,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import Map, { StationReport } from './components/Map';
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
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { collection, query, orderBy, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';

import { twMerge } from 'tailwind-merge';
import { clsx, type ClassValue } from 'clsx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Unified helper to render professional vehicle icons instead of prototype emojis
function getVehicleIcon(type: string, className = "w-4 h-4") {
  switch (type) {
    case 'minibus':
      return <Bus className={className} />;
    case 'car':
      return <Car className={className} />;
    default:
      return <MapPin className={className} />;
  }
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

function formatReportTime(timestamp: number, lang: 'en' | 'am'): string {
  const diff = Date.now() - timestamp;
  if (diff < 60000) {
    return lang === 'en' ? 'Just now' : 'አሁን';
  }
  const mins = Math.floor(diff / 60000);
  if (mins < 60) {
    return lang === 'en' ? `${mins}m ago` : `ከ${mins} ደቂቃ በፊት`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return lang === 'en' ? `${hours}h ago` : `ከ${hours} ሰዓት በፊት`;
  }
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const TaxiMapPin = () => (
  <motion.div 
    animate={{ 
      y: [0, -6, 0],
    }}
    transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
    className="relative w-28 h-28 flex items-center justify-center cursor-pointer select-none drop-shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
  >
    {/* High-fidelity outer glowing circle acting as route radar hub */}
    <div className="absolute inset-0 bg-slate-900 rounded-[30px] border border-slate-800 flex items-center justify-center p-4">
      <svg viewBox="0 0 100 100" className="w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none">
        {/* Curved major connector route line option 1 */}
        <path 
          d="M 22,75 C 22,40 78,60 78,25" 
          stroke="url(#routeGrad)" 
          strokeWidth="6.5" 
          strokeLinecap="round" 
        />
        {/* Dynamic dashed option route line represent alternative multi-options */}
        <path 
          d="M 22,75 C 38,40 62,60 78,25" 
          stroke="#06b6d4" 
          strokeWidth="3.5" 
          strokeDasharray="5 5" 
          strokeLinecap="round" 
          opacity="0.65"
        />
        
        {/* Core Node A (Starting Hub Indicator) */}
        <circle cx="22" cy="75" r="9" fill="#0f172a" stroke="#06b6d4" strokeWidth="4.5" />
        <circle cx="22" cy="75" r="3" fill="#06b6d4" />
        
        {/* Core Node B (Ending Hub Indicator) */}
        <circle cx="78" cy="25" r="9" fill="#0f172a" stroke="#fbbf24" strokeWidth="4.5" />
        <circle cx="78" cy="25" r="3" fill="#fbbf24" />

        {/* Beautiful pulsing aura reflecting user-to-user live road-lane activity and traffic coordination */}
        <circle cx="78" cy="25" r="15" stroke="#fbbf24" strokeWidth="1" opacity="0.4" className="animate-pulse" style={{ transformOrigin: '78px 25px' }} />

        <defs>
          <linearGradient id="routeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  </motion.div>
);

const BrandEmblem = TaxiMapPin; // Maintain backwards compatibility for onboarding views

const AddisSkylineSVG = () => (
  <svg viewBox="0 0 800 200" className="w-full h-32 opacity-25 mt-auto text-yellow-950 pointer-events-none select-none max-w-lg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    {/* Ground Baseline */}
    <line x1="0" y1="180" x2="800" y2="180" />
    
    {/* St. George Cathedral (Octagonal historic dome) */}
    <path d="M50 180 L50 145 L60 145 L60 115 L80 95 L100 95 L120 115 L120 145 L130 145 L130 180 Z" />
    <path d="M60 145 L120 145" />
    <path d="M70 115 L110 115" />
    <path d="M90 95 L90 78" /> {/* Cross spire */}
    <rect x="75" y="120" width="30" height="25" rx="2" />
    
    {/* Tiglachin Obelisk Monument */}
    <path d="M190 180 L205 75 L215 75 L230 180 Z" />
    <path d="M210 75 L210 45 L211 45 L210 38 L209 45 L210 45" />
    <path d="M180 180 L195 140 L195 180 Z" /> {/* Front monument details */}
    
    {/* Modern Landmark HighRise Tower */}
    <rect x="280" y="55" width="45" height="125" rx="3" />
    <line x1="290" y1="55" x2="290" y2="180" strokeDasharray="3,3" />
    <line x1="302" y1="55" x2="302" y2="180" strokeDasharray="3,3" />
    <line x1="315" y1="55" x2="315" y2="180" strokeDasharray="3,3" />
    <line x1="280" y1="85" x2="325" y2="85" />
    <line x1="280" y1="115" x2="325" y2="115" />
    <line x1="280" y1="145" x2="325" y2="145" />
    <circle cx="302" cy="42" r="3" />
    <line x1="302" y1="42" x2="302" y2="24" />
    
    {/* Commercial HQ Building with Glass Window Pane grid */}
    <rect x="360" y="85" width="60" height="95" rx="2" />
    <line x1="360" y1="105" x2="420" y2="105" />
    <line x1="360" y1="125" x2="420" y2="125" />
    <line x1="360" y1="145" x2="420" y2="145" />
    <line x1="360" y1="165" x2="420" y2="165" />
    <line x1="375" y1="85" x2="375" y2="180" />
    <line x1="390" y1="85" x2="390" y2="180" />
    <line x1="405" y1="85" x2="405" y2="180" />

    {/* Historic Monumental Gate (Archway) */}
    <path d="M480 180 L480 105 A 30 30 0 0 1 540 105 L540 180 L525 180 L525 120 A 15 15 0 0 0 495 120 L495 180 Z" />
    <rect x="490" y="85" width="40" height="20" rx="3" />
    <circle cx="510" cy="72" r="4" />
    
    {/* National Theatre / Dome Structure */}
    <path d="M600 180 L600 155 L610 155 A 40 40 0 0 1 690 155 L700 155 L700 180 Z" />
    <rect x="635" y="115" width="30" height="12" />
    <line x1="650" y1="115" x2="650" y2="100" />
    
    {/* Sun background indicator */}
    <circle cx="600" cy="70" r="14" strokeDasharray="3,3" />
  </svg>
);

const AddisMinibusTaxi = () => (
  <motion.div 
    initial={{ x: -80, opacity: 0 }}
    animate={{ x: 0, opacity: 1 }}
    transition={{ delay: 0.4, duration: 0.7, ease: "easeOut" }}
    className="relative w-52 h-20 -mt-10 self-center z-10 select-none pointer-events-none"
  >
    <svg viewBox="0 0 180 80" className="w-full h-full drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
      {/* Wheels shadow */}
      <ellipse cx="45" cy="69" rx="14" ry="3" fill="rgba(0,0,0,0.22)" />
      <ellipse cx="135" cy="69" rx="14" ry="3" fill="rgba(0,0,0,0.22)" />
      
      {/* Toyota Hiace styled shell body */}
      {/* White Roof/Upper Half */}
      <path d="M26 43 L38 23 C40 20, 45 19, 55 19 L155 19 C160 19, 163 22, 165 27 L171 43 Z" fill="#FFFFFF" />
      
      {/* Addis Blue Lower half */}
      <path d="M22 43 L171 43 C174 43, 175 45, 174 49 L168 65 C167 67, 164 68, 160 68 L34 68 C30 68, 27 66, 26 63 L22 47 C21 45, 21 43, 22 43 Z" fill="#0D47A1" />
      
      {/* White Stripe down middle of side */}
      <rect x="23" y="48" width="150" height="3" fill="#FFFFFF" opacity="0.9" />
      
      {/* Windows in charcoal gray */}
      {/* Windshield */}
      <path d="M29 41 L39 25 C41 23, 43 23, 45 23 L62 23 L57 41 Z" fill="#263238" />
      {/* Driver cabin side window */}
      <path d="M62 41 L65 23 L88 23 L88 41 Z" fill="#1C2833" />
      {/* Middle side sliding passenger window */}
      <rect x="93" y="23" width="34" height="18" rx="1.5" fill="#1C2833" />
      {/* Rear passenger window */}
      <path d="M132 23 L158 23 C160 23, 161 24, 162 26 L165 41 L132 41 Z" fill="#1C2833" />
      
      {/* Door handle indicators */}
      <rect x="98" y="46" width="10" height="2" rx="0.5" fill="#37474F" />
      <rect x="73" y="46" width="6" height="2" rx="0.5" fill="#37474F" />
      
      {/* Front lights, amber signal yellow */}
      <circle cx="23.5" cy="50" r="3.5" fill="#FFC107" />
      
      {/* Front license headlight glow shadow */}
      <path d="M23.5 50 L10 50 L12 58 L23.5 50 Z" fill="#FFEB3B" opacity="0.35" />
      
      {/* Wheels */}
      {/* Rear wheels structure with metallic hubs */}
      <circle cx="45" cy="63" r="11" fill="#212121" />
      <circle cx="45" cy="63" r="8" fill="#546E7A" />
      <circle cx="45" cy="63" r="4" fill="#CFD8DC" />
      
      <circle cx="135" cy="63" r="11" fill="#212121" />
      <circle cx="135" cy="63" r="8" fill="#546E7A" />
      <circle cx="135" cy="63" r="4" fill="#CFD8DC" />
    </svg>
  </motion.div>
);

const TelebirrLogo = () => (
  <div className="flex items-center gap-1.5 justify-center select-none scale-105 bg-slate-100 px-5 py-2.5 rounded-full border border-slate-200/45 shadow-sm">
    <svg viewBox="0 0 40 40" className="w-8 h-8 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
      {/* Star sweeping brand badge */}
      <path 
        d="M20 3 L23.5 13.5 L34 13.5 L25.5 19.5 L28.5 30 L20 23 L11.5 30 L14.5 19.5 L6 13.5 L16.5 13.5 Z" 
        fill="#1064AF" 
      />
      <path 
        d="M20 22 C20 22, 10 24, 10 31 C10 36, 17 37, 21 35 C24.5 33.5, 26 30, 26 27" 
        stroke="#1064AF" 
        strokeWidth="3.2" 
        fill="none" 
        strokeLinecap="round" 
      />
    </svg>
    <div className="flex flex-col items-start leading-none">
      <span className="text-sky-600 font-extrabold text-[12.5px] tracking-wide">ቴሌብር</span>
      <span className="text-amber-500 font-black text-[13.5px] tracking-tight -mt-0.5">telebirr</span>
    </div>
  </div>
);

const DonationQRCode = () => (
  <div className="relative w-48 h-48 bg-white border-[3px] border-[#FED100] rounded-2xl p-1.5 flex items-center justify-center shadow-inner overflow-hidden select-none">
    <img 
      src="/donation_qr.png" 
      alt="Telebirr Donation QR" 
      className="w-full h-full object-cover rounded-xl"
      referrerPolicy="no-referrer"
    />
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsSplash(false);
    }, 2200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const requestPermissionOnFirstInteraction = () => {
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        // @ts-ignore
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        // @ts-ignore
        DeviceOrientationEvent.requestPermission()
          .then((permissionState: string) => {
            if (permissionState === 'granted') {
              console.log('Compass permission granted.');
            }
          })
          .catch(console.error);
      }
      
      window.removeEventListener('click', requestPermissionOnFirstInteraction);
      window.removeEventListener('touchend', requestPermissionOnFirstInteraction);
    };

    window.addEventListener('click', requestPermissionOnFirstInteraction);
    window.addEventListener('touchend', requestPermissionOnFirstInteraction);

    return () => {
      window.removeEventListener('click', requestPermissionOnFirstInteraction);
      window.removeEventListener('touchend', requestPermissionOnFirstInteraction);
    };
  }, []);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const dragControls = useDragControls();
  const [activeTab, setActiveTab] = useState<'stations' | 'trips' | 'messages'>('trips');
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
  const [windowHeight, setWindowHeight] = useState(() => typeof window !== 'undefined' ? window.innerHeight : 800);
  const maxHeightForWidth = useRef<Record<number, number>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      maxHeightForWidth.current[window.innerWidth] = Math.max(
        maxHeightForWidth.current[window.innerWidth] || 0,
        window.innerHeight
      );
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      
      if (!maxHeightForWidth.current[w] || h > maxHeightForWidth.current[w]) {
        maxHeightForWidth.current[w] = h;
      }
      
      const maxH = maxHeightForWidth.current[w];
      const activeEl = document.activeElement;
      const isInputFocused = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');
      
      if (isInputFocused && h < maxH * 0.85) {
        // Keyboard is likely open, keep the height stable
        setWindowHeight(maxH);
      } else {
        setWindowHeight(h);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const panelY = useMemo(() => {
    if (selectedStation) return windowHeight;
    if (panelHeight === 'full') return 160;
    if (panelHeight === 'expanded') return Math.round(0.32 * windowHeight);
    return Math.round(0.92 * windowHeight - 135);
  }, [panelHeight, selectedStation, windowHeight]);

  const toggleOffline = useCallback(() => {
    setIsOffline(prev => {
      const next = !prev;
      localStorage.setItem('forceOffline', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const [showFavsOnly, setShowFavsOnly] = useState(false);

  // Community reports for busy stations and pinned minibuses
  const [reports, setReports] = useState<StationReport[]>([]);

  // Subscribes to shared transit reports from cloud Firestore in real-time
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: StationReport[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as StationReport);
      });
      // Filter out reports older than 5 hours (5hr * 60 * 60 * 1000 MS = 18000000)
      const fiveHoursAgo = Date.now() - 18000000;
      setReports(list.filter(report => report.timestamp > fiveHoursAgo));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    return () => unsubscribe();
  }, []);

  const [focusedReport, setFocusedReport] = useState<StationReport | null>(null);
  const [isPostingReport, setIsPostingReport] = useState(false);
  const [newReportStation, setNewReportStation] = useState<string>('Megenagna Minibus Hub');
  const [newReportType, setNewReportType] = useState<'busy' | 'info' | 'minibus'>('busy');
  const [newReportStatus, setNewReportStatus] = useState<'critical' | 'moderate' | 'free' | 'info' | 'pinned'>('critical');
  const [newReportText, setNewReportText] = useState('');

  // Periodic Cleanup: Auto-delete reports older than 5 hours
  useEffect(() => {
    const checkAndPrune = () => {
      const fiveHoursAgo = Date.now() - 18000000;
      setReports(prev => {
        const active = prev.filter(report => report.timestamp > fiveHoursAgo);
        if (active.length !== prev.length) {
          // Hide focus view if the currently focused report got pruned
          if (focusedReport && !active.some(r => r.id === focusedReport.id)) {
            setFocusedReport(null);
          }
          return active;
        }
        return prev;
      });
    };

    checkAndPrune();
    const interval = setInterval(checkAndPrune, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, [focusedReport]);

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
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [donationAmount, setDonationAmount] = useState('10.00');

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

  // The splash screen is interactive and dismissed only when clicking the 'Get Started' button.

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
            console.warn('Geolocation outside Addis Ababa. Positioning user at terminal node in Addis Ababa for testing.');
            const mockLoc: [number, number] = [9.0222, 38.7469];
            setUserLocation(mockLoc);
          }
        },
        () => {
          console.warn('Location access denied. Setting default terminal node locator.');
          const mockLoc: [number, number] = [9.0222, 38.7469];
          setUserLocation(mockLoc);
        }
      );
    } else {
      const mockLoc: [number, number] = [9.0222, 38.7469];
      setUserLocation(mockLoc);
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
          lat: pos ? pos[0] : 9.0222,
          lng: pos ? pos[1] : 38.7469,
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
  }, []);

  const handleReportClick = useCallback((r: StationReport) => {
    setFocusedReport(r);
    setMapCenter(r.location);
    setMapZoom(16);
    setPanelHeight('collapsed');
  }, []);

  const handlePostReport = async () => {
    const textToUse = newReportText.trim() || (
      newReportType === 'busy' 
        ? (lang === 'en' ? 'Station is crowded right now.' : 'ጣቢያው አሁን ላይ ተጨናንቋል።') 
        : newReportType === 'minibus' 
          ? (lang === 'en' ? 'Taxi pinned here.' : 'ታክሲ እዚህ ተለጥፏል።') 
          : (lang === 'en' ? 'Active station update.' : 'የጣቢያ መረጃ።')
    );
    const stationCoords = COORDS[newReportStation] || [9.0272, 38.7678];
    const userAvatarObj = AVATARS.find(a => a.id === userAvatarId) || AVATARS[0];
    
    const newReport: StationReport = {
      id: `rep-custom-${Date.now()}`,
      stationName: newReportStation,
      type: newReportType,
      status: newReportStatus,
      userName: userName.trim() || (lang === 'en' ? 'Addis Rider' : 'አዲስ ተሳፋሪ'),
      userAvatar: userAvatarObj.emoji,
      userBg: userAvatarObj.bg,
      text: textToUse,
      timestamp: Date.now(),
      location: stationCoords
    };

    try {
      await setDoc(doc(db, 'reports', newReport.id), newReport);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `reports/${newReport.id}`);
    }

    setIsPostingReport(false);
    setNewReportText('');
    
    // Auto focus the new post they just created on the map immediately
    setFocusedReport(newReport);
    setMapCenter(stationCoords);
    setMapZoom(16);
    setPanelHeight('collapsed');
  };

  const handleLocateMe = useCallback(() => {
    // Attempt to trigger iOS orientation permissions requests when interacting
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      // @ts-ignore
      typeof DeviceOrientationEvent.requestPermission === 'function'
    ) {
      // @ts-ignore
      DeviceOrientationEvent.requestPermission().catch(console.error);
    }

    if (userLocation && isInsideAddis(userLocation[0], userLocation[1])) {
      setMapCenter(userLocation);
      setMapZoom(16);
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          if (isInsideAddis(lat, lng)) {
            const loc: [number, number] = [lat, lng];
            setUserLocation(loc);
            setMapCenter(loc);
            setMapZoom(16);
          } else {
            const mockLoc: [number, number] = [9.0222, 38.7469];
            setUserLocation(mockLoc);
            setMapCenter(mockLoc);
            setMapZoom(16);
          }
        },
        () => {
          const mockLoc: [number, number] = [9.0222, 38.7469];
          setUserLocation(mockLoc);
          setMapCenter(mockLoc);
          setMapZoom(16);
        }
      );
    } else {
      const mockLoc: [number, number] = [9.0222, 38.7469];
      setUserLocation(mockLoc);
      setMapCenter(mockLoc);
      setMapZoom(16);
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
      setPanelHeight('expanded');
      setPanelOpen(true);
    }
  }, []);

  const handlePlannerLocationChange = useCallback((orig: string, dest: string) => {
    setPlannerOrigin(orig);
    setPlannerDestination(dest);
  }, []);

  if (isSplash) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-50 flex flex-col items-center justify-center p-6 font-sans select-none overflow-hidden relative">
        {/* Dynamic decorative warm light background gradients matching the main app / onboarding */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-500/12 via-amber-400/5 to-transparent pointer-events-none" />

        {/* High-fidelity CSS Grid pattern background instead of image logo */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

        {/* Floating Language selector toggle in top-right - matches app language toggle */}
        <div className="absolute top-6 right-6 flex items-center gap-2 z-50">
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLang(l => l === 'en' ? 'am' : 'en');
            }}
            className="px-4 py-2 bg-white/90 backdrop-blur-md shadow-[0_4px_20px_rgba(15,23,42,0.05)] rounded-full border border-slate-200/50 font-black text-[10px] text-slate-800 hover:bg-slate-50 active:scale-95 transition-all outline-none cursor-pointer flex items-center gap-1.5"
          >
            <span>🌐</span>
            <span>{lang === 'en' ? 'አማርኛ' : 'English'}</span>
          </button>
        </div>

        {/* High-fidelity card container - matches the onboarding card dimensions, corners, and glassmorphism styling */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm bg-white/95 backdrop-blur-xl border border-slate-200/50 rounded-[36px] p-10 shadow-[0_32px_64px_-16px_rgba(15,23,42,0.1)] flex flex-col items-center relative z-10"
        >
          {/* Micro typographic category / visual anchor instead of a physical logo */}
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-100/80 rounded-full border border-slate-200/40 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase">SYS_ONLINE</span>
          </div>

          <h1 className="text-3xl font-black text-slate-950 tracking-tighter select-none font-sans drop-shadow-sm flex flex-col items-center leading-none">
            <span>TAXI TERA</span>
            <span className="text-xs tracking-[0.25em] font-black text-slate-400 mt-2 uppercase font-sans">ታክሲ ተራ</span>
          </h1>

          <p className="text-cyan-600 text-[10px] font-black uppercase tracking-widest mt-5 bg-cyan-50 border border-cyan-100/50 px-3.5 py-1.5 rounded-full text-center">
            {lang === 'en' ? 'Ethiopia Transit Guide' : 'የኢትዮጵያ የህዝብ ትራንስፖርት መመሪያ'}
          </p>

          <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[280px] mt-5 mb-1 text-center">
            {lang === 'en' 
              ? 'Loading highly detailed offline route systems, transit hubs, and schedules...'
              : 'የአዲስ አበባን የህዝብ ትራንስፖርት መስመሮችን እና ጣቢያዎችን በመጫን ላይ...'}
          </p>

          {/* Premium Animated Progress Loading Meter matching actual application aesthetics */}
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-8 border border-slate-200/30 relative">
            <motion.div 
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.1, ease: [0.22, 1, 0.36, 1] }}
              className="h-full bg-gradient-to-r from-cyan-500 via-amber-400 to-cyan-400 absolute left-0 top-0"
            />
          </div>

          {/* Subtle loading label with beautiful pulsing dot animation */}
          <div className="flex items-center gap-1.5 mt-5 text-slate-400">
            <span className="text-[9px] uppercase font-black tracking-widest">
              {lang === 'en' ? 'Synchronizing maps' : 'ካርታዎችን በማዘጋጀት ላይ'}
            </span>
            <div className="flex gap-0.5 items-center">
              {[0, 1, 2].map(i => (
                <motion.div 
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
                  className="w-1 h-1 rounded-full bg-slate-400"
                />
              ))}
            </div>
          </div>
        </motion.div>

        {/* Pure decorative background element indicating system localization ready */}
        <div className="absolute bottom-6 text-[8px] uppercase tracking-widest font-black text-slate-400/70 select-none pointer-events-none">
          Addis Ababa Localized Engine v1.0 • Offline Loaded
        </div>
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
            {lang === 'en' ? 'Get Moving Seamlessly' : 'ቀልጣፋ ጉዞ ይጀምሩ'}
          </h2>
          <p className="text-cyan-600 text-[10px] font-black uppercase tracking-widest mt-2.5 bg-cyan-50 border border-cyan-100/50 px-3.5 py-1.5 rounded-full text-center leading-none">
            {lang === 'en' ? 'Point A to B Routing & Live Road Status' : 'ትክክለኛ አቅጣጫዎች እና ፈጣን መረጃዎች'}
          </p>
          
          <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[280px] mt-3.5 mb-5 text-center">
            {lang === 'en' 
              ? 'Choose the smartest paths from Point A to B. Explore multiple alternative routes, locate exactly where stations are situated, and coordinate with other commuters to share live road activity, lane problems, or traffic bottlenecks.' 
              : 'አዲስ አበባ ውስጥ ከቦታ ቦታ የሚወስዱ የተለያዩ አማራጭ መንገዶችን እና ዋና ጣቢያዎችን በቀላሉ ያግኙ። በተጨማሪም የመንገዶችን መጨናነቅ እና የቀኝ/ግራ መንገዶች ሁኔታን ከሌሎች ተጠቃሚዎች ጋር በእውነተኛ ጊዜ ይጋሩ።'}
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
      <div className="absolute top-4 left-4 right-4 z-[1080] pointer-events-none">
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
                className="w-9 h-9 bg-white/95 backdrop-blur-md rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-slate-100 flex items-center justify-center text-slate-500 hover:text-amber-500 active:scale-95 transition-all outline-none relative cursor-pointer"
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
          reports={reports}
          onReportClick={handleReportClick}
        />

        {/* Floating Focused Report Dialog Overlay */}
        <AnimatePresence>
          {focusedReport && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="absolute top-[125px] inset-x-4 z-40 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_12px_44px_rgba(0,0,0,0.35)] p-4 text-white flex flex-col gap-3 font-sans"
            >
              <button 
                onClick={() => setFocusedReport(null)}
                className="absolute top-3.5 right-3.5 p-1.5 bg-white/10 hover:bg-white/20 active:scale-90 text-white rounded-full transition-all cursor-pointer border border-white/5"
                title={lang === 'en' ? 'Close Focus' : 'ትኩረት ዝጋ'}
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {focusedReport.type === 'busy' 
                    ? (lang === 'en' ? 'Crowd Alert' : 'የሰልፍ ጥቆማ') 
                    : focusedReport.type === 'minibus' 
                      ? (lang === 'en' ? 'Taxi Pinned' : 'ታክሲ ተለጥፏል') 
                      : (lang === 'en' ? 'Station Info' : 'የጣቢያ መረጃ')}
                </span>
                <span className="text-[9px] text-white/55 font-bold font-mono">
                  {formatReportTime(focusedReport.timestamp, lang)}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-black tracking-tight flex items-center gap-1.5 text-yellow-400">
                  <MapPin className="w-4 h-4 text-yellow-500 fill-yellow-500/10 shrink-0" />
                  <span>{focusedReport.stationName}</span>
                </h4>
                <p className="text-xs text-white/90 mt-1.5 leading-relaxed font-semibold">
                  "{focusedReport.text}"
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-white/5 pt-2.5 mt-0.5 text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div className={cn("w-5.5 h-5.5 rounded-full flex items-center justify-center text-xs bg-gradient-to-tr shadow-sm", focusedReport.userBg)}>
                    {focusedReport.userAvatar}
                  </div>
                  <span className="text-white/60 font-black">{focusedReport.userName}</span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setFocusedReport(null)}
                  className="px-3 py-1 bg-[#FFD300] hover:bg-[#FED100] text-slate-950 font-black text-[9px] uppercase tracking-wider rounded-lg transition-transform active:scale-95 cursor-pointer border-none"
                >
                  {lang === 'en' ? 'Dismiss Blur' : 'ትኩረቱን አንሳ'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
          y: panelY
        }}
        style={{ height: '92vh' }}
        transition={{ type: 'spring', damping: 28, stiffness: 220, mass: 0.9 }}
        drag={selectedStation ? false : "y"}
        dragConstraints={{ 
          top: 160 - (typeof panelY === 'number' ? panelY : 160), 
          bottom: Math.round(0.92 * windowHeight - 135) - (typeof panelY === 'number' ? panelY : 160) 
        }}
        dragElastic={0.15}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (selectedStation) return;
          const velocity = info.velocity.y;
          const offset = info.offset.y;
          const currentY = (typeof panelY === 'number' ? panelY : 160) + offset;

          const snapFull = 160;
          const snapExpanded = Math.round(0.32 * windowHeight);
          const snapCollapsed = Math.round(0.92 * windowHeight - 135);

          // natural sliding with light momentum projection
          const projectedY = currentY + (velocity * 0.12);

          const distFull = Math.abs(projectedY - snapFull);
          const distExpanded = Math.abs(projectedY - snapExpanded);
          const distCollapsed = Math.abs(projectedY - snapCollapsed);

          const minDist = Math.min(distFull, distExpanded, distCollapsed);

          if (minDist === distFull) {
            setPanelHeight('full');
            setPanelOpen(true);
          } else if (minDist === distExpanded) {
            setPanelHeight('expanded');
            setPanelOpen(true);
          } else {
            setPanelHeight('collapsed');
            setPanelOpen(false);
          }
        }}
        className="fixed inset-x-0 bottom-0 bg-white rounded-t-[36px] shadow-[0_-8px_40px_rgba(0,0,0,0.08)] flex flex-col border-t border-slate-100 overflow-hidden z-[1090]"
      >
        {/* iOS-style slide handle & header background trigger area */}
        <div className="shrink-0 flex flex-col select-none touch-pan-y">
          <div 
            className="py-4 pb-2 w-full flex flex-col items-center select-none cursor-pointer"
            onClick={() => {
              if (panelHeight === 'collapsed') {
                setPanelHeight('expanded');
                setPanelOpen(true);
              } else if (panelHeight === 'full') {
                setPanelHeight('expanded');
                setPanelOpen(true);
              } else {
                setPanelHeight('collapsed');
                setPanelOpen(false);
              }
            }}
          >
            <div className="w-12 h-1.5 bg-slate-200/90 rounded-full" />
          </div>

          {/* Custom Segment Tab Selector */}
          <div className="px-4 pb-2.5" onPointerDownCapture={(e) => e.stopPropagation()}>
            <div className="p-0.5 bg-slate-100/90 rounded-2xl flex items-center font-sans border border-slate-200/20 shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
              <button
                onClick={() => {
                  setActiveTab('trips');
                  setPanelHeight('expanded');
                  setPanelOpen(true);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-[11px] font-black tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  activeTab === 'trips' 
                    ? "bg-white text-slate-800 shadow-[0_2.5px_8px_rgba(15,23,42,0.06)]" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <MapIcon className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'en' ? 'Planner' : 'አቅጣጫ'}</span>
              </button>
              
              <button
                onClick={() => {
                  setActiveTab('stations');
                  setShowFavsOnly(false);
                  setPanelHeight('expanded');
                  setPanelOpen(true);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-[11px] font-black tracking-tight transition-all cursor-pointer flex items-center justify-center gap-1.5",
                  (activeTab === 'stations' && !showFavsOnly)
                    ? "bg-white text-slate-800 shadow-[0_2.5px_8px_rgba(15,23,42,0.06)]" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <Bus className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'en' ? 'Stations' : 'ጣቢያዎች'}</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('messages');
                  setPanelHeight('expanded');
                  setPanelOpen(true);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-xl text-[11px] font-black tracking-tight transition-all cursor-pointer relative flex items-center justify-center gap-1.5",
                  activeTab === 'messages'
                    ? "bg-white text-slate-800 shadow-[0_2.5px_8px_rgba(15,23,42,0.06)]" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>{lang === 'en' ? 'Updates' : 'ሪፖርቶች'}</span>
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full" />
              </button>
            </div>
          </div>
        </div>

        {/* Search places, areas... inside the bottom-sheet directly, mirroring exactly screen reference */}
        {activeTab === 'stations' && (
          <div className="px-4 pb-3 shrink-0" onPointerDownCapture={(e) => e.stopPropagation()}>
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
        <div 
          onPointerDownCapture={panelHeight === 'full' ? (e) => e.stopPropagation() : undefined}
          className="flex-1 overflow-y-auto px-4 py-1.5 scrollbar-hide pb-32"
        >
            {activeTab === 'stations' ? (
              <motion.div 
                key="stations"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12 }}
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
                        <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-slate-500 shadow-sm border border-slate-100 shrink-0">
                          {getVehicleIcon(s.t, "w-5 h-5")}
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
            ) : activeTab === 'trips' ? (
              <motion.div 
                key="trips"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12 }}
              >
                <TripPlanner 
                  lang={lang} 
                  userLocation={userLocation}
                  initialOrigin={plannerInitialState.origin}
                  initialDestination={plannerInitialState.dest}
                  onPathSelect={handlePathSelect} 
                  onLocationChange={handlePlannerLocationChange}
                  isOffline={isOffline}
                />
              </motion.div>
            ) : (
              <motion.div 
                key="messages"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className="flex flex-col gap-4 font-sans"
              >
                {/* Header card with action */}
                <div className="bg-gradient-to-tr from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-4 shadow-md border border-white/10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/10 rounded-full blur-2xl pointer-events-none" />
                  
                  <h3 className="text-sm font-black uppercase tracking-wider text-yellow-400">
                    {lang === 'en' ? '👥 Addis Crowdsource' : '👥 የአዲስ ክራውድሶርስ'}
                  </h3>
                  <p className="text-xs text-white/80 mt-1 font-semibold leading-relaxed">
                    {lang === 'en' 
                      ? 'Stay updated with real-time station statuses, taxi passenger queues, and minibus availability reported by riders.' 
                      : 'በተሳፋሪዎች የተዘገቡ ፈጣን የጣቢያ መጨናነቅ፣ የሰልፍ ርዝመት እና የታክሲ መረጃዎችን እዚህ ያግኙ።'}
                  </p>
                  
                  {!isPostingReport && (
                    <button
                      onClick={() => setIsPostingReport(true)}
                      className="mt-4 w-full py-3 bg-[#FFD300] hover:bg-[#FED100] active:scale-[0.99] text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-[0_4px_12px_rgba(254,209,0,0.25)] flex items-center justify-center gap-2 cursor-pointer border-none"
                    >
                      <span>📢</span>
                      <span>{lang === 'en' ? 'Report Crowd or Taxi Info' : 'የሚጨናነቅ ጣቢያ ወይም ታክሲ ጠቁም'}</span>
                    </button>
                  )}
                </div>

                {/* Submit Report Form Card (Expandable inline) */}
                <AnimatePresence>
                  {isPostingReport && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 overflow-hidden flex flex-col gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                          {lang === 'en' ? 'Create New Update' : 'አዲስ መረጃ ይጻፉ'}
                        </h4>
                        <button 
                          onClick={() => setIsPostingReport(false)}
                          className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Select Station dropdown */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {lang === 'en' ? 'Select Station' : 'ጣቢያ ይምረጡ'}
                        </label>
                        <select
                          value={newReportStation}
                          onChange={(e) => setNewReportStation(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-xs font-bold text-slate-800 rounded-xl p-2.5 outline-none focus:border-slate-800 transition-colors"
                        >
                          {STATIONS.map((st) => (
                            <option key={`st-sel-${st.id}`} value={st.name}>
                              {lang === 'am' ? st.am : st.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Select Type Grid */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {lang === 'en' ? 'Update Category' : 'የመረጃው አይነት'}
                        </label>
                        <div className="grid grid-cols-3 gap-1.5 mt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setNewReportType('busy');
                              setNewReportStatus('critical');
                            }}
                            className={cn(
                              "py-2 px-1 text-[10px] font-black uppercase tracking-tight rounded-xl transition-all cursor-pointer border flex flex-col items-center justify-center gap-1",
                              newReportType === 'busy'
                                ? "bg-red-50 border-red-200 text-red-600 shadow-sm"
                                : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
                            )}
                          >
                            <Flame className="w-4 h-4 shrink-0" />
                            <span>{lang === 'en' ? 'Busy Station' : 'የተጨናነቀ'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setNewReportType('minibus');
                              setNewReportStatus('pinned');
                            }}
                            className={cn(
                              "py-2 px-1 text-[10px] font-black uppercase tracking-tight rounded-xl transition-all cursor-pointer border flex flex-col items-center justify-center gap-1",
                              newReportType === 'minibus'
                                ? "bg-cyan-50 border-cyan-200 text-cyan-600 shadow-sm"
                                : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
                            )}
                          >
                            <Bus className="w-4 h-4 shrink-0" />
                            <span>{lang === 'en' ? 'Pin Minibus' : 'ታክሲ አለ'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setNewReportType('info');
                              setNewReportStatus('info');
                            }}
                            className={cn(
                              "py-2 px-1 text-[10px] font-black uppercase tracking-tight rounded-xl transition-all cursor-pointer border flex flex-col items-center justify-center gap-1",
                              newReportType === 'info'
                                ? "bg-amber-50 border-amber-200 text-amber-600 shadow-sm"
                                : "bg-white border-slate-100 text-slate-400 hover:text-slate-600"
                            )}
                          >
                            <Info className="w-4 h-4 shrink-0" />
                            <span>{lang === 'en' ? 'General Info' : 'መረጃ'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Text Description Box */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {lang === 'en' ? 'Details text' : 'ዝርዝር ማብራሪያ'}
                        </label>
                        <textarea
                          rows={2.5}
                          value={newReportText}
                          onChange={(e) => setNewReportText(e.target.value)}
                          placeholder={
                            newReportType === 'busy'
                              ? (lang === 'en' ? 'e.g., The Stadium queue for Bole is 40 people long right now.' : 'ምሳሌ፡ የቦሌ ታክሲ ሰልፍ ስታዲየም ላይ 40 ሰው ይደርሳል።')
                              : newReportType === 'minibus'
                                ? (lang === 'en' ? 'e.g., 3 empty minibuses just parked ready for passengers.' : 'ምሳሌ፡ 3 ባዶ ታክሲዎች አሁን ተሰልፈዋል።')
                                : (lang === 'en' ? 'e.g., Fares are regular today, road is clear.' : 'ምሳሌ፡ ዛሬ ዋጋው መደበኛ ነው፣ መንገዱም ንጹህ ነው።')
                          }
                          className="w-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 rounded-xl p-2.5 outline-none focus:border-slate-800 transition-colors placeholder:text-slate-400 leading-normal"
                          maxLength={150}
                        />
                      </div>

                      {/* Form action triggers */}
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => handlePostReport()}
                          className="flex-1 py-3 bg-slate-950 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer border-none"
                        >
                          {lang === 'en' ? 'Post Update' : 'መረጃውን ልቀቅ'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPostingReport(false)}
                          className="py-3 px-4 bg-slate-200 text-slate-600 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer border-none"
                        >
                          {lang === 'en' ? 'Cancel' : 'ስርዝ'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* List of active crowd reports */}
                <div className="flex flex-col gap-2.5 mt-1">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      {lang === 'en' ? 'Live Community Activity Feed' : 'የአካባቢው ተሳፋሪዎች መረጃ ረድፍ'}
                    </h4>
                    <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                      {reports.length} {lang === 'en' ? 'active' : 'ወቅታዊ መረጃ'}
                    </span>
                  </div>

                  {reports.map((report) => {
                    return (
                      <motion.div 
                        key={`report-item-${report.id}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "bg-white rounded-2xl border p-3 flex flex-col gap-2.5 transition-all relative group shadow-[0_2px_12px_rgba(15,23,42,0.015)] hover:shadow-[0_4px_20px_rgba(15,23,42,0.04)]",
                          report.type === 'busy' 
                            ? "border-red-100/70 hover:border-red-200/70" 
                            : report.type === 'minibus' 
                              ? "border-cyan-100/70 hover:border-cyan-200/70" 
                              : "border-slate-100 hover:border-slate-200"
                        )}
                      >
                        {/* Header metadata row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gradient-to-tr", report.userBg)}>
                              {report.userAvatar}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-slate-800 leading-tight">
                                {report.userName}
                              </span>
                              <span className="text-[8px] text-slate-400 font-bold leading-none font-mono mt-0.5">
                                {formatReportTime(report.timestamp, lang)}
                              </span>
                            </div>
                          </div>

                           <div className="flex items-center gap-1.5">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border flex items-center gap-1",
                              report.type === 'busy' 
                                ? "bg-red-50 border-red-100 text-red-600" 
                                : report.type === 'minibus' 
                                  ? "bg-cyan-50 border-cyan-100 text-cyan-600" 
                                  : "bg-amber-50 border-amber-100 text-amber-600"
                            )}>
                              {report.type === 'busy' && <Flame className="w-2.5 h-2.5 text-red-500 shrink-0 animate-pulse" />}
                              {report.type === 'minibus' && <Bus className="w-2.5 h-2.5 text-cyan-500 shrink-0" />}
                              {report.type === 'info' && <Info className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                              <span>
                                {report.type === 'busy' 
                                  ? (lang === 'en' ? 'Busy Queue' : 'በከፍተኛ ሰልፍ') 
                                  : report.type === 'minibus' 
                                    ? (lang === 'en' ? 'Minibus' : 'ታክሲ የሚገኝበት') 
                                    : (lang === 'en' ? 'Info' : 'ጣቢያ መረጃ')}
                              </span>
                            </span>
                            
                            {/* Dismiss button */}
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await deleteDoc(doc(db, 'reports', report.id));
                                } catch (error) {
                                  console.error("Failed to delete report: ", error);
                                }
                                if (focusedReport?.id === report.id) {
                                  setFocusedReport(null);
                                }
                              }}
                              className="p-1 text-slate-300 hover:text-slate-500 rounded-full hover:bg-slate-50 transition-colors"
                              title={lang === 'en' ? 'Close Report' : 'ሪፖርት አጥፋ'}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Station and Description text */}
                        <div 
                          onClick={() => {
                            setFocusedReport(report);
                            setMapCenter(report.location);
                            setMapZoom(16);
                            setPanelHeight('collapsed');
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-xs font-black text-slate-800 hover:text-slate-950 underline decoration-slate-300 decoration-1">
                              {report.stationName}
                            </span>
                          </div>
                          
                          <p className="text-xs font-bold text-slate-600 mt-1 pl-4 leading-relaxed italic">
                            "{report.text}"
                          </p>
                        </div>

                        {/* Quick View-on-Map helper panel */}
                        <div className="flex items-center justify-end border-t border-slate-50 pt-2 shrink-0">
                          <button
                            onClick={() => {
                              setFocusedReport(report);
                              setMapCenter(report.location);
                              setMapZoom(16);
                              setPanelHeight('collapsed');
                            }}
                            className="bg-slate-50 hover:bg-[#FFD300]/10 border border-slate-100 hover:border-[#FFD300]/40 rounded-lg px-2.5 py-1 text-[9px] font-black text-slate-700 hover:text-slate-900 flex items-center justify-center gap-1 px-2 py-1 cursor-pointer transition-colors"
                          >
                            <MapIcon className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{lang === 'en' ? 'Show on Map' : 'ካርታ ላይ አሳይ'}</span>
                            <span className="text-[10px] leading-none">→</span>
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}

                  {reports.length === 0 && (
                    <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 p-6 flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-300 mb-1">
                        <MessageSquare className="w-5 h-5 shrink-0" />
                      </div>
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mt-1">
                        {lang === 'en' ? 'No reports currently' : 'ምንም ወቅታዊ መረጃ የለም'}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-bold max-w-xs mt-0.5">
                        {lang === 'en' 
                          ? 'Everything is clean right now. Click on "Report Crowd" to submit any updates you notice.' 
                          : 'ሁሉም ቦታ ንጹህ ይመስላል። ያስተዋሉትን ማንኛውንም መረጃ ለማጋራት "ይጨናነቃል" የሚለውን ይጫኑ።'}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
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
              transition={{ type: 'tween', ease: [0.215, 0.61, 0.355, 1], duration: 0.32 }}
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
                  <div className="w-12 h-12 rounded-[18px] flex items-center justify-center shadow-sm shrink-0 border border-slate-100/50 bg-cyan-50 text-cyan-600">
                    {getVehicleIcon(selectedStation.t, "w-5 h-5")}
                  </div>

                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black tracking-widest uppercase text-slate-400">
                      {lang === 'en' ? 'Minibus Tera' : 'የሚኒባስ ተራ'}
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
                      <span key={r} className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1 transition-colors shadow-sm animate-in fade-in zoom-in-95 duration-150">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{r}</span>
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
              transition={{ type: 'tween', ease: [0.215, 0.61, 0.355, 1], duration: 0.28 }}
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
                  { icon: Heart, label: lang === 'en' ? 'Support Developer' : 'ለአልሚው ድጋፍ ያድርጉ', id: 'support' },
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
                      } else if (item.id === 'support') {
                        setIsSupportOpen(true);
                        setIsMenuOpen(false);
                      } else {
                        setIsMenuOpen(false);
                      }
                    }}
                    className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors group"
                  >
                    <item.icon className={cn(
                      "w-5 h-5 transition-colors",
                      item.id === 'support' 
                        ? "text-rose-500 group-hover:text-rose-600" 
                        : "text-slate-400 group-hover:text-primary"
                    )} />
                    <span className={cn(
                      "font-bold transition-colors",
                      item.id === 'support' 
                        ? "text-rose-600 group-hover:text-rose-700" 
                        : "text-slate-700"
                    )}>{item.label}</span>
                  </button>
                ))}
              </div>

              <div className="mt-auto pt-6 border-t border-slate-100">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 text-lg font-bold">
                    💖
                  </div>
                  <div>
                    <div className="font-black text-slate-800 tracking-tight text-sm">Taxi Tera</div>
                    <div className="text-[10px] text-primary font-black uppercase tracking-wider mb-0.5">Developed by Abenezer</div>
                    <div className="text-[8px] text-slate-400 font-mono">v1.0.3 Live Update</div>
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
              className="bg-white/95 backdrop-blur-xl border border-slate-200/50 w-full max-w-sm rounded-[36px] shadow-[0_32px_64px_-16px_rgba(15,23,42,0.15)] flex flex-col relative overflow-hidden select-none p-6 pt-8 pb-5 font-sans"
            >
              {/* Close Button X */}
              <button 
                onClick={() => setIsAboutOpen(false)}
                className="absolute top-4 right-4 p-1.5 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 transition-colors cursor-pointer focus:outline-none border-none"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col items-center text-center pb-4 border-b border-slate-100">
                <div className="scale-90 mb-1">
                  <BrandEmblem />
                </div>
                <h2 className="text-2xl font-black text-slate-950 tracking-tighter leading-none mt-1">TAXI TERA</h2>
                <span className="text-[10px] tracking-[0.25em] font-black text-slate-400 mt-1.5 uppercase">ታክሲ ተራ</span>
                
                <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mt-3.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full">
                  {lang === 'en' ? 'Ethiopia Transit Guide' : 'የኢትዮጵያ የህዝብ ትራንስፖርት መመሪያ'}
                </p>
              </div>
              
              <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-4 max-h-[40vh] text-slate-600 font-sans custom-scrollbar">
                <section className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100/50">
                  <h3 className="font-extrabold text-xs text-slate-900 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="text-amber-500">🎯</span>
                    {lang === 'en' ? 'Get from Point A to B' : 'ከመነሻ እስከ መድረሻ'}
                  </h3>
                  <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                    {lang === 'en' 
                      ? "Taxi Tera offers smooth, intuitive solutions to help you travel from Point A to Point B across the city effortlessly. Explore multiple dynamic route options and find your best journey instantly."
                      : "ታክሲ ተራ ከቦታ ቦታ (ከመነሻ እስከ መድረሻ) ቀልጣፋ በሆነ መንገድ ለመጓዝ የሚረዳ የአቅጣጫ መመሪያዎ ነው። በርካታ አማራጭ መስመሮችን በማቅረብ ሁሌም ቀላሉን መንገድ እንዲመርጡ ያስችልዎታል።"}
                  </p>
                </section>
                
                <section className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100/50">
                  <h3 className="font-extrabold text-xs text-slate-900 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="text-cyan-500">🗺️</span>
                    {lang === 'en' ? 'Station Locations' : 'የጣቢያዎች መገኛ'}
                  </h3>
                  <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                    {lang === 'en'
                      ? "Easily find and discover exactly where key transit hubs and station platforms are situated on the street map. Say goodbye to guesswork and navigate city transfers confidently."
                      : "በከተማዋ ባሉ ምቹ ካርታዎች ላይ ዋና ዋና የመጓጓዣ ጣቢያዎችን እና የመሰብሰቢያ ቦታዎችን በቀላሉ ያግኙ።"}
                  </p>
                </section>

                <section className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100/50">
                  <h3 className="font-extrabold text-xs text-slate-900 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="text-emerald-500">👥</span>
                    {lang === 'en' ? 'Commuter Crowd Reports' : 'የመንገድ ላይ መረጃዎች'}
                  </h3>
                  <p className="text-[11px] leading-relaxed font-medium text-slate-500">
                    {lang === 'en'
                      ? "Connect and coordinate with other live commuters in real time. Share crowd-sourced updates to let fellow travelers know if roads are busy or if there are blockages or problems with specific lanes."
                      : "ከሌሎች ተጓዦች ጋር በመገናኘት የመንገዶችን መጨናነቅ እና ልዩ ልዩ የመንገድ ላይ ሁኔታዎችን በእውነተኛ ጊዜ መጋራት እና ማየት ይችላሉ።"}
                  </p>
                </section>

                <div className="pt-2 flex flex-col items-center gap-1 border-t border-slate-100/80">
                  <div className="text-[10px] text-cyan-600 font-black uppercase tracking-wider">
                    {lang === 'en' ? 'Designed & Developed by Abenezer' : 'የበለፀገውና የተነደፈው በአበነዘር ነው'}
                  </div>
                  <div className="text-[8px] text-slate-400 font-mono uppercase tracking-widest">
                    v1.0.4 • Addis Ababa, Ethiopia
                  </div>
                </div>
              </div>

              <div className="pt-2 mt-auto">
                <button 
                  onClick={() => setIsAboutOpen(false)}
                  className="w-full py-4 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all cursor-pointer shadow-md leading-none border-none"
                >
                  {lang === 'en' ? 'Got it!' : 'ተረዳሁት!'}
                </button>
              </div>
            </motion.div>
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

      {/* Support Developer Modal */}
      <AnimatePresence>
        {isSupportOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[12000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 20 }}
              transition={{ type: 'tween', ease: [0.34, 1.56, 0.64, 1], duration: 0.38 }}
              className="w-full max-w-[340px] bg-slate-900/40 rounded-[32px] shadow-2xl border border-white/10 flex flex-col relative overflow-hidden select-none p-1.5 pb-4 border-t border-white/20"
            >
              {/* The exact Telebirr payment card image */}
              <div className="w-full rounded-[26px] overflow-hidden bg-white shadow-lg relative aspect-[9/16] max-h-[580px]">
                <img 
                  src="/donation_qr.png" 
                  alt="Telebirr Payment Card" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                
                {/* Close button inside the image card overlay */}
                <button 
                  onClick={() => setIsSupportOpen(false)}
                  className="absolute top-4 right-4 p-2.5 bg-black/45 hover:bg-black/65 active:scale-95 text-white rounded-full transition-all duration-200 cursor-pointer focus:outline-none z-30 flex items-center justify-center border border-white/15 backdrop-blur-md shadow-md"
                  title={lang === 'en' ? 'Close' : 'ዝጋ'}
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>
              
              {/* Minimalist instruction text under the card */}
              <p className="text-[11px] text-white/95 text-center px-4 mt-3 leading-relaxed font-semibold">
                {lang === 'en' 
                  ? 'Scan the Telebirr QR from your Telebirr app to support the developer.' 
                  : 'ለመደገፍ ይህንን የቴሌብር QR ኮድ በቴሌብር መተግበሪያዎ ይቃኙ።'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Premium Bottom Tab Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-100/70 p-2 pb-5 sm:p-2.5 sm:pb-3.5 flex justify-around items-center z-[1100] shadow-[0_-4px_24px_rgba(0,0,0,0.03)] select-none">
        {[
          { id: 'trips', label: lang === 'en' ? 'Planner' : 'አቅጣጫ', icon: Navigation },
          { id: 'favs', label: lang === 'en' ? 'Favorites' : 'ተወዳጆች', icon: Star },
          { id: 'about', label: lang === 'en' ? 'About App' : 'ስለ መተግበሪያው', icon: Info }
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

