import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, Info, Calculator, PieChart, Coins, Calendar, ChevronRight, Settings2, ArrowRight, Sparkles, Loader2, Edit2 } from 'lucide-react';
import clsx from 'clsx';
import { 
  ResponsiveContainer, 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  Tooltip as ReTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface PortfolioItem {
  fund: string;
  units: number;
}

interface ComparisonStrategy {
  id: string;
  name: string;
  color: string;
  allocations: Record<string, number>;
}

interface SalarySettings {
  baseSalary: number;
  contributionPercent: number; // 3% mandatory
  voluntaryPercent: number; // 3% - 27%
  stateContributionPercent: number; // 3% fixed
  paymentCycle: 'monthly' | 'biweekly';
  isAutoEnabled: boolean;
  targetAllocations: Record<string, number>; // fundName -> percentage (total must be 100%)
  startDate: string; // YYYY-MM-DD
}

interface MyPortfolioProps {
  historyData: any[];
  latestData: any;
  allFunds: string[];
  theme: 'light' | 'dark';
}

import { useAuth } from '../contexts/AuthContext';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// --- Payroll Recognition Helpers ---
const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const getPayrollDates = (year: number, month: number, paymentCycle: 'monthly' | 'biweekly') => {
  const dates: string[] = [];
  
  // Round 1: Mid-month (16th)
  if (paymentCycle === 'biweekly') {
    let d16 = new Date(year, month, 16);
    while (!isBusinessDay(d16)) {
      d16.setDate(d16.getDate() - 1);
    }
    dates.push(`${d16.getFullYear()}-${d16.getMonth() + 1}-${d16.getDate()}`);
  }

  // Round 2: End of month (3 business days before end)
  const lastDay = new Date(year, month + 1, 0);
  let count = 0;
  let dEnd = new Date(lastDay);
  while (count < 3) {
    if (isBusinessDay(dEnd)) {
      count++;
    }
    if (count < 3) {
      dEnd.setDate(dEnd.getDate() - 1);
    }
  }
  dates.push(`${dEnd.getFullYear()}-${dEnd.getMonth() + 1}-${dEnd.getDate()}`);
  
  return dates;
};

export const MyPortfolio: React.FC<MyPortfolioProps> = ({ historyData, latestData, allFunds, theme }) => {
  const { user, signInWithGoogle } = useAuth();
  
  const [portfolioTimeFilter, setPortfolioTimeFilter] = useState<'1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'MAX'>('MAX');
  const [activeBenchmarks, setActiveBenchmarks] = useState<string[]>([]);
  
  const [customStrategies, setCustomStrategies] = useState<ComparisonStrategy[]>([
    { id: 'Steady', name: 'แผนพื้นฐาน (100%)', color: '#6366f1', allocations: { "แผนลงทุนพื้นฐานทั่วไป": 100 } },
    { id: 'Growth', name: 'ตราสารทุนโลก (100%)', color: '#8b5cf6', allocations: { "แผนตราสารทุนต่างประเทศ": 100 } },
    { id: 'Gold', name: 'ทองคำ (100%)', color: '#f59e0b', allocations: { "แผนทองคำ": 100 } },
  ]);
  const [isCreatingStrategy, setIsCreatingStrategy] = useState(false);
  const [strategyBeingEdited, setStrategyBeingEdited] = useState<ComparisonStrategy | null>(null);
  const [newStrategyAllocations, setNewStrategyAllocations] = useState<Record<string, number>>({});
  const [newStrategyName, setNewStrategyName] = useState('');
  
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [salarySettings, setSalarySettings] = useState<SalarySettings>({
    baseSalary: 15000,
    contributionPercent: 3, // Fixed
    voluntaryPercent: 3,
    stateContributionPercent: 3, // Fixed
    paymentCycle: 'monthly',
    isAutoEnabled: false,
    targetAllocations: { "แผนลงทุนพื้นฐานทั่วไป": 100 },
    startDate: '2022-09-01'
  });

  const [loading, setLoading] = useState(true);

  // Sync with Firestore if logged in, otherwise use localStorage
  useEffect(() => {
    if (loading) return; // Wait for initial loading if necessary, but here loading is true by default
    
    // We only want to set items if we are NOT in the middle of a sync
    // The onSnapshot will provide the source of truth if logged in
  }, [user]);

  // Handle Initial Load and Firestore Check
  useEffect(() => {
    if (!user) {
      // Load from localStorage if not logged in
      if (typeof localStorage !== 'undefined') {
        const savedP = localStorage.getItem('gpf_portfolio');
        const savedS = localStorage.getItem('gpf_salary_settings');
        if (savedP) setItems(JSON.parse(savedP));
        if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
      }
      setLoading(false);
      return;
    }

    const fetchUserPortfolio = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'users', user.uid);
        const snapshot = await getDoc(docRef);
        
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.portfolio) {
            setItems(data.portfolio);
            localStorage.setItem('gpf_portfolio', JSON.stringify(data.portfolio));
          }
          if (data.salarySettings) {
            setSalarySettings(prev => ({ ...prev, ...data.salarySettings }));
            localStorage.setItem('gpf_salary_settings', JSON.stringify(data.salarySettings));
          }
          if (data.customStrategies) {
            setCustomStrategies(data.customStrategies);
            localStorage.setItem('gpf_custom_strategies', JSON.stringify(data.customStrategies));
          }
        } else {
          // If no doc yet, check local storage
          const savedP = localStorage.getItem('gpf_portfolio');
          const savedS = localStorage.getItem('gpf_salary_settings');
          const savedC = localStorage.getItem('gpf_custom_strategies');
          if (savedP) setItems(JSON.parse(savedP));
          if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
          if (savedC) setCustomStrategies(JSON.parse(savedC));
        }
      } catch (err) {
        console.error("Firestore fetch error:", err);
        // Fallback to localStorage
        const savedP = localStorage.getItem('gpf_portfolio');
        const savedS = localStorage.getItem('gpf_salary_settings');
        const savedC = localStorage.getItem('gpf_custom_strategies');
        if (savedP) setItems(JSON.parse(savedP));
        if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
        if (savedC) setCustomStrategies(JSON.parse(savedC));
      } finally {
        setLoading(false);
      }
    };

    fetchUserPortfolio();
  }, [user]);

  // Save changes ONLY if not loading and user is set OR if local changes happen
  // Using a separate ref or flag to prevent "phantom" saves on initial load is better
  // but for now let's ensure we don't overwrite with defaults if data is still coming in
  useEffect(() => {
    if (loading) return;
    
    const saveToFirestore = async () => {
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid), { 
            portfolio: items,
            salarySettings,
            customStrategies
          }, { merge: true });
        } catch (e) {
          console.error("Save failed:", e);
        }
      } else {
        localStorage.setItem('gpf_portfolio', JSON.stringify(items));
        localStorage.setItem('gpf_salary_settings', JSON.stringify(salarySettings));
        localStorage.setItem('gpf_custom_strategies', JSON.stringify(customStrategies));
      }
    };

    // Debounce saves slightly to avoid hitting firestore too hard
    const timeout = setTimeout(saveToFirestore, 1000);
    return () => clearTimeout(timeout);
  }, [items, salarySettings, customStrategies, user, loading]);

  const [isAdding, setIsAdding] = useState(false);
  const [isConfiguringSalary, setIsConfiguringSalary] = useState(false);
  const [newFund, setNewFund] = useState(allFunds[0]);
  const [newUnits, setNewUnits] = useState('');

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editUnits, setEditUnits] = useState('');

  const [fundToDelete, setFundToDelete] = useState<string | null>(null);

  const [tempSalary, setTempSalary] = useState(salarySettings.baseSalary.toString());
  const [tempAllocations, setTempAllocations] = useState<Record<string, number>>(salarySettings.targetAllocations);
  const [tempVoluntary, setTempVoluntary] = useState(salarySettings.voluntaryPercent);

  useEffect(() => {
    setTempSalary(salarySettings.baseSalary.toString());
    setTempAllocations(salarySettings.targetAllocations);
    setTempVoluntary(salarySettings.voluntaryPercent);
  }, [salarySettings.baseSalary, salarySettings.targetAllocations, salarySettings.voluntaryPercent]);

  // Filtered funds for dropdown based on active target allocations
  const activeTargetFunds = useMemo(() => {
    return Object.entries(salarySettings.targetAllocations)
      .filter(([_, percent]) => (percent as number) > 0)
      .map(([name, _]) => name);
  }, [salarySettings.targetAllocations]);

  // Update newFund if it's not in activeTargetFunds
  useEffect(() => {
    if (activeTargetFunds.length > 0 && !activeTargetFunds.includes(newFund)) {
      setNewFund(activeTargetFunds[0]);
    }
  }, [activeTargetFunds, newFund]);

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

  const tempAllocationTotal = useMemo(() => {
    return Object.values(tempAllocations || {}).reduce((a, b) => (a as number) + (b as number), 0) as number;
  }, [tempAllocations]);

  const hasTempAllocationError = tempAllocationTotal !== 100;
  const hasTempGoldLimitError = (tempAllocations[folderGoldName] || 0) > 20;

  const hasGoldLimitError = (salarySettings.targetAllocations[folderGoldName] || 0) > 20;

  const targetChartData = useMemo(() => {
    return Object.entries(salarySettings.targetAllocations || {})
      .map(([name, percent]) => ({ name, value: percent as number }))
      .filter(d => (d.value as number) > 0);
  }, [salarySettings.targetAllocations]);

  const portfolioValue = useMemo(() => {
    if (!latestData) return 0;
    return items.reduce((acc, item) => {
      const nav = (latestData as Record<string, number>)[item.fund] || 0;
      return acc + (nav * item.units);
    }, 0);
  }, [items, latestData]);

  const portfolioHistory = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    
    const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));
    
    let cutoffStr = '1900-01-01';
    if (portfolioTimeFilter !== 'MAX') {
      const now = new Date();
      let monthsToSubtract = 1;
      if (portfolioTimeFilter === '3M') monthsToSubtract = 3;
      if (portfolioTimeFilter === '6M') monthsToSubtract = 6;
      if (portfolioTimeFilter === '1Y') monthsToSubtract = 12;
      if (portfolioTimeFilter === '3Y') monthsToSubtract = 36;
      if (portfolioTimeFilter === '5Y') monthsToSubtract = 60;
      
      const cutoff = new Date();
      cutoff.setMonth(now.getMonth() - monthsToSubtract);
      cutoffStr = cutoff.toISOString().split('T')[0];
    }

    const simulatedItems: PortfolioItem[] = [];
    const simulatedData = [];

    const estimateHistoricalSalary = (baseSalary: number, dateStr: string) => {
      const date = new Date(dateStr);
      const current = new Date();
      const monthsDiff = (current.getFullYear() * 12 + current.getMonth()) - (date.getFullYear() * 12 + date.getMonth());
      return baseSalary / Math.pow(1.025, Math.floor(monthsDiff / 6));
    };

    let pPrevMonth = -1;
    const simulationStart = salarySettings.startDate || '2022-09-01';
    
    for (const day of sortedHistory) {
      if (day.date < simulationStart) continue;

      const date = new Date(day.date);
      const month = date.getMonth();
      const year = date.getFullYear();
      const currentDayStr = `${year}-${month + 1}-${date.getDate()}`;
      
      const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
      
      if (payrollDates.includes(currentDayStr) && month !== pPrevMonth) {
        pPrevMonth = month;
        
        const historicalSalary = estimateHistoricalSalary(salarySettings.baseSalary, day.date);
        const myContrib = historicalSalary * ((salarySettings.voluntaryPercent + 3) / 100);
        const stateContrib = historicalSalary * 0.03;
        const totalInvest = myContrib + stateContrib;
        const perPaycheck = (salarySettings.paymentCycle === 'biweekly') ? totalInvest / 2 : totalInvest;

        Object.entries(salarySettings.targetAllocations).forEach(([fund, percent]) => {
          const p = percent as number;
          if (p > 0) {
            const nav = day[fund] || 1;
            const unitsAdded = perPaycheck * (p / 100) / nav;
            const existingIdx = simulatedItems.findIndex(i => i.fund === fund);
            if (existingIdx >= 0) {
              simulatedItems[existingIdx].units += unitsAdded;
            } else {
              simulatedItems.push({ fund, units: unitsAdded });
            }
          }
        });
      }

      if (day.date >= cutoffStr) {
        let dailyValue = 0;
        simulatedItems.forEach(item => {
          const nav = day[item.fund] || 0;
          dailyValue += nav * item.units;
        });

        simulatedData.push({
          date: day.date,
          displayDate: day.displayDate || day.date,
          value: dailyValue,
        });
      }
    }

    return simulatedData;
  }, [historyData, portfolioTimeFilter, salarySettings]);

  const benchmarkHistory = useMemo(() => {
    if (!historyData || historyData.length === 0 || activeBenchmarks.length === 0) return {};
    
    const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));
    let cutoffStr = '1900-01-01';
    if (portfolioTimeFilter !== 'MAX') {
      const now = new Date();
      let m = 1;
      if (portfolioTimeFilter === '3M') m = 3;
      if (portfolioTimeFilter === '6M') m = 6;
      if (portfolioTimeFilter === '1Y') m = 12;
      if (portfolioTimeFilter === '3Y') m = 36;
      if (portfolioTimeFilter === '5Y') m = 60;
      const cutoff = new Date();
      cutoff.setMonth(now.getMonth() - m);
      cutoffStr = cutoff.toISOString().split('T')[0];
    }

    const benchmarks: Record<string, any[]> = {};
    const simulationStart = salarySettings.startDate || '2022-09-01';
    
    activeBenchmarks.forEach(strategyId => {
      const strategy = customStrategies.find(s => s.id === strategyId);
      if (!strategy) return;

      const data: any[] = [];
      const strategyUnits: Record<string, number> = {};
      let bPrevMonth = -1;

      for (const day of sortedHistory) {
         if (day.date < simulationStart) continue;

         const date = new Date(day.date);
         const month = date.getMonth();
         const year = date.getFullYear();
         const currentDayStr = `${year}-${month + 1}-${date.getDate()}`;
         
         const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
         if (payrollDates.includes(currentDayStr) && month !== bPrevMonth) {
           bPrevMonth = month;
           
           const dateObj = new Date(day.date);
           const current = new Date();
           const monthsDiff = (current.getFullYear() * 12 + current.getMonth()) - (dateObj.getFullYear() * 12 + dateObj.getMonth());
           const historicalSalary = salarySettings.baseSalary / Math.pow(1.025, Math.floor(monthsDiff / 6));
           const totalInvest = historicalSalary * ((salarySettings.voluntaryPercent + 6) / 100);
           const perPay = (salarySettings.paymentCycle === 'biweekly') ? totalInvest / 2 : totalInvest;
           
           Object.entries(strategy.allocations).forEach(([fund, percent]) => {
             if (percent > 0) {
               const nav = day[fund] || 1;
               strategyUnits[fund] = (strategyUnits[fund] || 0) + (perPay * (percent / 100) / nav);
             }
           });
         }
         
         if (day.date >= cutoffStr) {
           let dayTotalVal = 0;
           Object.entries(strategyUnits).forEach(([fund, units]) => {
              dayTotalVal += units * (day[fund] || 0);
           });

           benchmarks[strategyId] = benchmarks[strategyId] || [];
           benchmarks[strategyId].push({
             date: day.date,
             value: dayTotalVal
           });
         }
      }
    });

    return benchmarks;
  }, [historyData, portfolioTimeFilter, salarySettings, activeBenchmarks, customStrategies]);

  const combinedChartData = useMemo(() => {
    if (portfolioHistory.length === 0) return [];
    
    // Create a map of dates for faster lookup
    const benchmarkMap: Record<string, Record<string, number>> = {};
    activeBenchmarks.forEach(benchId => {
      const benchData = benchmarkHistory[benchId] || [];
      benchmarkMap[benchId] = {};
      benchData.forEach(d => {
        benchmarkMap[benchId][d.date] = d.value;
      });
    });

    return portfolioHistory.map(d => {
      const entry: any = { ...d };
      activeBenchmarks.forEach(benchId => {
        if (benchmarkMap[benchId] && benchmarkMap[benchId][d.date] !== undefined) {
          entry[benchId] = benchmarkMap[benchId][d.date];
        } else {
          // If benchmark doesn't have data for this date, maybe fallback or leave undefined
          // Recharts handles missing values as gaps.
        }
      });
      return entry;
    });
  }, [portfolioHistory, benchmarkHistory, activeBenchmarks]);

  const simulationStats = useMemo(() => {
    if (portfolioHistory.length < 2) return { change: 0, changePercent: 0, isUp: true };
    const first = portfolioHistory[0].value;
    const last = portfolioHistory[portfolioHistory.length - 1].value;
    const change = last - first;
    const changePercent = (change / first) * 100;
    return { change, changePercent, isUp: change >= 0 };
  }, [portfolioHistory]);

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
      // Ensure we are using Bangkok time (GMT+7)
      const options: Intl.DateTimeFormatOptions = { timeZone: "Asia/Bangkok", hour12: false, hour: 'numeric', minute: 'numeric', year: 'numeric', month: 'numeric', day: 'numeric' };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(now);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value;
      
      const bkkDay = getPart('day');
      const bkkMonth = getPart('month');
      const bkkYear = getPart('year');
      const bkkHour = parseInt(getPart('hour') || '0');
      
      const bkkDateStr = `${bkkYear}-${bkkMonth}-${bkkDay}`;
      const payrollDates = getPayrollDates(parseInt(bkkYear || '2024'), parseInt(bkkMonth || '1') - 1, salarySettings.paymentCycle);
      
      const lastRun = localStorage.getItem('gpf_last_auto_dca_run');

      // Only run if it's a payroll date, and it's 12:00 or later in Bangkok, and hasn't run today
      if (payrollDates.includes(bkkDateStr) && lastRun !== bkkDateStr && bkkHour >= 12) {
        setItems(prev => {
          let newItems = [...prev];
          const investAmount = salarySettings.paymentCycle === 'biweekly' ? totalMonthlyInvestment / 2 : totalMonthlyInvestment;

          Object.entries(salarySettings.targetAllocations || {}).forEach(([fund, percent]) => {
            const p = percent as number;
            if (p > 0) {
              const moneyForFund = investAmount * (p / 100);
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
        localStorage.setItem('gpf_last_auto_dca_run', bkkDateStr);
      }
    };

    runAutoDCA();
    const interval = setInterval(runAutoDCA, 60000);
    return () => clearInterval(interval);
  }, [salarySettings.isAutoEnabled, latestData, totalMonthlyInvestment, salarySettings.targetAllocations, salarySettings.paymentCycle]);

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
          className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-4 px-8 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-none active:scale-95 transition-all text-sm mb-20"
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
              <p className="text-xs text-emerald-200/60 font-black uppercase tracking-widest mb-1">ยอดออมรายเดือนอัตโนมัติ</p>
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

      {/* --- Portfolio Performance Chart --- */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="font-black text-slate-800 dark:text-white text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              GPF Strategy Lab
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">แบบจำลองและเปรียบเทียบกลยุทธ์</p>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {(['1M', '3M', '6M', '1Y', '3Y', '5Y', 'MAX'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setPortfolioTimeFilter(f)}
                className={clsx(
                  "px-2 py-1.5 text-[9px] font-black rounded-lg transition-all",
                  portfolioTimeFilter === f 
                    ? "bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm" 
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark Toggles */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">เปรียบเทียบกับ:</p>
           {customStrategies.map(bench => (
             <div key={bench.id} className="relative group">
               <button
                onClick={() => {
                  setActiveBenchmarks(prev => 
                    prev.includes(bench.id) ? prev.filter(b => b !== bench.id) : [...prev, bench.id]
                  );
                }}
                className={clsx(
                  "px-3 py-2 rounded-xl text-[10px] font-bold border transition-all flex items-center gap-2",
                  activeBenchmarks.includes(bench.id)
                    ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"
                    : "bg-transparent border-transparent text-slate-400"
                )}
               >
                 <div className={clsx("w-2 h-2 rounded-full", activeBenchmarks.includes(bench.id) ? "opacity-100" : "opacity-30")} style={{ backgroundColor: bench.color }} />
                 {bench.name}
               </button>
               
               {/* Context menu for custom strategies */}
               {bench.id !== 'Steady' && bench.id !== 'Growth' && bench.id !== 'Gold' && (
                 <div className="absolute -top-1 -right-1 flex gap-1 scale-0 group-hover:scale-100 transition-transform">
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       setStrategyBeingEdited(bench);
                       setNewStrategyName(bench.name);
                       setNewStrategyAllocations(bench.allocations);
                       setIsCreatingStrategy(true);
                     }}
                     className="p-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 rounded-full shadow-sm hover:bg-indigo-200 transition-colors"
                   >
                     <Edit2 className="w-2.5 h-2.5" />
                   </button>
                   <button 
                     onClick={(e) => {
                       e.stopPropagation();
                       setCustomStrategies(prev => prev.filter(s => s.id !== bench.id));
                       setActiveBenchmarks(prev => prev.filter(id => id !== bench.id));
                     }}
                     className="p-1 bg-red-100 dark:bg-red-900/40 text-red-600 rounded-full shadow-sm hover:bg-red-200 transition-colors"
                   >
                     <Trash2 className="w-2.5 h-2.5" />
                   </button>
                 </div>
               )}
             </div>
           ))}
           {customStrategies.length < 6 && ( // 3 default + 3 custom
             <button 
               onClick={() => {
                 setNewStrategyName('');
                 setNewStrategyAllocations({});
                 setStrategyBeingEdited(null);
                 setIsCreatingStrategy(true);
               }}
               className="px-3 py-2 rounded-xl text-[10px] font-black border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 flex items-center gap-2 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-all border-dashed"
             >
               <Plus className="w-3 h-3" />
               สร้างพอร์ตเปรียบเทียบเอง ({customStrategies.length - 3}/3)
             </button>
           )}
        </div>

        {portfolioHistory.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-baseline gap-6 mb-2">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">พอร์ตปัจจุบันของคุณ</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
                    ฿{portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <div className={clsx(
                    "flex items-center gap-1 text-sm font-bold",
                    simulationStats.isUp ? "text-emerald-500" : "text-red-500"
                  )}>
                    {simulationStats.isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    {simulationStats.isUp ? '+' : ''}{simulationStats.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>

              {activeBenchmarks.map(strategyId => {
                const strat = customStrategies.find(s => s.id === strategyId);
                const data = benchmarkHistory[strategyId];
                if (!data || !strat) return null;
                const last = data[data.length - 1].value;
                const first = data[0].value;
                const change = ((last - first) / (first || 1)) * 100;
                
                return (
                  <div key={strategyId} className="border-l border-slate-100 dark:border-slate-800 pl-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{strat.name}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-black" style={{ color: strat.color }}>
                        ฿{last.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className={clsx("text-xs font-bold", change >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combinedChartData}>
                  <defs>
                    <linearGradient id="colorSimulation" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                  <XAxis dataKey="displayDate" hide />
                  <YAxis hide domain={['dataMin * 0.9', 'dataMax * 1.1']} />
                  <ReTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 min-w-[200px]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 dark:border-slate-700 pb-2">
                              {payload[0].payload.displayDate}
                            </p>
                            <div className="space-y-2">
                              {payload.map((p: any) => {
                                const isUser = p.dataKey === 'value';
                                const strat = isUser ? null : customStrategies.find(s => s.id === p.dataKey);
                                const label = isUser ? 'พอร์ตของคุณ' : (strat?.name || p.dataKey);
                                const color = isUser ? '#10b981' : (strat?.color || '#94a3b8');
                                
                                return (
                                  <div key={p.dataKey} className="flex justify-between items-center gap-4">
                                    <div className="flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                      <span className="text-[10px] font-bold text-slate-400">{label}</span>
                                    </div>
                                    <span className="text-sm font-black" style={{ color }}>฿{p.value.toLocaleString()}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  
                  {/* Custom Strategies */}
                  {activeBenchmarks.map(stratId => {
                    const strat = customStrategies.find(s => s.id === stratId);
                    if (!strat) return null;
                    return (
                      <Area 
                        key={stratId}
                        type="monotone" 
                        dataKey={stratId} 
                        stroke={strat.color} 
                        strokeWidth={2} 
                        fill="transparent" 
                        animationDuration={1000} 
                        strokeDasharray="5 5"
                      />
                    );
                  })}

                  {/* User Portfolio */}
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#10b981" 
                    strokeWidth={4} 
                    fillOpacity={1} 
                    fill="url(#colorSimulation)" 
                    animationDuration={1500} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-800/30 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="w-4 h-4 text-emerald-500" />
                  <p className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">คำอธิบายแบบจำลอง</p>
                </div>
                <p className="text-[10px] text-slate-400 font-medium italic leading-relaxed">
                  แบบจำลองเปรียบเทียบนี้ใช้ "มูลค่าเริ่มต้น ณ วันที่เริ่มกราฟ" เท่ากันทุกตัว และจำลองการออมรายเดือน (DCA) เข้ากองทุนตามสัดส่วนที่ระบุ เพื่อดูว่าสินทรัพย์ประเภทไหนให้ผลตอบแทนสูงสุดในสภาวะตลาดที่ผ่านมา
                </p>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/10 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Strategy Insight</p>
                </div>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 font-bold leading-relaxed">
                  {simulationStats.changePercent > 10 ? 
                    "พอร์ตของคุณกำลังเติบโตได้ดีในสภาวะตลาดนี้ การรักษาวินัยการออมเป็นหัวใจสำคัญ" :
                    "การกระจายความเสี่ยง (Allocation) มีผลต่อผลตอบแทนระยะยาว ลองกดเปรียบเทียบกับ 'หุ้นโลก' เพื่อดูโอกาสในการเพิ่มผลตอบแทน"}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[300px] flex flex-col items-center justify-center text-slate-400 space-y-4">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <TrendingUp className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-bold uppercase tracking-widest opacity-40">ไม่พบข้อมูลจำลอง</p>
            <p className="text-xs text-slate-400 max-w-[200px] text-center italic">ระบบต้องมียอดถือครองสินทรัพย์เพื่อสร้างแบบจำลอง</p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allocation Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-emerald-500" />
              สัดส่วนจริง
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
                  <p className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">จริง</p>
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
              สัดส่วนเป้าหมาย
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-1">เงินเดือนพื้นฐาน Monthly Salary</label>
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

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block ml-1">เริ่มลงทุนกับ กบข. เมื่อไหร่ Start Date</label>
                  <div className="relative">
                    <input 
                      type="date"
                      value={salarySettings.startDate}
                      onChange={(e) => setSalarySettings({...salarySettings, startDate: e.target.value})}
                      className={clsx(
                        "w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-lg font-bold border-2 border-transparent focus:border-emerald-500 outline-none transition-all",
                        "opacity-0 absolute inset-0 z-10 cursor-pointer"
                      )}
                    />
                    <div className="w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-lg font-bold text-slate-800 dark:text-white border-2 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                       <span>{salarySettings.startDate ? (() => {
                         const d = new Date(salarySettings.startDate);
                         const day = d.getDate();
                         const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                         const month = months[d.getMonth()];
                         const year = (d.getFullYear() + 543).toString().slice(-2);
                         return `${day} ${month} ${year}`;
                       })() : 'เลือกวันที่'}</span>
                       <Calendar className="w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold mt-2 ml-1">*ระบุวันที่เริ่มเป็นสมาชิก กบข. เพื่อให้แบบจำลองเริ่มสะสมจาก 0</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-state-400 uppercase tracking-[0.2em] mb-3 block ml-1">สัดส่วนออมเพิ่ม Voluntary %</label>
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
                      เลือกสัดส่วนออมเพิ่มได้ตั้งแต่ 3% ถึง 27% ไม่รวมสมทบรัฐ 3%
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
                    ระบบจะคำนวณและเพิ่มจำนวนหน่วย Units ให้คุณอัตโนมัติตามรอบการจ่ายเงินเดือน (3 วันทำการก่อนสิ้นเดือน หรือ 16th และ 3 วันทำการก่อนสิ้นเดือน) ทุกเวลา 12:00 น.
                  </p>
                </div>

                {/* Target Allocation Section */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex justify-between items-center mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">สัดส่วนแผนที่เลือก %</label>
                    <span className={clsx("text-[10px] font-black px-2 py-0.5 rounded-full", hasTempAllocationError ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")}>
                      Total: {tempAllocationTotal}%
                      {hasTempAllocationError && " ต้องครบ 100%"}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 mb-4 ml-1 leading-relaxed">
                    * <span className="font-bold text-slate-700 dark:text-slate-300">สัดส่วนจริง</span> คือสัดส่วนของกองทุนที่คุณถือครองอยู่จริง ณ ปัจจุบัน ซึ่งจะขยับตามราคา NAV 
                    <br/>* <span className="font-bold text-slate-700 dark:text-slate-300">สัดส่วนเป้าหมาย</span> คือสัดส่วนที่คุณตั้งใจจะออมเพิ่มในอนาคต ยอดออมรายเดือนอัตโนมัติจะใช้สัดส่วนนี้ (อัปเดตตามรอบเงินเดือน)
                  </p>

                  {/* Allocation Warning for Sum Check */}
                  {tempAllocationTotal > 100 && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex gap-2 items-start">
                      <TrendingUp className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-700 dark:text-red-400 leading-tight font-bold">
                        สัดส่วนรวมเกิน 100% (เกิน {tempAllocationTotal - 100}%) กรุณาลดสัดส่วนบางกองทุนลง
                      </p>
                    </div>
                  )}

                  {hasTempGoldLimitError && (
                    <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl flex gap-2 items-start">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-tight">
                        คำเตือน: กองทุนทองคำไม่ควรเกิน 20% ตามเงื่อนไข กบข.
                      </p>
                    </div>
                  )}

                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 no-scrollbar">
                    {allFunds.map(fund => {
                      const currentVal = tempAllocations[fund] || 0;
                      return (
                        <div key={fund} className="flex items-center gap-3">
                          <span className="flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{fund}</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="range"
                              min="0"
                              max={Math.max(currentVal, 100 - (tempAllocationTotal - currentVal))}
                              step="1"
                              value={currentVal}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const otherTotal = tempAllocationTotal - currentVal;
                                const allowed = 100 - otherTotal;
                                const newVal = Math.min(val, allowed);

                                setTempAllocations({
                                  ...tempAllocations,
                                  [fund]: newVal
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
                    disabled={hasTempAllocationError}
                    onClick={() => {
                      const val = parseFloat(tempSalary);
                      if (!isNaN(val) && val >= 0) {
                        setSalarySettings(prev => ({
                          ...prev, 
                          baseSalary: val,
                          targetAllocations: tempAllocations,
                          voluntaryPercent: tempVoluntary
                        }));
                      }
                      setIsConfiguringSalary(false);
                    }}
                    className={clsx(
                      "w-full py-5 rounded-3xl font-black shadow-xl active:scale-95 transition-all text-sm uppercase tracking-widest",
                      hasTempAllocationError ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/30"
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
              <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6">บันทึกยอดหน่วย Units</h3>
              
              <div className="space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">เลือกแผนกองทุน</label>
                  <select 
                    value={newFund}
                    onChange={(e) => setNewFund(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl font-bold text-slate-800 dark:text-white outline-none ring-1 ring-slate-200 dark:ring-slate-800"
                  >
                    {activeTargetFunds.length > 0 ? (
                      activeTargetFunds.map(f => <option key={f} value={f}>{f}</option>)
                    ) : (
                      <option disabled value="">กรุณาเลือกแผนในหน้าตั้งค่าก่อน</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">จำนวนหน่วยสะสม</label>
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
        {isCreatingStrategy && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsCreatingStrategy(false)}
               className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
               className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-t-[32px] sm:rounded-3xl p-8 relative z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
             >
               <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                 <Sparkles className="w-5 h-5 text-emerald-500" />
                 {strategyBeingEdited ? 'แก้ไขพอร์ตเปรียบเทียบ' : 'สร้างแผนเปรียบเทียบใหม่'}
               </h3>
               
               <div className="space-y-6">
                 <div>
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">ชื่อแผน</label>
                   <input 
                     type="text"
                     placeholder="เช่น 60/40 Conservative Growth"
                     className="w-full bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl font-bold border-2 border-transparent focus:border-emerald-500 outline-none transition-all"
                     value={newStrategyName}
                     onChange={(e) => setNewStrategyName(e.target.value)}
                   />
                 </div>

                 <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block">ปรับสัดส่วนที่ต้องการจำลอง (%)</label>
                    <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                      {allFunds.map(fund => {
                        const val = newStrategyAllocations[fund] || 0;
                        const otherTotal = Object.entries(newStrategyAllocations).reduce((sum, [f, v]) => f === fund ? sum : sum + v, 0);
                        const maxAllowed = 100 - otherTotal;
                        
                        return (
                          <div key={fund} className="flex items-center gap-3">
                            <span className="flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{fund}</span>
                            <div className="flex items-center gap-2">
                              <input 
                                type="range" min="0" max={Math.max(val, maxAllowed)} step="1"
                                value={val}
                                onChange={(e) => {
                                  let requested = Number(e.target.value);
                                  // Cap at remaining budget for simpler balancing
                                  const newVal = Math.min(requested, 100 - otherTotal);
                                  setNewStrategyAllocations({...newStrategyAllocations, [fund]: newVal});
                                }}
                                className="w-24 accent-violet-600"
                              />
                              <span className="w-8 text-[11px] font-black text-slate-800 dark:text-white text-right">{val}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-500 uppercase">สัดส่วนรวม:</span>
                      <span className={clsx(
                        "text-lg font-black",
                        Object.values(newStrategyAllocations).reduce((a, b) => a + b, 0) === 100 ? "text-emerald-600" : "text-amber-500"
                      )}>
                        {Object.values(newStrategyAllocations).reduce((a, b) => a + b, 0)}%
                        {Object.values(newStrategyAllocations).reduce((a, b) => a + b, 0) < 100 && <span className="text-[10px] ml-2 font-bold">(ยังไม่ครบ 100%)</span>}
                      </span>
                    </div>
                 </div>

                 <div className="pt-4 flex gap-3">
                    <button 
                      onClick={() => setIsCreatingStrategy(false)}
                      className="flex-1 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold"
                    >
                      ยกเลิก
                    </button>
                    <button 
                      disabled={!newStrategyName || Object.values(newStrategyAllocations).reduce((a, b) => a + b, 0) !== 100}
                      onClick={() => {
                        if (strategyBeingEdited) {
                          setCustomStrategies(prev => prev.map(s => s.id === strategyBeingEdited.id ? {
                            ...s,
                            name: newStrategyName,
                            allocations: newStrategyAllocations
                          } : s));
                        } else {
                          const newStrat: ComparisonStrategy = {
                            id: `strat-${Date.now()}`,
                            name: newStrategyName,
                            color: `hsla(${Math.random() * 360}, 70%, 50%, 1)`,
                            allocations: newStrategyAllocations
                          };
                          setCustomStrategies(prev => [...prev, newStrat]);
                          setActiveBenchmarks(prev => [...prev, newStrat.id]);
                        }
                        setIsCreatingStrategy(false);
                      }}
                      className={clsx(
                        "flex-[2] py-4 px-6 rounded-2xl font-black transition-all shadow-lg active:scale-95 text-white",
                        !newStrategyName || Object.values(newStrategyAllocations).reduce((a, b) => a + b, 0) !== 100 
                          ? "bg-slate-200 cursor-not-allowed shadow-none" 
                          : "bg-emerald-600 shadow-emerald-500/30"
                      )}
                    >
                      {strategyBeingEdited ? 'บันทึกการแก้ไข' : 'สร้างกลยุทธ์จำลอง'}
                    </button>
                 </div>
               </div>
             </motion.div>
          </div>
        )}

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
