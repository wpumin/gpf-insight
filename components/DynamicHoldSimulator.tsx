import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCcw, ArrowRight, TrendingUp, ShieldCheck, Activity } from 'lucide-react';
import { clsx } from 'clsx';

export const DynamicHoldSimulator = ({ data, allFunds }: { data: any[], allFunds: string[] }) => {
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
      
      const currentPerf = ((Number(latest[fund]) - Number(monthAgo[fund])) / Number(monthAgo[fund])) * 100;
      
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
        recommendation = `กองทุน ${fund} มีโมเมนตัมกราฟขาขึ้นที่แข็งแกร่ง (Strong Uptrend) จากปัจจัยมหภาคในปัจจุบัน แนะนำให้ "ถือต่อ" เพื่อรันเทรนด์กำไร ไม่มีความจำเป็นต้องสับเปลี่ยนในระยะสั้น`;
        icon = <TrendingUp className="w-8 h-8 text-emerald-500" />;
        colorClass = 'text-emerald-500 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10';
      } else if (currentPerf < -1.0) {
         action = 'SWITCH';
         recommendation = `แนวโน้มราคามีการย่อตัวต่อเนื่องและมีความผันผวนสูง (Downside Risk) หากรับความเสี่ยงไม่ได้ แนะนำให้พิจารณาสับเปลี่ยนไปยัง "${bestAlt}" ซึ่งมีผลตอบแทนย้อนหลัง 1 เดือนที่แข็งแกร่งและน่าสนใจกว่า (${bestPerf > 0 ? '+' : ''}${bestPerf.toFixed(2)}%)`;
         icon = <RefreshCcw className="w-8 h-8 text-amber-500" />;
         colorClass = 'text-amber-500 border-amber-500/30 bg-amber-50 dark:bg-amber-900/10';
      } else {
         action = 'OBSERVE';
         recommendation = 'สภาวะราคาอยู่ในช่วงพักฐาน (Sideways) แนะนำให้เฝ้าระวังและ "ถือครองไปก่อน" หากมีการเปลี่ยนแปลงนโยบายดอกเบี้ยในเร็วๆ นี้ อาจส่งผลบวกต่อกองทุนนี้ได้';
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
    <div className="bg-white dark:bg-slate-900 rounded-[20px] shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)] border border-slate-200 dark:border-slate-800 p-5 mt-4 w-full">
      <div className="flex justify-between items-start mb-4 gap-2">
        <div>
          <h3 className="text-[15px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 tracking-tight">
            <Activity className="w-4 h-4 text-indigo-500" />
            AI Strategy Simulator
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 font-medium leading-normal">
            ทดลองประเมินว่าคุณควร <strong className="text-emerald-500 font-bold">ถือต่อ</strong> หรือ <strong className="text-amber-500 font-bold">สับเปลี่ยน</strong> กองทุนที่คุณถืออยู่จากข้อมูล NAV จริงย้อนหลัง
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <select 
          className="flex-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 text-[13px] font-medium text-slate-700 dark:text-slate-300 rounded-[12px] p-3 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow"
          value={selectedFund}
          onChange={(e) => {
            setSelectedFund(e.target.value);
            setResult(null);
          }}
        >
          <option value="" disabled>เลือกกองทุนที่คุณถืออยู่ ณ ปัจจุบัน...</option>
          {allFunds.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button 
          onClick={() => performAnalysis(selectedFund)}
          disabled={!selectedFund || analyzing}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold py-3 px-5 rounded-[12px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto shadow-sm"
        >
          {analyzing ? (
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <RefreshCcw className="w-4 h-4" />
            </motion.div>
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
          {analyzing ? 'กำลังวิเคราะห์...' : 'ประเมินแผน'}
        </button>
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className={clsx("mt-4 p-4 rounded-xl border flex flex-col sm:flex-row gap-4 items-start shadow-sm", result.colorClass)}
          >
            <div className="shrink-0 p-2.5 bg-white dark:bg-slate-900 rounded-lg shadow-sm">
              {result.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <h4 className="text-base font-black tracking-wide">{result.action}</h4>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white dark:bg-slate-900 shadow-sm opacity-90 border border-current">
                  แนวโน้มย้อนหลัง: {result.currentPerf > 0 ? '+' : ''}{result.currentPerf.toFixed(2)}%
                </span>
              </div>
              <p className="text-[12.5px] font-medium leading-relaxed opacity-95">
                {result.recommendation}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
