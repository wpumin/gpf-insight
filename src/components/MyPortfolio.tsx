import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, Info, Calculator, PieChart, Coins, Calendar, ChevronRight, Settings2, ArrowRight, Sparkles, Loader2, Edit2 } from 'lucide-react';
import clsx from 'clsx';
import { ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip as ReTooltip } from 'recharts';

interface PortfolioItem {
  fund: string;
  units: number;
}

interface SalarySettings {
  baseSalary: number;
  contributionPercent: number; // 3% mandatory
  voluntaryPercent: number; // 3% - 27%
  stateContributionPercent: number; // 3% fixed
  paymentCycle: 'monthly' | 'biweekly';
  isAutoEnabled: boolean;
  targetAllocations: Record<string, number>; // fundName -> percentage (total must be 100%)
}

interface MyPortfolioProps {
  latestData: any;
  allFunds: string[];
  theme: 'light' | 'dark';
}

import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const MyPortfolio: React.FC<MyPortfolioProps> = ({ latestData, allFunds, theme }) => {
  const { user, signInWithGoogle } = useAuth();
  
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [salarySettings, setSalarySettings] = useState<SalarySettings>({
    baseSalary: 15000,
    contributionPercent: 3, // Fixed
    voluntaryPercent: 3,
    stateContributionPercent: 3, // Fixed
    paymentCycle: 'monthly',
    isAutoEnabled: false,
    targetAllocations: { "แผนลงทุนพื้นฐานทั่วไป": 100 }
  });

  const [loading, setLoading] = useState(true);

  // Sync with Firestore if logged in, otherwise use localStorage
  useEffect(() => {
    if (user) {
      const unsub = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.portfolio) setItems(data.portfolio);
          if (data.salarySettings) setSalarySettings(prev => ({ ...prev, ...data.salarySettings }));
        }
        setLoading(false);
      }, (err) => {
        console.error("Firestore sync error:", err);
        setLoading(false);
      });
      return () => unsub();
    } else {
      if (typeof localStorage !== 'undefined') {
        const savedP = localStorage.getItem('gpf_portfolio');
        const savedS = localStorage.getItem('gpf_salary_settings');
        if (savedP) setItems(JSON.parse(savedP));
        if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
      }
      setLoading(false);
    }
  }, [user]);

  // Save changes
  useEffect(() => {
    if (loading) return;
    const saveToFirestore = async () => {
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid), { 
            portfolio: items,
            salarySettings
          }, { merge: true });
        } catch (e) {
          console.error("Save failed:", e);
        }
      } else {
        localStorage.setItem('gpf_portfolio', JSON.stringify(items));
        localStorage.setItem('gpf_salary_settings', JSON.stringify(salarySettings));
      }
    };
    saveToFirestore();
  }, [items, salarySettings, user, loading]);

  const [isAdding, setIsAdding] = useState(false);
  const [isConfiguringSalary, setIsConfiguringSalary] = useState(false);
  const [newFund, setNewFund] = useState(allFunds[0]);
  const [newUnits, setNewUnits] = useState('');

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editUnits, setEditUnits] = useState('');

  const [fundToDelete, setFundToDelete] = useState<string | null>(null);

  const [tempSalary, setTempSalary] = useState(salarySettings.baseSalary.toString());

  useEffect(() => {
    setTempSalary(salarySettings.baseSalary.toString());
  }, [salarySettings.baseSalary]);

  const addItem = () => {
    const units = parseFloat(newUnits);
    if (isNaN(units) || units <= 0) return;
    
    setItems(prev => {
      const existing = prev.find(i => i.fund === newFund);
      if (existing) {
        return prev.map(i => i.fund === newFund ? { ...i, units: Number((i.units + units).toFixed(6)) } : i);
      }
      return [...prev, { fund: newFund, units }];
    });
    setNewUnits('');
    setIsAdding(false);
  };

  const confirmDelete = () => {
    if (fundToDelete) {
      setItems(prev => prev.filter(i => i.fund !== fundToDelete));
      setFundToDelete(null);
    }
  };

  const startEdit = (item: PortfolioItem) => {
    setEditingItem(item.fund);
    setEditUnits(item.units.toString());
  };

  const saveEdit = () => {
    const units = parseFloat(editUnits);
    if (isNaN(units) || units < 0) return;
    
    setItems(prev => prev.map(i => i.fund === editingItem ? { ...i, units } : i));
    setEditingItem(null);
  };

  // 174: Calculation hooks MUST be called before any conditional returns
  // --- Calculations ---
  const myMonthlyContribution = useMemo(() => {
    // Only voluntary % now (3-27%)
    return salarySettings.baseSalary * (salarySettings.voluntaryPercent / 100);
  }, [salarySettings.baseSalary, salarySettings.voluntaryPercent]);

  const stateMonthlyContribution = useMemo(() => {
    // 3% state fixed
    return salarySettings.baseSalary * (salarySettings.stateContributionPercent / 100);
  }, [salarySettings.baseSalary, salarySettings.stateContributionPercent]);

  const totalMonthlyInvestment = useMemo(() => {
    return myMonthlyContribution + stateMonthlyContribution;
  }, [myMonthlyContribution, stateMonthlyContribution]);

  const allocationTotal = useMemo(() => {
    return Object.values(salarySettings.targetAllocations || {}).reduce((a, b) => (a as number) + (b as number), 0) as number;
  }, [salarySettings.targetAllocations]);

  const folderGoldName = "แผนทองคำ";
  const goldAllocation = salarySettings.targetAllocations?.[folderGoldName] || 0;
  const hasAllocationError = allocationTotal !== 100;
  const hasGoldLimitError = goldAllocation > 20;

  const targetChartData = useMemo(() => {
    return Object.entries(salarySettings.targetAllocations || {})
      .map(([name, percent]) => ({ name, value: percent as number }))
      .filter(d => (d.value as number) > 0);
  }, [salarySettings.targetAllocations]);

  const portfolioValue = useMemo(() => {
    if (!latestData) return 0;
    return items.reduce((acc, item) => {
      const nav = latestData[item.fund] || 0;
      return acc + (nav * item.units);
    }, 0);
  }, [items, latestData]);

  const chartData = useMemo(() => {
    if (!latestData) return [];
    return items.map(item => ({
      name: item.fund,
      value: (latestData[item.fund] || 0) * item.units
    })).filter(d => d.value > 0);
  }, [items, latestData]);

  const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899'];

  // --- Effects ---
  // Consolidating all save logic into the existing master effect at line 75
  // Removing redundant effects at 223 and 227 later

  // --- Daily Accrual Auto-DCA Logic ---
  useEffect(() => {
    if (!salarySettings.isAutoEnabled || !latestData) return;

    const runAutoDCA = () => {
      const now = new Date();
      const thaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const todayStr = `${thaiNow.getFullYear()}-${thaiNow.getMonth() + 1}-${thaiNow.getDate()}`;
      const lastRun = localStorage.getItem('gpf_last_daily_dca_run');

      if (lastRun !== todayStr && thaiNow.getHours() >= 12) {
        setItems(prev => {
          let newItems = [...prev];
          const dailyMoney = totalMonthlyInvestment / 30;

          Object.entries(salarySettings.targetAllocations || {}).forEach(([fund, percent]) => {
            const p = percent as number;
            if (p > 0) {
              const moneyForFund = dailyMoney * (p / 100);
              const nav = latestData[fund] as number;
              if (nav && nav > 0) {
                const unitsToAdd = moneyForFund / nav;
                const idx = newItems.findIndex(i => i.fund === fund);
                if (idx >= 0) {
                  newItems[idx] = { ...newItems[idx], units: newItems[idx].units + unitsToAdd };
                } else {
                  newItems.push({ fund, units: unitsToAdd });
                }
              }
            }
          });
          return newItems;
        });
        localStorage.setItem('gpf_last_daily_dca_run', todayStr);
      }
    };

    runAutoDCA();
    const interval = setInterval(runAutoDCA, 60000);
    return () => clearInterval(interval);
  }, [salarySettings.isAutoEnabled, latestData, totalMonthlyInvestment, salarySettings.targetAllocations]);

  // Now the early returns handle rendering only
  if (!user && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
        <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-3xl flex items-center justify-center">
          <Wallet className="w-10 h-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">เข้าสู่ระบบเพื่อจัดการพอร์ต</h2>
          <p className="text-slate-500 max-w-xs mx-auto mt-2">ข้อมูลพอร์ตของคุณจะถูกเก็บรักษาไว้เป็นส่วนบุคคลและซิงค์ข้ามอุปกรณ์ได้</p>
        </div>
        <button 
          onClick={signInWithGoogle}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-8 rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all text-sm mb-20"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <p className="text-slate-400 font-bold animate-pulse">Loading your portfolio...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {/* ... existing section ... */}
      
      {/* Warning Banner for Gold Fund Limit */}
      {hasGoldLimitError && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 p-4 rounded-2xl flex items-center gap-3"
        >
          <div className="bg-red-100 dark:bg-red-900/40 p-2 rounded-xl">
             <Info className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-red-800 dark:text-red-300 font-bold">สัดส่วนกองทุนทองคำเกินเกณฑ์</p>
            <p className="text-xs text-red-600 dark:text-red-400">ตามระเบียบ กบข. สมาชิกสามารถลงทุนในกองทุนทองคำได้ไม่เกิน 20% ของพอร์ต</p>
          </div>
        </motion.div>
      )}

      {/* --- Main Value Card ... */}
      <section className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-800 rounded-[32px] p-6 sm:p-8 text-white shadow-2xl overflow-hidden relative border border-emerald-400/20">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-emerald-100/70 text-xs font-black uppercase tracking-[0.2em] mb-0.5">มูลค่าพอร์ตโดยประมาณ</p>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight flex items-baseline gap-1">
                <span className="text-xl font-medium text-emerald-200">฿</span>
                {latestData ? portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
              </h2>
              {!latestData && <p className="text-xs text-emerald-200/60 mt-1 italic">กำลังโหลดข้อมูล NAV ล่าสุด...</p>}
            </div>
            <div className="bg-white/10 backdrop-blur-md p-2 rounded-2xl border border-white/10">
              <Wallet className="w-6 h-6 text-emerald-200" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-black/10 backdrop-blur-sm p-3 rounded-2xl border border-white/5">
              <p className="text-xs text-emerald-200/60 font-black uppercase tracking-widest mb-1">ยอดออมรายเดือน (Auto-DCA)</p>
              <p className="text-lg font-bold">฿{totalMonthlyInvestment.toLocaleString()}</p>
            </div>
            <div className="bg-black/10 backdrop-blur-sm p-3 rounded-2xl border border-white/5">
              <p className="text-xs text-emerald-200/60 font-black uppercase tracking-widest mb-1">การเติบโตเดือนปัจจุบัน</p>
              <p className="text-lg font-bold text-emerald-300">+0.85%</p>
            </div>
          </div>
        </div>
        
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-400/10 rounded-full blur-[60px] translate-y-1/2 -translate-x-1/4" />
      </section>

      {/* --- Salary & DCA Profile --- */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center border border-indigo-100 dark:border-indigo-800">
              <Coins className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">เงินเดือนและแผนการออม</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">ตั้งค่าแผนการเงิน</p>
            </div>
          </div>
          <button 
            onClick={() => setIsConfiguringSalary(true)}
            className="flex items-center justify-center gap-2 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 px-6 py-3.5 rounded-2xl shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
          >
            <Settings2 className="w-4 h-4" />
            ตั้งค่าแผนสมทบ
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 relative group">
            <p className="text-xs text-slate-400 font-black uppercase tracking-wider mb-2">เงินเดือนปัจจุบัน</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-bold text-slate-400">฿</span>
              <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                {salarySettings.baseSalary.toLocaleString()}
              </p>
            </div>
            <button 
              onClick={() => setIsConfiguringSalary(true)}
              className="absolute top-4 right-4 p-2 bg-white dark:bg-slate-700 rounded-xl shadow-sm opacity-0 group-hover:opacity-100 md:opacity-0 transition-opacity"
            >
              <Edit2 className="w-4 h-4 text-emerald-500" />
            </button>
          </div>

          <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-800/30">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider mb-2">ออมสะสมของคุณ</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-emerald-500">฿</span>
                <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 leading-none">
                  {myMonthlyContribution.toLocaleString()}
                </p>
              </div>
              <p className="text-xs font-bold text-emerald-600/60 dark:text-emerald-400/60 uppercase">
                ออมเพิ่ม {salarySettings.voluntaryPercent}%
              </p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/30">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mb-2">รัฐสมทบให้</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-blue-500">฿</span>
                <p className="text-2xl font-black text-blue-700 dark:text-blue-300 leading-none">
                  {stateMonthlyContribution.toLocaleString()}
                </p>
              </div>
              <p className="text-xs font-bold text-blue-600/60 dark:text-blue-400/60 uppercase">รัฐสมทบคงที่ 3%</p>
            </div>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-800/30">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-wider mb-2">เงินออมรวม/เดือน</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-bold text-indigo-500">฿</span>
              <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300 leading-none">
                {totalMonthlyInvestment.toLocaleString()}
              </p>
            </div>
            <p className="text-xs font-bold text-indigo-600/60 dark:text-indigo-400/60 uppercase mt-1">รวมออม {salarySettings.voluntaryPercent + 3}% ต่อเดือน</p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-emerald-500" />
              สัดส่วนจริง (Actual)
            </h3>
          </div>
          <p className="text-xs text-slate-400 font-medium mb-6">กระจายตามประเภทแผนการลงทุน</p>
          
          <div className="relative">
            {chartData.length > 0 ? (
              <div className="h-[260px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                      ))}
                    </Pie>
                    <ReTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const percent = ((data.value / portfolioValue) * 100).toFixed(1);
                          return (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 text-xs">
                              <p className="font-bold text-slate-900 dark:text-white mb-1">{data.name}</p>
                              <p className="text-emerald-500 font-black">{percent}%</p>
                              <p className="text-slate-400">฿{data.value.toLocaleString()}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">รวม</p>
                  <p className="text-lg font-black text-slate-800 dark:text-white">100%</p>
                </div>
              </div>
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
                <PieChart className="w-12 h-12 opacity-10 mb-2" />
                <p className="text-xs font-medium">ไม่มีข้อมูลพอร์ต</p>
              </div>
            )}
          </div>
        </div>

        {/* Target Plan Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-500" />
              สัดส่วนเป้าหมาย (Plan)
            </h3>
          </div>
          <p className="text-xs text-slate-400 font-medium mb-6">แบ่งตามการตั้งค่าแผนการลงทุนที่เลือก</p>
          
          <div className="relative">
            {targetChartData.length > 0 ? (
              <div className="h-[260px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={targetChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {targetChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={8} />
                      ))}
                    </Pie>
                    <ReTooltip 
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 text-xs">
                              <p className="font-bold text-slate-900 dark:text-white mb-1">{data.name}</p>
                              <p className="text-indigo-500 font-black">{data.value}%</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">เป้าหมาย</p>
                  <p className="text-lg font-black text-slate-800 dark:text-white">{allocationTotal}%</p>
                </div>
              </div>
            ) : (
              <div className="h-[260px] flex flex-col items-center justify-center text-slate-400">
                <Settings2 className="w-12 h-12 opacity-10 mb-2" />
                <p className="text-xs font-medium">ไม่มีข้อมูลแผน</p>
              </div>
            )}
          </div>
        </div>

        {/* --- Asset Tracker (List) --- */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-500" />
              สินทรัพย์ที่ถือครอง
            </h3>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-slate-900 dark:bg-emerald-600 text-white p-2 rounded-xl active:scale-90 transition-transform"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, idx) => {
              const nav = latestData?.[item.fund] || 0;
              const value = nav * item.units;
              const color = COLORS[idx % COLORS.length];
              const isEditing = editingItem === item.fund;

              return (
                <div key={item.fund} className="group flex flex-col p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 hover:border-emerald-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-2.5 h-10 rounded-full" style={{ backgroundColor: color }} />
                    <div className="flex-grow">
                      <p className="text-xs font-bold text-slate-800 dark:text-white line-clamp-1 mb-0.5">{item.fund}</p>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input 
                            type="number"
                            value={editUnits}
                            onChange={(e) => setEditUnits(e.target.value)}
                            className="w-24 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-0.5 text-xs font-bold outline-none"
                            autoFocus
                          />
                          <button onClick={saveEdit} className="text-xs font-black text-emerald-600 uppercase">Save</button>
                          <button onClick={() => setEditingItem(null)} className="text-xs font-black text-slate-400 uppercase">Cancel</button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 font-medium">
                          {item.units.toLocaleString(undefined, { minimumFractionDigits: 4 })} units × {nav.toFixed(4)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-slate-900 dark:text-white">฿{value.toLocaleString()}</p>
                      {!isEditing && (
                        <div className="flex items-center justify-end gap-3 mt-3">
                          <button 
                            onClick={() => startEdit(item)}
                            className="flex items-center gap-1.5 text-[11px] font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100/50 dark:bg-indigo-500/20 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 active:scale-90 transition-all"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            EDIT
                          </button>
                          <button 
                            onClick={() => setFundToDelete(item.fund)}
                            className="flex items-center gap-1.5 text-[11px] font-black text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-500/20 px-3 py-2 rounded-xl border border-red-200 dark:border-red-500/30 active:scale-90 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            DELETE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {items.length === 0 && (
              <div className="text-center py-10 opacity-40">
                <p className="text-xs font-medium">ยังไม่มีรายการถือครอง</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- Salary Settings Modal --- */}
      <AnimatePresence>
        {isConfiguringSalary && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsConfiguringSalary(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[32px] sm:rounded-3xl p-8 relative z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800 dark:text-white">ตั้งค่าโปรไฟล์เงินเดือน</h3>
                <button 
                  onClick={() => setIsConfiguringSalary(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
                >
                  <Plus className="w-6 h-6 rotate-45 text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-1">เงินเดือนพื้นฐาน (Monthly Salary)</label>
                  <div className="relative">
                    <input 
                      type="number"
                      inputMode="decimal"
                      value={tempSalary}
                      onChange={(e) => setTempSalary(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-4xl font-black text-emerald-600 focus:ring-4 ring-emerald-500/20 border-2 border-transparent focus:border-emerald-500 outline-none transition-all pr-20"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 font-black text-slate-300 dark:text-slate-700 text-lg">THB</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-2 ml-1">*กรุณาระบุเงินเดือนเพื่อคำนวณยอดเงินสะสมรายเดือน</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-state-400 uppercase tracking-[0.2em] mb-3 block ml-1">สัดส่วนออมเพิ่ม (Voluntary %)</label>
                    <div className="relative group">
                      <select 
                        value={salarySettings.voluntaryPercent}
                        onChange={(e) => setSalarySettings({...salarySettings, voluntaryPercent: Number(e.target.value)})}
                        className="w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-2xl font-black text-indigo-600 border-2 border-transparent focus:border-indigo-500 outline-none appearance-none cursor-pointer"
                      >
                        {Array.from({length: 25}, (_, i) => i + 3).map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                        <ChevronRight className="w-6 h-6 rotate-90" />
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 ml-1">
                      เลือกสัดส่วนออมเพิ่มได้ตั้งแต่ 3% ถึง 27% (ไม่รวมสมทบรัฐ 3%)
                    </p>
                  </div>
                </div>

                {/* Auto Update Toggle */}
                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-black text-emerald-800 dark:text-emerald-300 uppercase italic">Smart Auto-Update</span>
                    </div>
                    <button 
                      onClick={() => setSalarySettings({...salarySettings, isAutoEnabled: !salarySettings.isAutoEnabled})}
                      className={clsx(
                        "w-10 h-5 rounded-full transition-colors relative",
                        salarySettings.isAutoEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                      )}
                    >
                      <motion.div 
                        animate={{ x: salarySettings.isAutoEnabled ? 20 : 2 }}
                        className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                      />
                    </button>
                  </div>
                  <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60 leading-tight">
                    ระบบจะคำนวณและเพิ่มจำนวนหน่วย (Units) ให้คุณอัตโนมัติรายวัน (โดยเฉลี่ยจากยอดเงินสะสมรายเดือน) ทุกเวลา 12:00 น.
                  </p>
                </div>

                {/* Target Allocation Section */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">สัดส่วนแผนที่เลือก (%)</label>
                    <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded-full", hasAllocationError ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")}>
                      Total: {allocationTotal}%
                      {hasAllocationError && " (ต้องครบ 100%)"}
                    </span>
                  </div>

                  {hasGoldLimitError && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex gap-2 items-start">
                      <Info className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-700 dark:text-red-400 leading-tight">
                        คำเตือน: กองทุนทองคำไม่สามารถลงทุนเกิน 20% ของพอร์ตได้ตามเงื่อนไข กบข.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                    {allFunds.map(fund => {
                      const currentVal = salarySettings.targetAllocations[fund] || 0;
                      return (
                        <div key={fund} className="flex items-center gap-3">
                          <span className="flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{fund}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              step="1"
                              value={currentVal}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setSalarySettings({
                                  ...salarySettings,
                                  targetAllocations: { ...salarySettings.targetAllocations, [fund]: val }
                                });
                              }}
                              className="w-24 accent-emerald-600"
                            />
                            <span className="w-8 text-[11px] font-black text-slate-800 dark:text-white text-right">{currentVal}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                  <div className="grid grid-cols-1 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">รอบการจ่ายเงินเดือน</label>
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl">
                      <button 
                        onClick={() => setSalarySettings({...salarySettings, paymentCycle: 'monthly'})}
                        className={clsx("flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all", salarySettings.paymentCycle === 'monthly' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
                      >
                        1 ครั้ง/เดือน
                      </button>
                      <button 
                        onClick={() => setSalarySettings({...salarySettings, paymentCycle: 'biweekly'})}
                        className={clsx("flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all", salarySettings.paymentCycle === 'biweekly' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
                      >
                        2 ครั้ง/เดือน
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    disabled={hasAllocationError}
                    onClick={() => {
                      const val = parseFloat(tempSalary);
                      if (!isNaN(val) && val >= 0) {
                        setSalarySettings(prev => ({...prev, baseSalary: val}));
                      }
                      setIsConfiguringSalary(false);
                    }}
                    className={clsx(
                      "w-full py-5 rounded-3xl font-black shadow-xl active:scale-95 transition-all text-sm uppercase tracking-widest",
                      hasAllocationError ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30"
                    )}
                  >
                    บันทึกและคำนวณใหม่
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      {/* --- Add Asset Modal --- */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-[32px] sm:rounded-3xl p-8 relative z-10"
            >
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">บันทึกยอดหน่วย (Units)</h3>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">เลือกแผนกองทุน</label>
                  <select 
                    value={newFund}
                    onChange={(e) => setNewFund(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl font-bold text-slate-800 dark:text-white outline-none ring-1 ring-slate-200 dark:ring-slate-800"
                  >
                    {allFunds.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">จำนวนหน่วยสะสม (จากแอป My GPF)</label>
                  <input 
                    type="number"
                    placeholder="0.0000"
                    value={newUnits}
                    onChange={(e) => setNewUnits(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-xl font-black text-slate-900 dark:text-white focus:ring-2 ring-emerald-500 outline-none transition-all"
                  />
                  <p className="mt-2 text-[10px] text-slate-400 font-medium">*กรุณาระบุจำนวนหน่วยสุทธิที่ถือครองปัจจุบัน</p>
                </div>

                <div className="pt-6 flex gap-3">
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-500 py-4 rounded-2xl font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    onClick={addItem}
                    className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                  >
                    บันทึกรายการ
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* --- Delete Confirmation Modal --- */}
      <AnimatePresence>
        {fundToDelete && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setFundToDelete(null)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[32px] p-8 relative z-10 text-center"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">ยืนยันการลบ?</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                คุณต้องการลบกองทุน <span className="font-bold text-slate-700 dark:text-slate-200">{fundToDelete}</span> ออกจากพอร์ตใช่หรือไม่?
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setFundToDelete(null)}
                  className="flex-1 py-3.5 rounded-2xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs"
                >
                  ยกเลิก
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 py-3.5 rounded-2xl font-bold bg-red-500 text-white shadow-lg shadow-red-500/20 active:scale-95 transition-all text-xs"
                >
                  ลบทันที
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
