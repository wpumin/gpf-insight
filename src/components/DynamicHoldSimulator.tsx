import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, ArrowRight, TrendingUp, ShieldCheck, Activity, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';

export const DynamicHoldSimulator = ({ data, allFunds, customMix = [] }: { data: any[], allFunds: string[], customMix?: any[] }) => {
  const [selectedFund, setSelectedFund] = useState<string>('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const performAnalysis = (fund: string) => {
    setAnalyzing(true);
    setResult(null);
    
    setTimeout(() => {
      if (!data || data.length < 30) {
        setAnalyzing(false);
        return;
      }
      const latest = data[data.length - 1];
      const monthAgo = data[data.length - 30] || data[0];
      
      let currentPerf = 0;
      let displayFundName = fund;

      if (fund === 'MY_CUSTOM_MIX') {
        displayFundName = 'พอร์ตผสมส่วนตัวของท่าน';
        let latestVal = 0;
        let monthAgoVal = 0;
        customMix.forEach(m => {
          const l = Number(latest[m.fund]);
          const mo = Number(monthAgo[m.fund]);
          if (!isNaN(l) && !isNaN(mo)) {
            latestVal += (l * m.percentage) / 100;
            monthAgoVal += (mo * m.percentage) / 100;
          }
        });
        currentPerf = monthAgoVal !== 0 ? ((latestVal - monthAgoVal) / monthAgoVal) * 100 : 0;
      } else {
        currentPerf = ((Number(latest[fund]) - Number(monthAgo[fund])) / Number(monthAgo[fund])) * 100;
      }
      
      // Calculate best alternative
      let bestAlt = '';
      let bestPerf = -999;
      allFunds.forEach(f => {
        if (f !== fund) {
          const perf = ((Number(latest[f]) - Number(monthAgo[f])) / Number(monthAgo[f])) * 100;
          if (perf > bestPerf) {
            bestPerf = perf;
            bestAlt = f;
          }
        }
      });

      let recommendation = '';
      let action = '';
      let icon = null;
      let colorClass = '';

      if (currentPerf > 1.5) {
        action = 'HOLD';
        recommendation = `กองทุน ${displayFundName} มีโมเมนตัมกราฟขาขึ้นที่แข็งแกร่ง (Strong Uptrend) จากปัจจัยมหภาคในปัจจุบัน แนะนำให้ "ถือต่อ" เพื่อรันเทรนด์กำไร ไม่มีความจำเป็นต้องสับเปลี่ยนในระยะสั้น`;
        icon = <TrendingUp className="w-8 h-8 text-emerald-500" />;
        colorClass = 'text-emerald-500 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10';
      } else if (currentPerf < -1.0) {
         action = 'SWITCH';
         recommendation = `แนวโน้มราคามีการย่อตัวต่อเนื่องและมีความผันผวนสูง (Downside Risk) สำหรับ ${displayFundName} หากรับความเสี่ยงไม่ได้ แนะนำให้พิจารณาสับเปลี่ยนไปยัง "${bestAlt}" ซึ่งมีผลตอบแทนย้อนหลัง 1 เดือนที่แข็งแกร่งและน่าสนใจกว่า (${bestPerf > 0 ? '+' : ''}${bestPerf.toFixed(2)}%)`;
         icon = <RefreshCcw className="w-8 h-8 text-amber-500" />;
         colorClass = 'text-amber-500 border-amber-500/30 bg-amber-50 dark:bg-amber-900/10';
      } else {
         action = 'OBSERVE';
         recommendation = `สภาวะราคา ${displayFundName} อยู่ในช่วงพักฐาน (Sideways) แนะนำให้เฝ้าระวังและ "ถือครองไปก่อน" หากมีการเปลี่ยนแปลงนโยบายดอกเบี้ยในเร็วๆ นี้ อาจส่งผลบวกต่อกองทุนนี้ได้`;
         icon = <ShieldCheck className="w-8 h-8 text-blue-500" />;
         colorClass = 'text-blue-500 border-blue-500/30 bg-blue-50 dark:bg-blue-900/10';
      }

      setResult({
        action,
        recommendation,
        icon,
        colorClass,
        currentPerf,
        bestAlt,
        bestPerf
      });
      setAnalyzing(false);
    }, 1500);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[32px] shadow-sm border border-slate-200 dark:border-slate-800 p-8 mt-4 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
            <Activity className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800 dark:text-white tracking-tight">AI Strategy Insight Lab</h3>
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.1em] mt-1">วิเคราะห์นโยบายการถือครอง/สับเปลี่ยน</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative group">
          <select 
            className="w-full bg-slate-50 dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800 text-sm font-bold text-slate-800 dark:text-white rounded-2xl p-4 pr-10 outline-none focus:border-indigo-500 transition-all appearance-none cursor-pointer"
            value={selectedFund}
            onChange={(e) => {
              setSelectedFund(e.target.value);
              setResult(null);
            }}
          >
            <option value="" disabled>ระบุแผนที่ท่านต้องการวิเคราะห์...</option>
            {customMix && customMix.length > 0 && (
              <option value="MY_CUSTOM_MIX" className="font-bold text-indigo-600 dark:text-indigo-400 font-black">🧪 พอร์ตผสมจำลองของท่าน</option>
            )}
            {allFunds.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <RefreshCcw className="w-4 h-4" />
          </div>
        </div>
        <button 
          onClick={() => performAnalysis(selectedFund)}
          disabled={!selectedFund || analyzing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black py-4 px-8 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 w-full sm:w-auto shadow-xl shadow-indigo-500/20 active:scale-95 shrink-0"
        >
          {analyzing ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <RefreshCcw className="w-4 h-4" />
            </motion.div>
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {analyzing ? 'ANALYZING...' : 'ประมวลผลกลยุทธ์'}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
              "mt-8 p-6 rounded-[32px] border flex flex-col sm:flex-row gap-6 items-start shadow-xl relative overflow-hidden",
              result.colorClass
            )}
          >
            {/* Background Accent */}
            <div className="absolute top-0 right-0 w-32 h-32 opacity-10 bg-current rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            
            <div className="shrink-0 p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-white/50 dark:border-slate-800">
              {result.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
                <h4 className="text-xl font-black tracking-tight">
                  {result.action === 'HOLD' ? 'ถือลงทุนต่อ (HOLD)' : result.action === 'SWITCH' ? 'ควรพิจารณาสับเปลี่ยน' : 'เฝ้าระวัง (OBSERVE)'}
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-white/50 dark:bg-slate-900/50 backdrop-blur shadow-sm border border-current">
                    Trend Analysis: {result.currentPerf > 0 ? '+' : ''}{result.currentPerf.toFixed(2)}%
                  </span>
                </div>
              </div>
              <p className="text-[13.5px] font-bold leading-relaxed opacity-80 mb-4 max-w-2xl">
                {result.recommendation}
              </p>
              
              <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-widest opacity-60">
                 <div className="flex items-center gap-1.5">
                   <ShieldCheck className="w-3.5 h-3.5" />
                   Smart Strategy
                 </div>
                 <div className="flex items-center gap-1.5">
                   <TrendingUp className="w-3.5 h-3.5" />
                   Historical Bias
                 </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
