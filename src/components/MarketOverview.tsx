import React from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { TrendingUp, TrendingDown, Sparkles, Activity, Gauge, Coffee } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { FearAndGreedCard, AiInsightCarousel, ActivityCard } from './MarketCards';

interface MarketOverviewProps {
  chartDataWithMix: any[];
  selectedFunds: string[];
  allFunds: string[];
  latestData: any;
  previousData: any;
  theme: 'dark' | 'light';
  timeFilter: string;
  setTimeFilter: (val: any) => void;
  toggleFund: (fund: string) => void;
  customMix: any[];
  formattedData: any[];
  lastSync: string | null;
  COLORS: string[];
  CustomTooltip: any;
}

export const MarketOverview: React.FC<MarketOverviewProps> = ({
  chartDataWithMix, selectedFunds, allFunds, latestData, previousData,
  theme, timeFilter, setTimeFilter, toggleFund, customMix,
  formattedData, lastSync, COLORS, CustomTooltip
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 auto-rows-max pb-20">
      {/* --- 1. Interactive Chart Section --- */}
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

      {/* --- 2. Sidebar Data --- */}
      <div className="lg:col-span-1 order-4 lg:order-2 space-y-4">
        <AiInsightCarousel data={formattedData} allFunds={allFunds} />
        <FearAndGreedCard />
        
        <a 
          href="https://tmn.app.link/dQ0mj5UIx2b" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-3 p-4 rounded-[20px] bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/30 text-orange-600 dark:text-orange-400 font-bold text-sm transition-all hover:scale-[1.02] active:scale-95 group"
        >
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center group-hover:rotate-12 transition-transform">
            <Coffee className="w-4 h-4" />
          </div>
          <span>เลี้ยงกาแฟผู้พัฒนา</span>
        </a>

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
    </div>
  );
};
