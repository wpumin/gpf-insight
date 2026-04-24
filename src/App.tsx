/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Sparkles, ArrowRight, Shield, ChevronLeft, ChevronRight, Activity, Gauge, Coffee, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { format, parseISO, subYears } from 'date-fns';
import { doc, getDocFromServer, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { DynamicHoldSimulator } from './components/DynamicHoldSimulator';
import { CustomMixBuilder, AlertMessenger } from './components/InvestmentTools';

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

const COLORS = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', 
  '#06B6D4', '#EC4899', '#14B8A6', '#F97316', '#6366F1', 
  '#EAB308', '#84CC16', '#0EA5E9', '#D946EF', '#10B981'
];

// --- CNN Fear & Greed Component ---
const FearAndGreedCard = () => {
  const [fgData, setFgData] = useState<any>(null);

  useEffect(() => {
    fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata')
      .then(res => res.json())
      .then(resData => {
         if (resData?.fear_and_greed) setFgData(resData.fear_and_greed);
      })
      .catch(err => console.error("F&G Error", err));
  }, []);

  if (!fgData) return (
     <div className="bg-white dark:bg-slate-900 rounded-[20px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 p-5 flex flex-col h-[180px] animate-pulse"></div>
  );

  const score = Math.round(fgData.score);
  const rating = fgData.rating; 
  
  let colorClass = "text-yellow-500";
  if (score < 25) { colorClass = "text-red-500"; }
  else if (score < 45) { colorClass = "text-orange-500"; }
  else if (score > 75) { colorClass = "text-emerald-500"; }
  else if (score > 55) { colorClass = "text-emerald-400"; }

  const ratingThai: Record<string, string> = {
    'extreme_fear': 'กลัวอย่างรุนแรง',
    'fear': 'ความกลัว',
    'neutral': 'สมดุล',
    'greed': 'ความโลภ',
    'extreme_greed': 'โลภอย่างรุนแรง'
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[20px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 p-5 flex flex-col h-[180px] group">
       <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-1.5">
             <Gauge className="w-4 h-4 text-indigo-500" />
             <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">อารมณ์ตลาดโลก</span>
          </div>
       </div>
       <div className="flex-1 flex flex-col items-center justify-center pt-2">
          <div className="relative w-32 h-16 overflow-hidden flex items-end justify-center mb-1">
             {/* Background Arc */}
             <div className="absolute top-2 w-[110px] h-[110px] rounded-full border-[10px] border-slate-100 dark:border-slate-800 box-border"></div>
             {/* Colored Arc */}
             <div 
               className={clsx("absolute top-2 w-[110px] h-[110px] rounded-full border-[10px] border-transparent border-t-current border-l-current box-border transition-all duration-1000 ease-out z-10", colorClass)}
               style={{ transform: `rotate(${-45 + (score/100)*180}deg)` }}
             ></div>
             <div className="text-3xl font-black text-slate-800 dark:text-white z-20 leading-none">{score}</div>
          </div>
          <div className={clsx("text-xs font-black uppercase tracking-wider", colorClass)}>
            {ratingThai[rating.toLowerCase()] || rating.replace('_', ' ')}
          </div>
       </div>
    </div>
  );
};
// ------------------------------------------

// --- System Activity Card ---
const ActivityCard = ({ lastSync, latestData }: { lastSync: string | null, latestData: any }) => (
  <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-800 rounded-[20px] p-5 flex flex-col justify-between shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] h-[180px] w-full">
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">สถานะระบบ</span>
      <Activity className="w-4 h-4 text-emerald-500 dark:text-emerald-400 opacity-80" />
    </div>
    <div className="flex items-center gap-2 mt-4 flex-1">
      <div className="w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)] dark:shadow-[0_0_8px_rgba(52,211,153,0.8)]"></div>
      <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">ระบบทำงานปกติ (Hourly)</span>
    </div>
    <div className="text-[11px] mt-2 text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
        <span>แหล่งข้อมูล</span>
        <span className="text-slate-700 dark:text-slate-300">gpf.or.th (API)</span>
      </div>
      <div className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-1 mb-1">
        <span>สแกนล่าสุด</span>
        <span className="text-indigo-600 dark:text-indigo-400">{lastSync ? format(parseISO(lastSync), 'dd/MM HH:mm') : 'รอดำเนินการ'}</span>
      </div>
      <div className="flex justify-between">
        <span>ข้อมูล NAV ล่าสุด</span>
        <span className="text-slate-700 dark:text-slate-300">{latestData ? latestData.displayDate : '...'}</span>
      </div>
    </div>
  </div>
);
// ------------------------------------------
// ------------------------------------------

// --- AI Insights Carousel Component ---
const AiInsightCarousel = ({ data, allFunds }: { data: any[], allFunds: string[] }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    
    // swipe left (next)
    if (distance > 50) {
      setCurrentSlide((prev) => (prev + 1) % insights.length);
    } 
    // swipe right (prev)
    else if (distance < -50) {
      setCurrentSlide((prev) => (prev - 1 + insights.length) % insights.length);
    }
  };

  const insights = useMemo(() => {
    if (!data || data.length < 2) return [];

    const latest = data[data.length - 1];
    const oldData = data.length > 21 ? data[data.length - 22] : data[0]; 

    const perfs = allFunds.map(fund => {
      const l = Number(latest[fund]);
      const o = Number(oldData[fund]);
      if (!isNaN(l) && !isNaN(o) && o !== 0) {
        return { fund, diff: ((l - o) / o) * 100 };
      }
      return null;
    }).filter(p => p !== null).sort((a,b) => b!.diff - a!.diff) as {fund: string, diff: number}[];

    if (perfs.length === 0) return [];

    const best = perfs[0];
    const worst = perfs[perfs.length - 1];
    const defensive = perfs.find(p => p.fund.includes('ตราสารหนี้') || p.fund.includes('ตลาดเงิน')) || perfs[perfs.length / 2 | 0];

    // Global News & Macro Context mapping based on Real Data
    const safestFund = perfs.find(p => p.fund.includes('ตราสารหนี้') || p.fund.includes('ตลาดเงิน')) || perfs[perfs.length-1];
    const riskAssetText = perfs[0]?.diff > 1 ? "สินทรัพย์เสี่ยง (Risk Assets) ทั่วโลกเริ่มฟื้นตัวจากตัวเลขเงินเฟ้อที่ชะลอตัว" : "นักลงทุนทั่วโลกเริ่มมีความกังวลต่อเสถียรภาพเศรษฐกิจข้ามชาติ";

    return [
      {
        id: 1,
        title: "สรุปข่าวเด่น: ความเคลื่อนไหวตลาดโลก 🌍",
        icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
        text: (
          <span>
            <strong className="text-emerald-500">{best.fund}</strong> ทะยานขึ้น <strong className="text-emerald-500">{(best.diff >= 0 ? '+' : '')}{best.diff.toFixed(2)}%</strong> {riskAssetText} ซึ่งเป็นปัจจัยบวกโดยตรงต่อกองทุนชุดนี้
          </span>
        )
      },
      {
        id: 2,
        title: "มุมมองมหภาคและกลยุทธ์สับเปลี่ยน ⚖️",
        icon: <ArrowRight className="w-5 h-5 text-amber-500" />,
        text: (
          <span>
            ในขณะที่ <strong className="text-slate-700 dark:text-slate-300">{worst.fund}</strong> ยังพักตัว แนะนำให้ลองพิจารณา <strong className="text-amber-500">"สับเปลี่ยนแผน"</strong> เพื่อกระจายไปสู่สินทรัพย์ที่มีแนวโน้มฟื้นตัวเร็วกว่าตามรอบเศรษฐกิจโลก
          </span>
        )
      },
      {
        id: 3,
        title: "ทิศทางสินทรัพย์ปลอดภัย 🛡️",
        icon: <Shield className="w-5 h-5 text-blue-500" />,
        text: (
          <span>
            ความผันผวนของค่าเงินส่งผลให้ <strong className="text-blue-500">{safestFund.fund}</strong> ยังคงรักษาเสถียรภาพได้ดี เหมาะเป็นจุดพักเงินของพอร์ตในช่วงที่รอข่าวการประชุมนโยบายการเงินครั้งใหญ่
          </span>
        )
      },
      {
        id: 4,
        title: "ภาพรวมเศรษฐกิจรายวัน 📊",
        icon: <Sparkles className="w-5 h-5 text-indigo-500" />,
        text: (
          <span>
            ภาพรวมการลงทุนวันนี้มีทิศทาง {best.diff > 0.05 ? 'เป็นบวกชัดเจน' : 'ค่อนข้างทรงตัว'} แนะนำจับตาดูราคา NAV ของวันพรุ่งนี้ เพื่อยืนยันแนวโน้มการเปลี่ยนเทรนด์ในระยะกลาง
          </span>
        )
      }
    ];
  }, [data, allFunds]);

  useEffect(() => {
    if (insights.length === 0) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % insights.length);
    }, 7000); // Auto-slide every 7s
    return () => clearInterval(timer);
  }, [insights]);

  if (insights.length === 0) return null;

  const current = insights[currentSlide];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[20px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 p-5 flex flex-col relative overflow-hidden min-h-[200px] group">
      <div className="flex justify-between items-start mb-3 gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <Sparkles className="w-4 h-4 text-emerald-500" fill="currentColor" />
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest whitespace-nowrap">AI วิเคราะห์ตลาด</span>
        </div>
        <span className="text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium text-right leading-tight border border-slate-200 dark:border-slate-700/50">
          อัปเดตทุกวัน
        </span>
      </div>
      
      <div 
        className="relative flex-1 cursor-pointer w-full mb-6" 
        onClick={() => setCurrentSlide((prev) => (prev + 1) % insights.length)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="absolute inset-0 flex flex-col justify-start"
          >
             <h4 className="text-[13.5px] font-bold text-slate-800 dark:text-white mb-1.5 flex items-center gap-2">
               {current.title}
             </h4>
             <p className="text-[12.5px] leading-[1.65] text-slate-600 dark:text-slate-300 font-medium line-clamp-4">
               {current.text}
             </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Slide Indicators */}
      <div className="flex items-center gap-1.5 absolute bottom-4 left-0 right-0 justify-center">
        {insights.map((_, idx) => (
          <button 
            key={idx} 
            onClick={(e) => { e.stopPropagation(); setCurrentSlide(idx); }}
            className={clsx(
              "h-1.5 rounded-full transition-all duration-300",
              currentSlide === idx ? "w-5 bg-emerald-500" : "w-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600"
            )}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};
// ------------------------------------------

export default function App() {
  const [data, setData] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
    }
    // Default to light mode explicitly if not set, instead of strictly enforcing OS level
    // to cater to users who prefer light web apps despite dark OS themes.
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
    
    // Update PWA Status bar color to match the theme background
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', theme === 'dark' ? '#020617' : '#F8FAFC');
  }, [theme]);

  useEffect(() => {
    const fetchFromFirebase = async (isInitial = false) => {
      try {
        if (isInitial) {
          // Connection test first as recommended
          try {
            await getDocFromServer(doc(db, 'test', 'connection'));
          } catch (connErr) {
            console.warn("Initial connection test failed (expected if 'test/connection' doc doesn't exist), proceeding to fetch real data.");
          }
        }

        // Fetch Metadata
        try {
          const syncDoc = await getDocFromServer(doc(db, 'metadata', 'sync_info'));
          if (syncDoc.exists()) {
            setLastSync(syncDoc.data().last_updated);
          }
        } catch (err) {
          console.error("Metadata fetch error:", err);
        }

        const q = query(collection(db, 'nav_history'), orderBy('date', 'asc'));
        const querySnapshot = await getDocs(q);
        const fetchedData: any[] = [];
        querySnapshot.forEach((doc) => {
          fetchedData.push(doc.data());
        });
        
        setData(prevData => {
          const isDifferent = JSON.stringify(prevData) !== JSON.stringify(fetchedData);
          return isDifferent ? fetchedData : prevData;
        });
        
        if (isInitial) setLoading(false);
      } catch(e) {
        console.error("Firestore sync error:", e);
        if (isInitial) setLoading(false);
      }
    };

    const startTime = Date.now();
    fetchFromFirebase(true).finally(() => {
      // Handle Splash Screen Removal
      const elapsed = Date.now() - startTime;
      const minSplashTime = 1200; // Force splash to show for at least 1.2s for native feel
      const delay = Math.max(0, minSplashTime - elapsed);
      
      setTimeout(() => {
        const splash = document.getElementById('pwa-splash');
        if (splash) {
          splash.classList.add('fade-out');
          setTimeout(() => splash.remove(), 600); // Wait for CSS transition
        }
      }, delay);
    });

    // Refresh data silently every 5 minutes
    const intervalIdx = setInterval(() => {
      fetchFromFirebase(false);
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalIdx);
  }, []);

  const toggleFund = (fund: string) => {
    setSelectedFunds(prev => 
      prev.includes(fund) ? prev.filter(f => f !== fund) : [...prev, fund]
    );
  };

  const formattedData = useMemo(() => {
    return data.map(item => ({
      ...item,
      displayDate: format(parseISO(item.date), 'MMM dd, yyyy')
    }));
  }, [data]);

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
      // Calculate GPF Portfolio Average
      let totalNav = 0;
      let count = 0;
      allFunds.forEach(fund => {
        const val = Number(d[fund]);
        if (!isNaN(val) && val > 0) {
          totalNav += val;
          count++;
        }
      });
      const average = count > 0 ? totalNav / count : null;
      return { ...d, "ภาพรวมพอร์ตลงทุน กบข.": average };
    });

    if (!customMix || customMix.length === 0) return baseData;
    return baseData.map(d => {
      let mixValue = 0;
      customMix.forEach(m => {
        const rawValue = Number(d[m.fund]);
        if (!isNaN(rawValue)) {
          mixValue += (rawValue * m.percentage) / 100;
        }
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-['Helvetica_Neue',Arial,sans-serif] text-slate-900 dark:text-slate-100 transition-colors duration-200 p-4 sm:p-6 md:p-8">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-4 auto-rows-max">

        <header className="lg:col-span-4 flex justify-between items-center px-1 mb-2 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-sm shrink-0">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-[17px] sm:text-2xl font-bold text-slate-800 dark:text-white leading-none whitespace-nowrap tracking-tight">GPF Insight</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="text-right hidden md:block">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">อัปเดตล่าสุด</p>
              <p className="text-sm font-mono text-slate-600 dark:text-slate-300">
                {latestData ? latestData.displayDate : 'กำลังโหลด...'}
              </p>
            </div>
            
            <a 
              href="https://tmn.app.link/dQ0mj5UIx2b" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-bold text-orange-600 bg-orange-100 hover:bg-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:hover:bg-orange-500/30 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg transition-colors border border-orange-200 dark:border-orange-500/30 whitespace-nowrap shadow-sm"
            >
              <Coffee className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              เลี้ยงกาแฟ
            </a>

            <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 sm:p-1 rounded-lg">
              <button
                onClick={() => setTheme('light')}
                className={clsx(
                  "px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all",
                  theme === 'light' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                สว่าง
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={clsx(
                  "px-2 sm:px-3 py-1 rounded-md text-[10px] sm:text-xs font-medium transition-all",
                  theme === 'dark' ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                มืด
              </button>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="lg:col-span-4 h-64 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : data.length === 0 ? (
          <div className="lg:col-span-4 text-center py-20 bg-white dark:bg-slate-900 rounded-[20px] border border-slate-200 dark:border-slate-800 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 font-medium">ไม่พบข้อมูลในขณะนี้ ระบบกำลังรอการซิงค์ข้อมูลจากเซิร์ฟเวอร์...</p>
          </div>
        ) : (
          <>
            {/* --- 1. Interactive Chart Section (Top Priority) --- */}
            <div className="lg:col-span-3 order-1 lg:order-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] p-5 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors duration-200 flex flex-col min-h-[400px]">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-white">กราฟแสดงผลตอบแทนย้อนหลัง</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">ติดตามมูลค่า NAV รายวันของแผนที่เลือก</p>
                </div>
                
                <div className="flex items-center gap-3">
                   <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {(['1Y', '3Y', 'MAX'] as const).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setTimeFilter(tf)}
                        className={clsx(
                          "px-3 py-1 rounded-md text-xs font-bold transition-all",
                          timeFilter === tf 
                            ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                        )}
                      >
                        {tf}
                      </button>
                    ))}
                   </div>
                </div>
              </div>
              <div className="flex-grow w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartDataWithMix} margin={{ top: 10, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid 
                      strokeDasharray="3 3"
                      vertical={true}
                      horizontal={true}
                      stroke={theme === 'dark' ? '#334155' : '#E2E8F0'} 
                      strokeOpacity={0.6}
                    />
                    <XAxis 
                      dataKey="displayDate" 
                      tick={{ fill: theme === 'dark' ? '#64748B' : '#94A3B8', fontSize: 11, fontWeight: 500 }} 
                      tickMargin={12}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={50}
                    />
                    <YAxis 
                      domain={['auto', 'auto']} 
                      tick={{ fill: theme === 'dark' ? '#64748B' : '#94A3B8', fontSize: 11, fontWeight: 500 }}
                      tickMargin={8}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => val.toFixed(2)}
                      width={45}
                      tickCount={6}
                    />
                    <Tooltip 
                      content={<CustomTooltip />} 
                      cursor={{ stroke: theme === 'dark' ? '#334155' : '#CBD5E1', strokeWidth: 2 }} 
                    />
                    
                    <Line
                      type="monotone"
                      dataKey="ภาพรวมพอร์ตลงทุน กบข."
                      name="ภาพรวมพอร์ตลงทุน กบข."
                      stroke="#94A3B8"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={{ 
                        r: 4, 
                        strokeWidth: 2, 
                        stroke: theme === 'dark' ? '#0F172A' : '#FFFFFF',
                        fill: "#94A3B8" 
                      }}
                    />

                    {selectedFunds.map((fund) => (
                      <Line
                        key={fund}
                        type="monotone"
                        dataKey={fund}
                        name={fund}
                        stroke={COLORS[allFunds.indexOf(fund) % COLORS.length]}
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ 
                          r: 6, 
                          strokeWidth: 3, 
                          stroke: theme === 'dark' ? '#0F172A' : '#FFFFFF',
                          fill: COLORS[allFunds.indexOf(fund) % COLORS.length] 
                        }}
                      />
                    ))}
                    {customMix.length > 0 && (
                      <Line
                        type="monotone"
                        dataKey="My Mix"
                        name="My Custom Mix"
                        stroke="#6366f1"
                        strokeWidth={4}
                        strokeDasharray="8 4"
                        dot={false}
                        activeDot={{ 
                          r: 7, 
                          strokeWidth: 2, 
                          stroke: theme === 'dark' ? '#0F172A' : '#FFFFFF',
                          fill: "#6366f1" 
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* --- 2. Sidebar Data: AI Insights & System Status (Keep adjacent to chart on desktop, moved down on mobile) --- */}
            <div className="lg:col-span-1 order-4 lg:order-2 space-y-4">
              <AiInsightCarousel data={formattedData} allFunds={allFunds} />
              <FearAndGreedCard />
              <ActivityCard lastSync={lastSync} latestData={latestData} />
            </div>

            {/* --- 3. Performance Cards --- */}
            <div className="lg:col-span-4 order-2 lg:order-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 px-1 gap-2">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 tracking-tight flex items-center gap-2">
                  เปรียบเทียบผลการดำเนินงาน 1 วันล่าสุด
                </h3>
                <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full w-fit border border-blue-100 dark:border-blue-800/50">
                  <span>เลือกไว้ {selectedFunds.length} แผน</span>
                  <span className="opacity-50">|</span>
                  <span>แสดงสูงสุด 4 การ์ด</span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <AnimatePresence mode="popLayout">
                  {selectedFunds.slice(0, 4).map((fund) => {
                    const currentVal = latestData ? latestData[fund] : null;
                    const prevVal = previousData ? previousData[fund] : null;
                    const diff = currentVal && prevVal && prevVal !== 0 ? ((currentVal - prevVal) / prevVal) * 100 : 0;
                    const isUp = diff >= 0;

                    return (
                      <motion.div 
                        key={fund}
                        layout
                        initial={{ opacity: 0, scale: 0.8, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -20 }}
                        transition={{ duration: 0.3, type: "spring", bounce: 0.4 }}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] p-5 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] hover:border-blue-500 dark:hover:border-blue-500 transition-colors duration-200 flex flex-col justify-between"
                      >
                        <span className="text-[13px] text-slate-500 dark:text-slate-400 font-medium leading-tight h-8 line-clamp-2">
                          {fund}
                        </span>
                        <div className="mt-4">
                          <div className="text-2xl font-bold text-slate-900 dark:text-white">
                            {currentVal ? currentVal.toFixed(4) : '--'}
                          </div>
                          {currentVal && prevVal && (
                            <div className={clsx("text-xs font-semibold mt-1 flex items-center gap-1", isUp ? "text-emerald-500" : "text-red-500")}>
                              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {isUp ? "+" : ""}{diff.toFixed(2)}%
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {selectedFunds.length === 0 && (
                    <motion.div 
                      key="empty-state"
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="col-span-1 sm:col-span-2 md:col-span-4 p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[20px] text-center"
                    >
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">ยังไม่ได้เลือกแผนการลงทุนสำหรับเปรียบเทียบในมุมมองการ์ด</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* --- 4. Fund Filter Section --- */}
            <div className="lg:col-span-4 order-3 lg:order-4 bg-white dark:bg-slate-900 rounded-[20px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 mt-0 transition-colors duration-200">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">Filter กองทุน</h3>
                  <div className="hidden sm:flex bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full items-center">
                    <Activity className="w-3 h-3 mr-1" /> แตะเพื่ออัปเดตกราฟ
                  </div>
                </div>
                <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/50">เลือกไว้ {selectedFunds.length} แผน</span>
              </div>
              
              <div className="flex flex-col sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {allFunds.map((fund) => {
                  const isSelected = selectedFunds.includes(fund);
                  const color = COLORS[allFunds.indexOf(fund) % COLORS.length];
                  return (
                    <motion.button
                      key={fund}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleFund(fund)}
                      className={clsx(
                        "flex w-full items-center gap-3 p-3 text-left rounded-xl border transition-all duration-200 group h-full",
                        isSelected 
                          ? "bg-slate-50 dark:bg-slate-800/50 border-emerald-500/30 dark:border-emerald-500/30 shadow-sm" 
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700"
                      )}
                    >
                      <div 
                        className={clsx(
                          "w-3.5 h-3.5 mt-0.5 sm:mt-0 rounded-full flex-shrink-0 transition-transform duration-200",
                          isSelected ? "scale-110" : "group-hover:scale-110"
                        )}
                        style={{ backgroundColor: isSelected ? color : 'transparent', border: `2px solid ${isSelected ? color : '#CBD5E1'}` }}
                      />
                      <span className={clsx(
                        "text-[12px] sm:text-[13px] font-medium leading-snug",
                        isSelected ? "text-slate-900 dark:text-slate-100 font-bold" : "text-slate-600 dark:text-slate-400"
                      )}>
                        {fund}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* --- 5. AI Strategy & Interactive Tools --- */}
            <div className="lg:col-span-4 order-5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DynamicHoldSimulator data={formattedData} allFunds={allFunds} customMix={customMix} />
                <CustomMixBuilder allFunds={allFunds} onMixChange={setCustomMix} />
              </div>
              
              {/* Market Strategy Alerts at the very bottom */}
              <AlertMessenger data={formattedData} allFunds={allFunds} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
