import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Sparkles, 
  Gauge,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const formatThaiDateTime = (dateStr: string) => {
  try {
    const date = parseISO(dateStr);
    const day = format(date, 'd');
    const month = format(date, 'MMM', { locale: th });
    const year = (parseInt(format(date, 'yyyy')) + 543).toString();
    const time = format(date, 'HH:mm');
    return `${day} ${month} ${year} ${time} น.`;
  } catch {
    return dateStr;
  }
};

export const FearAndGreedCard = () => {
    const [score, setScore] = useState<number | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [source, setSource] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
  
    useEffect(() => {
      const fetchData = async () => {
        try {
          const now = Date.now();
          const LAST_FETCH_KEY = 'gpf_fng_last_fetch';
          const lastFetch = localStorage.getItem(LAST_FETCH_KEY);
          
          if (lastFetch && (now - parseInt(lastFetch) < 3600000)) {
            const cached = localStorage.getItem('gpf_fng_cache');
            if (cached) {
              const data = JSON.parse(cached);
              setScore(data.score);
              setLastUpdated(data.last_updated);
              setSource(data.source);
              setLoading(false);
              return;
            }
          }

          const { getDoc, doc } = await import('firebase/firestore');
          const snap = await getDoc(doc(db, 'market_indices', 'fng'));
          if (snap.exists()) {
            const data = snap.data();
            const scoreVal = data.value ?? data.score ?? 0;
            setScore(scoreVal);
            setLastUpdated(data.last_updated || null);
            setSource(data.source || 'CNN Business');
            
            localStorage.setItem('gpf_fng_cache', JSON.stringify({
              score: scoreVal,
              last_updated: data.last_updated,
              source: data.source
            }));
            localStorage.setItem(LAST_FETCH_KEY, now.toString());
          }
          setLoading(false);
        } catch (error) {
          console.error("F&G fetch error:", error);
          setLoading(false);
        }
      };

      fetchData();
      const interval = setInterval(fetchData, 3600000);
      return () => clearInterval(interval);
    }, []);
  
    const getSentiment = (val: number) => {
      if (val < 25) return { text: 'Extreme Fear', color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-950/30', stroke: 'stroke-rose-500' };
      if (val < 45) return { text: 'Fear', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30', stroke: 'stroke-amber-500' };
      if (val < 55) return { text: 'Neutral', color: 'text-slate-500', bg: 'bg-slate-50 dark:bg-slate-900/50', stroke: 'stroke-slate-400' };
      if (val < 75) return { text: 'Greed', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30', stroke: 'stroke-emerald-500' };
      return { text: 'Extreme Greed', color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/30', stroke: 'stroke-cyan-500' };
    };
  
    const sentiment = score !== null ? getSentiment(score) : { text: 'Loading...', color: 'text-slate-400', bg: 'bg-slate-100' };
  
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[24px] p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-indigo-500" />
            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest leading-none">Fear & Greed Index</h3>
          </div>
          {lastUpdated && (
            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold uppercase">
              <Clock className="w-3 h-3" />
              <span>{format(parseISO(lastUpdated), 'HH:mm')}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center justify-center py-2">
          <div className="relative w-40 h-20 flex items-center justify-center mb-4">
            <svg viewBox="0 0 100 55" className="w-full h-full overflow-visible">
              {/* Background Arc */}
              <path 
                d="M 10 50 A 40 40 0 0 1 90 50" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="10" 
                className="text-slate-100 dark:text-slate-800" 
                strokeLinecap="round"
              />
              {/* Progress Arc */}
              <motion.path 
                initial={{ strokeDashoffset: 125.66 }}
                animate={{ strokeDashoffset: 125.66 - (125.66 * (score || 0)) / 100 }}
                d="M 10 50 A 40 40 0 0 1 90 50" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="10" 
                strokeLinecap="round"
                className={clsx("transition-all duration-1000", (sentiment as any).stroke || "stroke-indigo-500")}
                strokeDasharray="125.66"
              />
            </svg>
            <div className="absolute inset-x-0 bottom-[-2px] flex flex-col items-center">
              <span className="text-3xl font-black text-slate-800 dark:text-white leading-none tracking-tighter">{score || '--'}</span>
            </div>
          </div>
          
          <div className={clsx("text-xs font-black px-4 py-1.5 rounded-xl uppercase tracking-widest shadow-lg", sentiment.bg, sentiment.color)}>
            {sentiment.text}
          </div>
        </div>
      </div>
    );
};
  
export const AiInsightCarousel = ({ data, allFunds }: any) => {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
  
    const insights = useMemo(() => {
      if (!data || data.length < 5) return [];
      const latest = data[data.length - 1];
      const prev = data[data.length - 2];
      const sortedFunds = [...allFunds].sort((a, b) => {
        const diffA = (latest[a] - prev[a]) / prev[a];
        const diffB = (latest[b] - prev[b]) / prev[b];
        return diffB - diffA;
      });
  
      return [
        { title: 'ดาวเด่นประจำวัน', text: `วันนี้ ${sortedFunds[0]} ทำผลงานได้ดีที่สุดในบรรดากองทุนทั้งหมด โดยมีระดับราคาที่ปรับตัวขึ้นอย่างโดดเด่น`, type: 'bull' },
        { title: 'กลยุทธ์แนะนำ', text: 'ช่วงนี้ตลาดมีความผันผวน การกระจายการลงทุนในแผนที่มีสินทรัพย์มั่นคงสูงจะช่วยลดความเสี่ยงของพอร์ตได้ดีขึ้น', type: 'strategy' },
        { title: 'ภาพรวมเทรนด์', text: 'แนวโน้ม NAV โดยรวมของ กบข. ในช่วงเดือนที่ผ่านมายังคงอยู่ในทิศทางบวก สะท้อนถึงการฟื้นตัวของตลาดทุน', type: 'trend' }
      ];
    }, [data, allFunds]);
  
    useEffect(() => {
      if (isPaused) return;
      const timer = setInterval(() => setCurrentSlide(s => (s + 1) % insights.length), 6000);
      return () => clearInterval(timer);
    }, [insights.length, isPaused]);
  
    if (!insights.length) return null;
  
    const current = insights[currentSlide];
  
    return (
      <div 
        className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/30 rounded-[20px] p-5 relative overflow-hidden h-[180px]"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={() => setIsPaused(true)}
        onTouchEnd={() => setIsPaused(false)}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">AI Market Analysis</span>
        </div>
  
        <div className="relative h-24 touch-pan-y">
          <AnimatePresence mode="wait">
            <motion.div 
              key={currentSlide}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={(_, info) => {
                const threshold = 50;
                if (info.offset.x > threshold) {
                  setCurrentSlide(s => (s - 1 + insights.length) % insights.length);
                } else if (info.offset.x < -threshold) {
                  setCurrentSlide(s => (s + 1) % insights.length);
                }
              }}
              className="absolute inset-0 flex flex-col justify-start cursor-grab active:cursor-grabbing select-none"
            >
               <h4 className="text-[13.5px] font-bold text-slate-800 dark:text-white mb-1.5 flex items-center gap-2">
                 {current.title}
               </h4>
               <p className="text-[12.5px] leading-[1.65] text-slate-600 dark:text-slate-300 font-medium line-clamp-4 pointer-events-none">
                 {current.text}
               </p>
            </motion.div>
          </AnimatePresence>
        </div>
  
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
  
export const ActivityCard = ({ lastSync, latestData }: any) => {
    const isOnline = !!latestData;
    
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">System Status</h3>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Live</span>
          </div>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">อัปเดตข้อมูลประจำวัน</p>
              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                {lastSync ? formatThaiDateTime(lastSync) : '--'}
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className={clsx(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              isOnline ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"
            )}>
              {isOnline ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-tight">การเชื่อมต่อ</p>
              <p className={clsx("text-[11px] font-bold", isOnline ? "text-emerald-500" : "text-red-500")}>
                {isOnline ? 'เสถียร (Firestore)' : 'ขาดการติดต่อ'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
};
