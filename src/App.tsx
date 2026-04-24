import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Wallet, 
  Coffee, 
  Sparkles, 
  Loader2,
  User as UserIcon,
  LogOut,
  Settings,
  ChevronDown,
  Compass,
  Calendar,
  Sun,
  Moon
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { format, parseISO, subYears } from 'date-fns';
import { th } from 'date-fns/locale';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';

// Components
import { DynamicHoldSimulator } from './components/DynamicHoldSimulator';
import { CustomMixBuilder, AlertMessenger } from './components/InvestmentTools';
import { MyPortfolio } from './components/MyPortfolio';
import { MarketOverview } from './components/MarketOverview';

const FUNDS_MAP: Record<string, string> = {
  UNIT_COST1: "แผนลงทุนพื้นฐานทั่วไป",
  UNIT_COST2: "แผนเชิงรุก 35",
  UNIT_COST3: "แผนตราสารหนี้",
  UNIT_COST4: "แผนเงินฝากและตราสารหนี้ระยะสั้น",
  UNIT_COST5: "แผนเชิงรุก 20* (เป็นส่วนหนึ่งของแผนสมดุลตามอายุ)",
  UNIT_COST6: "แผนเชิงรุก 65",
  UNIT_COST7: "แผนหุ้นไทย",
  UNIT_COST8: "แผนกองทุนอสังหาริมทรัพย์ไทย",
  UNIT_COST9: "แผนหุ้นต่างประเทศ",
  UNIT_COST11: "แผนตราสารหนี้ต่างประเทศ",
  UNIT_COST12: "แผนทองคำ",
  UNIT_COST13: "แผนเชิงรุก 75* (เป็นส่วนหนึ่งของแผนสมดุลตามอายุ)",
  UNIT_COST14: "แผนกองทุนรวมวายุภักษ์",
  UNIT_COST15: "แผนเกษียณสบายใจ 2569",
  UNIT_COST16: "แผนการลงทุนตามหลักชะรีอะฮ์"
};

import { CardShimmer } from './components/Shimmer';

import { AuthProvider, useAuth } from './contexts/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading, signInWithGoogle, logout } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    return 'light';
  });
  const [timeFilter, setTimeFilter] = useState<'1Y' | '3Y' | 'MAX'>('MAX');
  
  const allFunds = Object.values(FUNDS_MAP);
  const [selectedFunds, setSelectedFunds] = useState<string[]>(['แผนลงทุนพื้นฐานทั่วไป', 'แผนเชิงรุก 65']);
  const [customMix, setCustomMix] = useState<any[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    // Real-time Synchronizers
    const unsubMetadata = onSnapshot(doc(db, 'metadata', 'sync_info'), (snapshot) => {
      if (snapshot.exists()) setLastSync(snapshot.data().last_updated);
    });

    const q = query(collection(db, 'nav_history'), orderBy('date', 'asc'));
    const unsubNav = onSnapshot(q, (snapshot) => {
      const fetchedData: any[] = [];
      snapshot.forEach(doc => fetchedData.push(doc.data()));
      setData(prev => JSON.stringify(prev) !== JSON.stringify(fetchedData) ? fetchedData : prev);
      setLoading(false);
    });

    const clearSplash = () => {
      const splash = document.getElementById('pwa-splash');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(() => splash.remove(), 600);
      }
    };

    // Safety timeout: Clear splash after 5 seconds regardless of data
    const safetyTimer = setTimeout(clearSplash, 5000);

    const checkDataLoad = setInterval(() => {
      if (data.length > 0) {
         setLoading(false);
         clearInterval(checkDataLoad);
         clearTimeout(safetyTimer);
         setTimeout(clearSplash, 800);
      }
    }, 100);

    return () => {
      unsubMetadata();
      unsubNav();
      clearInterval(checkDataLoad);
      clearTimeout(safetyTimer);
    };
  }, [data.length]);

  const toggleFund = (fund: string) => {
    setSelectedFunds(prev => prev.includes(fund) ? prev.filter(f => f !== fund) : [...prev, fund]);
  };

  const formattedData = useMemo(() => data.map(item => {
    const newItem: any = { ...item, displayDate: formatThaiDate(item.date) };
    
    // Ensure both UNIT_COSTx and human names are correctly handled
    Object.entries(FUNDS_MAP).forEach(([key, name]) => {
      // If the data has the raw key (UNIT_COSTx), map it to the human name
      if (item[key] !== undefined && item[key] !== null) {
        newItem[name] = Number(item[key]);
      }
      // If the data ALREADY has the human name (mapped by scraper), use it
      if (item[name] !== undefined && item[name] !== null) {
        newItem[name] = Number(item[name]);
      }
    });
    
    return newItem;
  }), [data]);
  const latestData = formattedData[formattedData.length - 1];
  const previousData = formattedData[formattedData.length - 2];

  const chartData = useMemo(() => {
    if (!formattedData.length) return [];
    if (timeFilter === 'MAX') return formattedData;
    const latestDate = parseISO(formattedData[formattedData.length - 1].date);
    const cutoffDate = subYears(latestDate, timeFilter === '1Y' ? 1 : 3);
    return formattedData.filter(d => parseISO(d.date) >= cutoffDate);
  }, [formattedData, timeFilter]);

  const chartDataWithMix = useMemo(() => {
    const baseData = chartData.map(d => {
      let totalNav = 0, count = 0;
      allFunds.forEach(fund => {
        const val = Number(d[fund]);
        if (!isNaN(val) && val > 0) { totalNav += val; count++; }
      });
      const avg = count > 0 ? totalNav / count : null;
      return { ...d, "ภาพรวมพอร์ตลงทุน กบข.": avg };
    });

    if (!customMix || customMix.length === 0) return baseData;
    return baseData.map(d => {
      let mixValue = 0;
      customMix.forEach(m => {
        const rawValue = Number(d[m.fund]);
        if (!isNaN(rawValue)) mixValue += (rawValue * m.percentage) / 100;
      });
      return { ...d, "My Mix": mixValue };
    });
  }, [chartData, customMix, allFunds]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-xl z-50 text-slate-800 dark:text-white">
          <p className="font-semibold text-xs text-slate-500 dark:text-slate-400 mb-2">{label}</p>
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-4 mb-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{p.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-900 dark:text-white">{Number(p.value).toFixed(4)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <BrowserRouter>
      <div className={clsx(
        "min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200",
        "pt-20 md:pt-16 pb-20 md:pb-8"
      )}>
        <MobileHeader theme={theme} setTheme={setTheme} />
        <DesktopHeader 
          theme={theme} setTheme={setTheme} 
          latestData={latestData} formatThaiDate={formatThaiDate} 
        />
        
        <main className="max-w-[1200px] mx-auto px-4 md:px-6 pt-6 animate-in fade-in duration-500">
          <Routes>
            <Route path="/" element={
              loading ? (
                <div className="space-y-6">
                  <CardShimmer />
                  <CardShimmer />
                </div>
              ) : (
                <MarketOverview 
                  chartDataWithMix={chartDataWithMix} selectedFunds={selectedFunds} allFunds={allFunds}
                  latestData={latestData} previousData={previousData} theme={theme}
                  timeFilter={timeFilter} setTimeFilter={setTimeFilter} toggleFund={toggleFund}
                  customMix={customMix} formattedData={formattedData} lastSync={lastSync}
                  COLORS={COLORS} CustomTooltip={CustomTooltip}
                />
              )
            } />
            <Route path="/portfolio" element={
              <MyPortfolio latestData={latestData} allFunds={allFunds} theme={theme} />
            } />
            <Route path="/calculator" element={
              <div className="space-y-6 pb-20">
                 <AlertMessenger data={formattedData} allFunds={allFunds} />
                 <CustomMixBuilder allFunds={allFunds} onMixChange={setCustomMix} />
                 <DynamicHoldSimulator data={formattedData} allFunds={allFunds} customMix={customMix} />
              </div>
            } />
            <Route path="/profile" element={
              <ProfilePage user={user} logout={logout} signInWithGoogle={signInWithGoogle} />
            } />
          </Routes>
        </main>

        <MobileBottomNav />
      </div>
    </BrowserRouter>
  );
}

const COLORS = [
  '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#f97316', '#a855f7', '#14b8a6', '#fbbf24', '#f43f5e'
];

const formatThaiDate = (dateStr: string) => {
  try {
    if (!dateStr) return '...';
    const date = parseISO(dateStr);
    const day = format(date, 'd');
    const month = format(date, 'MMM', { locale: th });
    const year = parseInt(format(date, 'yyyy')) + 543;
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
};

const MobileHeader = ({ theme, setTheme }: any) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 md:hidden h-14 flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
         <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
           <TrendingUp className="w-5 h-5 text-white" />
         </div>
         <h1 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">GPF Insight</h1>
      </div>
      <button
        onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
      >
        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </button>
    </header>
  );
};

const ProfileMenu = ({ user, logout }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 pl-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95"
      >
        <div className="flex flex-col items-end pr-1">
          <span className="text-[10px] font-black text-slate-400 leading-none mb-0.5 uppercase">ตั้งค่า</span>
          <span className="text-[11px] font-black text-slate-800 dark:text-white leading-none truncate max-w-[80px]">
            {user.displayName?.split(' ')[0] || 'สมาชิก'}
          </span>
        </div>
        {user.photoURL ? (
          <img src={user.photoURL} alt="p" className="w-8 h-8 rounded-xl border border-white dark:border-slate-700 shadow-sm" />
        ) : (
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
            <UserIcon className="w-4 h-4" />
          </div>
        )}
        <ChevronDown className={clsx("w-4 h-4 text-slate-400 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] shadow-2xl overflow-hidden p-2"
          >
            <div className="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2" />
            
            <button 
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-2xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span>Log out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
const ProfilePage = ({ user, logout, signInWithGoogle }: any) => {
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-slate-100 dark:bg-slate-900 rounded-3xl flex items-center justify-center">
          <UserIcon className="w-10 h-10 text-slate-400" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">โปรไฟล์และบัญชี</h2>
          <p className="text-slate-500 max-w-xs mx-auto mt-2">เข้าสู่ระบบเพื่อบันทึกข้อมูลพอร์ตของคุณให้ปลอดภัยและเข้าถึงได้จากทุกอุปกรณ์</p>
        </div>
        <button 
          onClick={signInWithGoogle}
          className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-4 px-8 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-none active:scale-95 transition-all text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
            />
          </svg>
          เข้าสู่ระบบด้วยบัญชี Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 pb-20">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="relative">
             {user.photoURL ? (
               <img src={user.photoURL} alt="p" className="w-24 h-24 rounded-3xl border-4 border-emerald-500/20 shadow-xl" />
             ) : (
               <div className="w-24 h-24 rounded-3xl bg-emerald-600 flex items-center justify-center text-white shadow-xl">
                 <UserIcon className="w-10 h-10" />
               </div>
             )}
             <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-white dark:border-slate-900 flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-white" />
             </div>
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-800 dark:text-white">{user.displayName}</h2>
            <p className="text-sm font-bold text-slate-400">{user.email}</p>
          </div>
        </div>

        <div className="mt-10 space-y-3">
          <button 
            onClick={logout}
            className="w-full flex items-center justify-center gap-3 p-5 mt-6 bg-red-50 dark:bg-red-500/10 rounded-2xl border border-red-100 dark:border-red-500/20 text-red-600 font-black text-sm hover:bg-red-100 transition-all active:scale-95"
          >
             <LogOut className="w-5 h-5" />
             ออกจากระบบ
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-slate-800 to-slate-950 p-6 rounded-[32px] text-white">
         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Member Since</p>
         <p className="text-sm font-bold">{new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
      </div>
    </div>
  );
};
const DesktopHeader = ({ theme, setTheme, latestData, formatThaiDate }: any) => {
  const { pathname } = useLocation();
  const { user, signInWithGoogle, logout, loading: authLoading } = useAuth();
  
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 hidden md:block">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex justify-between items-center">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">GPF Insight</h1>
          </Link>
          
          <nav className="flex items-center gap-1">
            <Link 
              to="/" 
              className={clsx(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                pathname === '/' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              หน้าหลัก
            </Link>
            <Link 
              to="/portfolio" 
              className={clsx(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                pathname === '/portfolio' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              พอร์ตของฉัน
            </Link>
            <Link 
              to="/calculator" 
              className={clsx(
                "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                pathname === '/calculator' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              )}
            >
              เครื่องมือลงทุน
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right mr-2">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">อัปเดตข้อมูลประจำวัน</p>
            <p className="text-xs font-mono text-slate-600 dark:text-slate-300">
              {latestData ? formatThaiDate(latestData.date) : '...'}
            </p>
          </div>
          
          <a 
            href="https://tmn.app.link/dQ0mj5UIx2b" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs font-bold text-orange-600 bg-orange-100 hover:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30 px-3 py-2 rounded-xl transition-all border border-orange-200 dark:border-orange-500/30"
          >
            <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
              <Coffee className="w-3.5 h-3.5" />
            </div>
            เลี้ยงกาแฟ
          </a>

          {authLoading ? (
            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3 pl-2 border-l border-slate-100 dark:border-slate-800">
               <ProfileMenu user={user} logout={logout} />
            </div>
          ) : (
            <button 
              onClick={signInWithGoogle}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              เข้าสู่ระบบ
            </button>
          )}

          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};

  const MobileBottomNav = () => {
    const { pathname } = useLocation();
    
    return (
      <nav className="fixed bottom-6 left-4 right-4 z-[60] md:hidden">
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl border border-slate-200/50 dark:border-white/10 shadow-2xl shadow-emerald-500/10 rounded-[2rem] px-2 py-2 flex justify-between items-center relative overflow-hidden">
          <Link to="/" className={clsx(
            "flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors relative z-10",
            pathname === '/' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}>
            <Activity className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">หน้าหลัก</span>
            {pathname === '/' && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-x-1 inset-y-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-[1.8rem] -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Link>

          <Link to="/portfolio" className={clsx(
            "flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors relative z-10",
            pathname === '/portfolio' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}>
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">พอร์ต</span>
            {pathname === '/portfolio' && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-x-1 inset-y-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-[1.8rem] -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Link>

          <Link to="/calculator" className={clsx(
            "flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors relative z-10",
            pathname === '/calculator' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}>
            <Sparkles className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">เครื่องมือ</span>
            {pathname === '/calculator' && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-x-1 inset-y-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-[1.8rem] -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Link>

          <Link to="/profile" className={clsx(
            "flex-1 flex flex-col items-center gap-1.5 py-3 transition-colors relative z-10",
            pathname === '/profile' ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          )}>
            <UserIcon className="w-5 h-5" />
            <span className="text-[10px] font-black uppercase tracking-tighter">โปรไฟล์</span>
            {pathname === '/profile' && (
              <motion.div 
                layoutId="active-pill"
                className="absolute inset-x-1 inset-y-1 bg-emerald-50 dark:bg-emerald-500/10 rounded-[1.8rem] -z-10"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
          </Link>
        </div>
      </nav>
    );
  };
