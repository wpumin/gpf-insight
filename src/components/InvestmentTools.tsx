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
  RefreshCcw
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
  onMixChange 
}: { 
  allFunds: string[], 
  onMixChange: (mix: FundAllocation[]) => void 
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
    setAllocations(prev => prev.map(a => 
      a.fund === fund ? { ...a, percentage: Math.max(0, Math.min(100, value)) } : a
    ));
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
    <div className="bg-white dark:bg-slate-900 rounded-[20px] shadow-sm border border-slate-200 dark:border-slate-800 p-5 mt-4 overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <PieChartIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Custom Portfolio Mix</h3>
            <p className="text-[11px] text-slate-500 font-medium">จำลองพอร์ตที่ผสมสัดส่วนด้วยตัวเอง (รวมให้ครบ 100%)</p>
          </div>
        </div>
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
        >
          <Settings2 className={clsx("w-5 h-5 text-slate-400 transition-transform", isOpen && "rotate-90")} />
        </button>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3">
              {allocations.map((alloc) => (
                <div key={alloc.fund} className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{alloc.fund}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={alloc.percentage}
                      onChange={(e) => updatePercentage(alloc.fund, parseInt(e.target.value) || 0)}
                      className="w-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 text-center text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <span className="text-xs font-bold text-slate-400">%</span>
                    <button 
                      onClick={() => removeFund(alloc.fund)}
                      className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition-colors"
                    >
                      <Plus className="w-4 h-4 rotate-45" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {availableFunds.length > 0 && (
              <div className="relative group">
                <select 
                  onChange={(e) => {
                    if (e.target.value) addFund(e.target.value);
                    e.target.value = "";
                  }}
                  className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-bold text-slate-500 appearance-none cursor-pointer hover:border-indigo-400 transition-colors"
                >
                  <option value="">+ เพิ่มแผนการลงทุนในพอร์ตผสม...</option>
                  {availableFunds.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Plus className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/50">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">สัดส่วนรวม</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={clsx(
                      "h-full transition-all duration-500",
                      totalPercentage === 100 ? "bg-emerald-500" : "bg-orange-500"
                    )}
                    style={{ width: `${Math.min(100, totalPercentage)}%` }}
                  />
                </div>
                <span className={clsx("text-xs font-black", totalPercentage === 100 ? "text-emerald-600" : "text-orange-600")}>
                  {totalPercentage}%
                </span>
              </div>
            </div>

            {totalPercentage !== 100 && (
              <p className="text-[10px] text-orange-500 font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> กรุณาปรับสัดส่วนรวมให้เท่ากับ 100% เพื่อแสดงกราฟ
              </p>
            )}
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
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-500" />
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">Market Strategy Alerts</h3>
        </div>
        <span className="text-[10px] text-slate-400 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">อัปเดตรายวัน</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AnimatePresence mode="popLayout">
          {displayedSignals.map((signal, idx) => (
            <motion.div
              key={`${signal.fund}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={clsx(
                "p-4 rounded-2xl border transition-all duration-200 flex gap-3 items-start shadow-sm",
                signal.type === 'PANIC' 
                  ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50" 
                  : "bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50"
              )}
            >
              <div className={clsx(
                "shrink-0 p-2 rounded-lg",
                signal.type === 'PANIC' ? "bg-red-100 dark:bg-red-900/30" : "bg-emerald-100 dark:bg-emerald-900/30"
              )}>
                {signal.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={clsx(
                    "text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm",
                    signal.type === 'PANIC' ? "bg-red-600 text-white" : "bg-emerald-600 text-white"
                  )}>
                    {signal.type === 'PANIC' ? 'คำเตือนการสับเปลี่ยน' : 'คำแนะนำกลยุทธ์'}
                  </span>
                  <span className="text-[10px] font-black text-slate-500">{(signal.change >= 0 ? '+' : '')}{signal.change.toFixed(2)}%</span>
                </div>
                <p className="text-[12px] font-bold leading-relaxed text-slate-800 dark:text-slate-100">
                  {signal.message}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {visibleCount < signals.length && (
        <button 
          onClick={() => setVisibleCount(prev => prev + 2)}
          className="w-full py-2.5 mt-1 text-[11px] font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/60 rounded-xl transition-all border border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600"
        >
          แสดงสัญญาณเพิ่มเติม ({signals.length - visibleCount})
        </button>
      )}
    </div>
  );
};
