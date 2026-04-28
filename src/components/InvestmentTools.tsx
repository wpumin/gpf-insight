import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart as PieChartIcon, 
  Settings2, 
  Plus, 
  Minus, 
  Bell, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingUp,
  Info,
  RefreshCcw,
  AreaChart as AreaChartIcon,
  Zap
} from 'lucide-react';
import { clsx } from 'clsx';

// --- Types ---
interface FundAllocation {
  fund: string;
  percentage: number;
}

interface AlertSignal {
  fund: string;
  type: 'PANIC' | 'SWITCH_ADVICE' | 'NEUTRAL';
  message: string;
  change: number;
  icon?: React.ReactNode;
}

// --- Custom Mix Builder Component ---
export const CustomMixBuilder = ({ 
  allFunds, 
  onMixChange,
  data = []
}: { 
  allFunds: string[], 
  onMixChange: (mix: FundAllocation[]) => void,
  data?: any[]
}) => {
  const [allocations, setAllocations] = useState<FundAllocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const totalPercentage = useMemo(() => 
    allocations.reduce((sum, a) => sum + a.percentage, 0)
  , [allocations]);

  const addFund = (fund: string) => {
    if (allocations.find(a => a.fund === fund)) return;
    setAllocations(prev => [...prev, { fund, percentage: 0 }]);
  };

  const removeFund = (fund: string) => {
    setAllocations(prev => prev.filter(a => a.fund !== fund));
  };

  const updatePercentage = (fund: string, value: number) => {
    setAllocations(prev => {
      const currentVal = prev.find(a => a.fund === fund)?.percentage || 0;
      const otherTotal = prev.reduce((sum, a) => sum + (a.fund !== fund ? a.percentage : 0), 0);
      
      const nextAllocations = [...prev];
      const targetIdx = nextAllocations.findIndex(a => a.fund === fund);
      
      if (value + otherTotal > 100) {
        // Simple cap for this simulator to keep it predictable for user testing
        nextAllocations[targetIdx] = { ...nextAllocations[targetIdx], percentage: 100 - otherTotal };
      } else {
        nextAllocations[targetIdx] = { ...nextAllocations[targetIdx], percentage: value };
      }
      
      return nextAllocations;
    });
  };

  useEffect(() => {
    if (totalPercentage === 100) {
      onMixChange(allocations);
    } else {
      onMixChange([]);
    }
  }, [allocations, totalPercentage, onMixChange]);

  const availableFunds = allFunds.filter(f => !allocations.find(a => a.fund === f));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-200 dark:border-slate-800 p-6 mt-4 overflow-hidden relative">
      {totalPercentage === 100 && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500 animate-pulse z-10" />
      )}
      
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl border border-indigo-100 dark:border-indigo-800 shrink-0">
            <PieChartIcon className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-200 tracking-tight truncate">GPF Strategy Simulator</h3>
              {totalPercentage === 100 && (
                <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[8px] font-black uppercase tracking-widest animate-pulse shrink-0">
                  Live
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">จำลองสัดส่วนพอร์ตผสมส่วนตัว</p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={clsx(
            "p-2.5 rounded-xl transition-all border shadow-sm shrink-0",
            isOpen ? "bg-indigo-600 text-white border-indigo-500" : "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/80"
          )}
        >
          <Settings2 className={clsx("w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300", isOpen && "rotate-180")} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-6"
          >
            <div className="space-y-3">
              {allocations.map((alloc) => (
                <div key={alloc.fund} className="flex flex-col gap-2 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/50 group">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 truncate pr-4">{alloc.fund}</p>
                    <button 
                      onClick={() => removeFund(alloc.fund)}
                      className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={alloc.percentage}
                      onChange={(e) => updatePercentage(alloc.fund, parseInt(e.target.value) || 0)}
                      className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                    <div className="w-12 text-right">
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{alloc.percentage}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {availableFunds.length > 0 && allocations.length < 5 && (
              <div className="relative group">
                <select 
                  onChange={(e) => {
                    if (e.target.value) addFund(e.target.value);
                    e.target.value = "";
                  }}
                  className="w-full bg-indigo-50/50 dark:bg-indigo-900/10 border-2 border-dashed border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-4 text-[11px] font-black text-indigo-500 uppercase tracking-widest appearance-none cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-400 transition-all text-center"
                >
                  <option value="">+ เพิ่มกองทุนในพอร์ตจำลอง</option>
                  {availableFunds.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-3 p-5 bg-slate-900 dark:bg-black rounded-3xl border border-slate-800 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">สัดส่วนรวมพอร์ตจำลอง (Total)</span>
                <span className={clsx(
                  "text-lg font-black",
                  totalPercentage === 100 ? "text-emerald-400" : "text-amber-400"
                )}>
                  {totalPercentage}%
                </span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, totalPercentage)}%` }}
                  className={clsx(
                    "h-full transition-all duration-500",
                    totalPercentage === 100 ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
              </div>
              {totalPercentage !== 100 ? (
                <p className="text-[10px] text-amber-500/80 font-bold flex items-center justify-center gap-1 mt-1 animate-pulse">
                  <AlertCircle className="w-3 h-3" /> กรุณาปรับให้ครบ 100% เพื่อประมวลผล
                </p>
              ) : (
                <div className="mt-4 animate-in fade-in zoom-in duration-500">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                     <p className="text-[11px] text-emerald-400 font-bold leading-relaxed flex items-start gap-2">
                       <Zap className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                       เมื่อสัดส่วนครบ 100% ข้อมูลจำลองนี้จะถูกส่งไปแสดงผลเปรียบเทียบในกราฟราคา NAV ที่หน้าหลักโดยอัตโนมัติ (เป็นเส้นประ "My Mix")
                     </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Alert Messenger Component ---
export const AlertMessenger = ({ data, allFunds }: { data: any[], allFunds: string[] }) => {
  const [visibleCount, setVisibleCount] = useState(2);

  const signals = useMemo(() => {
    if (data.length < 15) return [];

    const latest = data[data.length - 1];
    const weekAgo = data[data.length - 7] || data[0];
    const monthAgo = data[data.length - 21] || data[0];

    const results: AlertSignal[] = [];

    // Find the best trending safe and risk assets for dynamic comparison
    const perfs = allFunds.map(f => {
      const cur = Number(latest[f]);
      const prev = Number(weekAgo[f]);
      return { fund: f, diff: ((cur - prev) / prev) * 100 };
    }).sort((a,b) => b.diff - a.diff);

    const bestFund = perfs[0];
    const safestFund = perfs.find(p => p.fund.includes('ตราสารหนี้') || p.fund.includes('เงินฝาก')) || perfs[perfs.length-1];

    allFunds.forEach(fund => {
      const cur = Number(latest[fund]);
      const lastWeek = Number(weekAgo[fund]);
      const lastMonth = Number(monthAgo[fund]);

      if (isNaN(cur) || isNaN(lastWeek)) return;

      const weekChange = ((cur - lastWeek) / lastWeek) * 100;
      const monthChange = ((cur - lastMonth) / lastMonth) * 100;

      // Logic: Advice on switching due to downtrend/volatility
      if (weekChange < -1.5) {
        results.push({
          fund,
          type: 'PANIC',
          message: `สภาวะผันผวน! ${fund} ย่อตัวลงต่อเนื่อง (${weekChange.toFixed(2)}%) จากปัจจัยมหภาคและแรงขายทำกำไรในตลาดโลก พิจารณาสับเปลี่ยนบางส่วนเข้า "${safestFund.fund}" เพื่อลดความเสี่ยงเฉพาะหน้า`,
          change: weekChange,
          icon: <ArrowDownRight className="w-5 h-5 text-red-600 dark:text-red-400" />
        });
      }

      // Logic: Advice on switching to lock momentum or rebalance after gain
      if (monthChange > 3.5) {
        results.push({
          fund,
          type: 'SWITCH_ADVICE',
          message: `โอกาสปรับพอร์ต! ${fund} เติบโตแข็งแกร่งถึง ${monthChange.toFixed(2)}% ในเดือนนี้ จากกระแส Risk-on ทั่วโลก แนะนำพิจารณาสับเปลี่ยนกำไรบางส่วนเข้าแผนอื่นๆ เพื่อรักษาสมดุลพอร์ตของท่าน`,
          change: monthChange,
          icon: <RefreshCcw className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        });
      }
    });

    return results;
  }, [data, allFunds]);

  if (signals.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-[20px] p-5 border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-3 opacity-60">
        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
        <p className="text-xs font-bold text-slate-500">สภาวะตลาดปกติ ยังไม่มีสัญญาณแจ้งเตือนสับเปลี่ยนแผน</p>
      </div>
    );
  }

  const displayedSignals = signals.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-2">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-indigo-500" />
          <h3 className="text-base font-black text-slate-800 dark:text-slate-200 tracking-tight">AI Strategy Signals</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700/50 shadow-sm">Daily Intelligence Update</span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AnimatePresence mode="popLayout">
          {displayedSignals.map((signal, idx) => (
            <motion.div
              key={`${signal.fund}-${idx}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={clsx(
                "p-6 rounded-[32px] border transition-all duration-300 flex gap-4 items-start shadow-sm hover:shadow-md",
                signal.type === 'PANIC' 
                  ? "bg-white dark:bg-slate-900 border-red-100 dark:border-red-900/30" 
                  : "bg-white dark:bg-slate-900 border-emerald-100 dark:border-emerald-900/30"
              )}
            >
              <div className={clsx(
                "shrink-0 p-3 rounded-2xl shadow-sm border",
                signal.type === 'PANIC' 
                  ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50" 
                  : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50"
              )}>
                {signal.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <span className={clsx(
                    "text-[9px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full shadow-sm",
                    signal.type === 'PANIC' ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
                  )}>
                    {signal.type === 'PANIC' ? 'Action Recommended' : 'Momentum Insight'}
                  </span>
                  <span className={clsx(
                    "text-xs font-black",
                    signal.change >= 0 ? "text-emerald-500" : "text-red-500"
                  )}>
                    {(signal.change >= 0 ? '+' : '')}{signal.change.toFixed(2)}%
                  </span>
                </div>
                <p className="text-sm font-bold leading-relaxed text-slate-800 dark:text-slate-100">
                  {signal.message}
                </p>
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{signal.fund}</p>
                   <ArrowUpRight className="w-4 h-4 text-slate-300" />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {visibleCount < signals.length && (
        <button 
          onClick={() => setVisibleCount(prev => prev + 2)}
          className="w-full py-4 text-xs font-black text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-900 rounded-3xl transition-all border border-slate-200 dark:border-slate-800/80 shadow-sm hover:shadow-md hover:border-indigo-200"
        >
          วิเคราะห์สัญญาณเพิ่มเติม ({signals.length - visibleCount})
        </button>
      )}
    </div>
  );
};
