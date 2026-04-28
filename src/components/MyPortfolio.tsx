import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wallet, Plus, Trash2, TrendingUp, TrendingDown, Info, Calculator, PieChart, Coins, Calendar, ChevronRight, ChevronDown, Settings2, ArrowRight, Sparkles, Loader2, Edit2 } from 'lucide-react';
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
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

// --- Payroll Recognition Helpers ---
const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
};

const addBusinessDays = (date: Date, days: number) => {
  let result = new Date(date);
  let count = 0;
  while (count < days) {
    result.setDate(result.getDate() + 1);
    if (isBusinessDay(result)) {
      count++;
    }
  }
  return result;
};

const estimateHistoricalSalary = (baseSalary: number, dateStr: string) => {
  const date = new Date(dateStr);
  const current = new Date();
  const monthsDiff = (current.getFullYear() * 12 + current.getMonth()) - (date.getFullYear() * 12 + date.getMonth());
  return baseSalary / Math.pow(1.025, Math.floor(monthsDiff / 6));
};

const getPayrollDates = (year: number, month: number, paymentCycle: 'monthly' | 'biweekly') => {
  const dates: string[] = [];
  
  const getSubBusinessDays = (date: Date, days: number) => {
    let result = new Date(date);
    let count = 0;
    while (count < days) {
      result.setDate(result.getDate() - 1);
      if (isBusinessDay(result)) {
        count++;
      }
    }
    return result;
  };

  const getLastBusinessDay = (y: number, m: number) => {
    const lastDay = new Date(y, m + 1, 0);
    while (!isBusinessDay(lastDay)) {
      lastDay.setDate(lastDay.getDate() - 1);
    }
    return lastDay;
  };

  // Round 1: Mid-month (16th)
  if (paymentCycle === 'biweekly') {
    let d16 = new Date(year, month, 16);
    while (!isBusinessDay(d16)) {
      d16.setDate(d16.getDate() - 1);
    }
    dates.push(format(d16, 'yyyy-M-d'));
  }

  // Round 2: End of month (3rd business day before the last business day of the month)
  const lbd = getLastBusinessDay(year, month);
  const paydayRound2 = getSubBusinessDays(lbd, 3);
  dates.push(format(paydayRound2, 'yyyy-M-d'));
  
  return dates;
};

const getNextDisplayDate = (paymentCycle: 'monthly' | 'biweekly') => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Potential paydays: this month or next month
  let candidates: Date[] = [];
  [month, month + 1].forEach(m => {
    const dates = getPayrollDates(year, m, paymentCycle);
    dates.forEach(d => candidates.push(new Date(d)));
  });

  // Sort candidates
  candidates.sort((a, b) => a.getTime() - b.getTime());

  for (let payday of candidates) {
    const displayDate = addBusinessDays(payday, 2);
    // If displayDate is in the future relative to today
    if (displayDate > now) {
      return displayDate;
    }
  }
  return null;
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
    stateContributionPercent: 3, // 3% Matching
    paymentCycle: 'monthly',
    isAutoEnabled: false,
    targetAllocations: { "แผนลงทุนพื้นฐานทั่วไป": 100 },
    startDate: '2022-09-01'
  });

  const [loading, setLoading] = useState(true);

  // Sync with Firestore if logged in, otherwise use localStorage
  useEffect(() => {
    if (loading || !user) return;
    
    // We only want to set items if we are NOT in the middle of a sync
    // The onSnapshot will provide the source of truth if logged in
  }, [user, loading]);

  // Handle Initial Load and Firestore Check
  useEffect(() => {
    if (!user) {
      // Load from localStorage if not logged in
      if (typeof localStorage !== 'undefined') {
        const savedP = localStorage.getItem('gpf_portfolio_guest');
        const savedS = localStorage.getItem('gpf_salary_settings_guest');
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
          // Ensure we start with empty if the field is missing
          setItems(data.portfolio || []);
          setSalarySettings(prev => ({ ...prev, ...(data.salarySettings || {}) }));
          setCustomStrategies(data.customStrategies || customStrategies);
          
          // Cache specifically for this user
          localStorage.setItem(`gpf_portfolio_${user.uid}`, JSON.stringify(data.portfolio || []));
          localStorage.setItem(`gpf_salary_settings_${user.uid}`, JSON.stringify(data.salarySettings || {}));
        } else {
          // New user: Start clean, don't pull from generic localStorage
          setItems([]);
          // Check if there's a user-specific cache
          const savedP = localStorage.getItem(`gpf_portfolio_${user.uid}`);
          const savedS = localStorage.getItem(`gpf_salary_settings_${user.uid}`);
          if (savedP) setItems(JSON.parse(savedP));
          if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
        }
      } catch (err) {
        console.error("Firestore fetch error:", err);
        // Fallback to user-specific localStorage
        const savedP = localStorage.getItem(`gpf_portfolio_${user.uid}`);
        const savedS = localStorage.getItem(`gpf_salary_settings_${user.uid}`);
        if (savedP) setItems(JSON.parse(savedP));
        if (savedS) setSalarySettings(prev => ({ ...prev, ...JSON.parse(savedS) }));
      } finally {
        setLoading(false);
      }
    };

    fetchUserPortfolio();
  }, [user]);

  const [isAdding, setIsAdding] = useState(false);
  const [isConfiguringSalary, setIsConfiguringSalary] = useState(false);
  const [newFund, setNewFund] = useState(allFunds[0] || '');
  const [newUnits, setNewUnits] = useState('');

  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editUnits, setEditUnits] = useState('');

  const [fundToDelete, setFundToDelete] = useState<string | null>(null);

  const [tempSalary, setTempSalary] = useState(salarySettings.baseSalary.toString());
  const [tempAllocations, setTempAllocations] = useState<Record<string, number>>(salarySettings.targetAllocations);
  const [tempVoluntary, setTempVoluntary] = useState(salarySettings.voluntaryPercent);
  const [tempStartDate, setTempStartDate] = useState(salarySettings.startDate);
  const [tempPaymentCycle, setTempPaymentCycle] = useState(salarySettings.paymentCycle);
  const [tempIsAutoEnabled, setTempIsAutoEnabled] = useState(salarySettings.isAutoEnabled);

  // Sync temp states ONLY when modal opens
  useEffect(() => {
    if (isConfiguringSalary) {
      setTempSalary(salarySettings.baseSalary.toString());
      setTempAllocations({...salarySettings.targetAllocations});
      setTempVoluntary(salarySettings.voluntaryPercent);
      setTempStartDate(salarySettings.startDate);
      setTempPaymentCycle(salarySettings.paymentCycle);
      setTempIsAutoEnabled(salarySettings.isAutoEnabled);
    }
  }, [isConfiguringSalary]);

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
    // 3% mandatory + voluntary % (0-27%)
    return salarySettings.baseSalary * ((3 + salarySettings.voluntaryPercent) / 100);
  }, [salarySettings.baseSalary, salarySettings.voluntaryPercent]);

  const stateMonthlyContribution = useMemo(() => {
    // 3% state contribution + 2% compensation
    return salarySettings.baseSalary * (5 / 100);
  }, [salarySettings.baseSalary]);

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

  const monthlyGrowthPercent = useMemo(() => {
    if (!latestData || !historyData || historyData.length < 2 || items.length === 0) return 0;
    
    // Get the first day of the current month in the data
    const latestDate = new Date(latestData.date);
    const startOfMonth = new Date(latestDate.getFullYear(), latestDate.getMonth(), 1);
    const startOfMonthStr = startOfMonth.toISOString().split('T')[0];
    
    // Find the closest record to the start of the month
    const startOfMonthRecord = historyData.find(d => d.date >= startOfMonthStr) || historyData[0];
    
    if (!startOfMonthRecord || startOfMonthRecord === latestData) return 0;
    
    let startVal = 0;
    let endVal = 0;
    
    items.forEach(item => {
      const startNav = startOfMonthRecord[item.fund] || 0;
      const endNav = latestData[item.fund] || 0;
      if (startNav > 0) {
        startVal += startNav * item.units;
        endVal += endNav * item.units;
      }
    });

    if (startVal === 0) return 0;
    return ((endVal - startVal) / startVal) * 100;
  }, [items, historyData, latestData]);

  // Save changes ONLY if not loading and user is set OR if local changes happen
  useEffect(() => {
    if (loading) return;
    
    const saveToData = async () => {
      if (user) {
        try {
          await setDoc(doc(db, 'users', user.uid), { 
            portfolio: items,
            salarySettings,
            customStrategies,
            totalValue: portfolioValue,
            displayName: user.displayName,
            photoURL: user.photoURL,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (e) {
          // silent fail
        }
      } else {
        localStorage.setItem('gpf_portfolio_guest', JSON.stringify(items));
        localStorage.setItem('gpf_salary_settings_guest', JSON.stringify(salarySettings));
        localStorage.setItem('gpf_custom_strategies_guest', JSON.stringify(customStrategies));
      }
    };

    // Debounce saves slightly
    const timeout = setTimeout(saveToData, 2000);
    return () => clearTimeout(timeout);
  }, [items, salarySettings, customStrategies, user, loading, portfolioValue]);

  const portfolioHistory = useMemo(() => {
    if (!historyData || historyData.length === 0) return [];
    
    const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));
    
    let cutoffStr = '1900-01-01';
    const now = new Date();
    if (portfolioTimeFilter !== 'MAX') {
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

    const simulationStart = salarySettings.startDate || '2022-09-01';
    
    const simulatedUnits: Record<string, number> = {};
    let lastPayrollStr = '';
    const historicalPoints: { date: string, value: number, displayDate: string }[] = [];

    for (const day of sortedHistory) {
      if (day.date < simulationStart) continue;

      const date = new Date(day.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const currentDayStr = `${year}-${month + 1}-${date.getDate()}`;
      
      const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
      
      if (payrollDates.includes(currentDayStr) && currentDayStr !== lastPayrollStr) {
        lastPayrollStr = currentDayStr;
        const historicalSalary = estimateHistoricalSalary(salarySettings.baseSalary, day.date);
        // Total = 3% (Mandatory) + X% (Voluntary) + 3% (State Contribution) + 2% (State Compensation)
        const totalInvest = historicalSalary * ((3 + salarySettings.voluntaryPercent + 3 + 2) / 100);
        const perPaycheck = (salarySettings.paymentCycle === 'biweekly') ? totalInvest / 2 : totalInvest;

        Object.entries(salarySettings.targetAllocations || {}).forEach(([fund, percent]) => {
          const p = percent as number;
          if (p > 0) {
            const nav = day[fund] || 1;
            simulatedUnits[fund] = (simulatedUnits[fund] || 0) + (perPaycheck * (p / 100) / nav);
          }
        });
      }

      let dailyValue = 0;
      Object.entries(simulatedUnits).forEach(([fund, units]) => {
        dailyValue += units * (day[fund] || 0);
      });

      historicalPoints.push({
        date: day.date,
        displayDate: day.displayDate || day.date,
        value: dailyValue
      });
    }

    let scaleRatio = 0;
    if (historicalPoints.length > 0 && portfolioValue > 0) {
        const simLatest = historicalPoints[historicalPoints.length - 1].value;
        if (simLatest > 0) {
            scaleRatio = portfolioValue / simLatest;
        }
    }

    return historicalPoints
      .filter(p => p.date >= cutoffStr)
      .map(p => ({
        ...p,
        value: p.value * scaleRatio
      }));

  }, [historyData, portfolioTimeFilter, salarySettings, items, portfolioValue]);

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
    
    const currentSimUnits: Record<string, number> = {};
    let lastTempPayroll = '';
    let simCurrentPlanLatest = 0;
    
    for (const day of sortedHistory) {
      if (day.date < simulationStart) continue;
      const date = new Date(day.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const cDayStr = `${year}-${month + 1}-${date.getDate()}`;
      const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
      if (payrollDates.includes(cDayStr) && cDayStr !== lastTempPayroll) {
        lastTempPayroll = cDayStr;
        const histSalary = estimateHistoricalSalary(salarySettings.baseSalary, day.date);
        // Total = 3% (Mandatory) + X% (Voluntary) + 3% (State Contribution) + 2% (State Compensation)
        const totalInv = histSalary * ((3 + salarySettings.voluntaryPercent + 3 + 2) / 100);
        const pPay = (salarySettings.paymentCycle === 'biweekly') ? totalInv / 2 : totalInv;
        Object.entries(salarySettings.targetAllocations || {}).forEach(([fund, percent]) => {
          const p = percent as number;
          if (p > 0) {
            const nav = day[fund] || 1;
            currentSimUnits[fund] = (currentSimUnits[fund] || 0) + (pPay * (p / 100) / nav);
          }
        });
      }
      simCurrentPlanLatest = 0;
      Object.entries(currentSimUnits).forEach(([fund, units]) => {
        simCurrentPlanLatest += units * (day[fund] || 0);
      });
    }

    const scaleRatio = (portfolioValue > 0 && simCurrentPlanLatest > 0) ? (portfolioValue / simCurrentPlanLatest) : 1;

    activeBenchmarks.forEach(strategyId => {
      const strategy = customStrategies.find(s => s.id === strategyId);
      if (!strategy) return;

      const results: any[] = [];
      const strategyUnits: Record<string, number> = {};
      let lastBPayrollStr = '';

      for (const day of sortedHistory) {
         if (day.date < simulationStart) continue;

         const date = new Date(day.date);
         const year = date.getFullYear();
         const month = date.getMonth();
         const currentDayStr = `${year}-${month + 1}-${date.getDate()}`;
         
         const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
         if (payrollDates.includes(currentDayStr) && currentDayStr !== lastBPayrollStr) {
           lastBPayrollStr = currentDayStr;
           
           const historicalSalary = estimateHistoricalSalary(salarySettings.baseSalary, day.date);
           // Total = 3% (Mandatory) + X% (Voluntary) + 3% (State Contribution) + 2% (State Compensation)
           const totalInvest = historicalSalary * ((3 + salarySettings.voluntaryPercent + 3 + 2) / 100);
           const perPay = (salarySettings.paymentCycle === 'biweekly') ? totalInvest / 2 : totalInvest;
           
           Object.entries(strategy.allocations).forEach(([fund, percent]) => {
             const p = percent as number;
             if (p > 0) {
                const nav = day[fund] || 1;
                strategyUnits[fund] = (strategyUnits[fund] || 0) + (perPay * (p / 100) / nav);
             }
           });
         }
         
         if (day.date >= cutoffStr) {
           let dayTotalVal = 0;
           Object.entries(strategyUnits).forEach(([fund, units]) => {
              dayTotalVal += units * (day[fund] || 0);
           });
           results.push({ date: day.date, value: dayTotalVal * scaleRatio });
         }
      }
      benchmarks[strategyId] = results;
    });

    return benchmarks;
  }, [historyData, portfolioTimeFilter, salarySettings, activeBenchmarks, customStrategies, portfolioValue]);

  const combinedChartData = useMemo(() => {
    if (portfolioHistory.length === 0) return [];
    
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
        }
      });
      return entry;
    });
  }, [portfolioHistory, benchmarkHistory, activeBenchmarks]);

  const simulationStats = useMemo(() => {
    if (portfolioHistory.length < 2) return { change: 0, changePercent: 0, isUp: true };
    const firstNonZero = portfolioHistory.find(d => d.value > 0);
    if (!firstNonZero) return { change: 0, changePercent: 0, isUp: true };
    const first = firstNonZero.value;
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

  const transactionHistory = useMemo(() => {
    if (!historyData || historyData.length === 0 || !salarySettings.isAutoEnabled) return [];

    const ascendingHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));
    const simulationStart = salarySettings.startDate || '2022-09-01';
    
    let lastPayrollStr = '';
    const txs: { id: string, date: string, items: { fund: string, amount: number, nav: number, units: number }[], totalAmount: number }[] = [];

    for (const day of ascendingHistory) {
      if (day.date < simulationStart) continue;

      const date = new Date(day.date);
      const year = date.getFullYear();
      const month = date.getMonth();
      const currentDayStr = `${year}-${month + 1}-${date.getDate()}`;
      
      const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
      
      if (payrollDates.includes(currentDayStr) && currentDayStr !== lastPayrollStr) {
        lastPayrollStr = currentDayStr;
        const historicalSalary = estimateHistoricalSalary(salarySettings.baseSalary, day.date);
        // Total = 3% (Mandatory) + X% (Voluntary) + 3% (State Contribution) + 2% (State Compensation)
        const totalInvest = historicalSalary * ((3 + salarySettings.voluntaryPercent + 3 + 2) / 100);
        const perPaycheck = (salarySettings.paymentCycle === 'biweekly') ? totalInvest / 2 : totalInvest;

        const dayItems: { fund: string, amount: number, nav: number, units: number }[] = [];
        let actualTotal = 0;
        
        Object.entries(salarySettings.targetAllocations || {}).forEach(([fund, percent]) => {
          const p = percent as number;
          if (p > 0) {
            const nav = day[fund] || 1;
            const amount = perPaycheck * (p / 100);
            const units = amount / nav;
            dayItems.push({ fund, amount, nav, units });
            actualTotal += amount;
          }
        });
        
        if (dayItems.length > 0) {
          txs.push({
            id: currentDayStr,
            date: day.displayDate || day.date,
            items: dayItems,
            totalAmount: actualTotal
          });
        }
      }
    }
    
    return txs.reverse(); // Newest first
  }, [historyData, salarySettings]);

  const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899'];

  const nextUpdate = useMemo(() => {
    return getNextDisplayDate(salarySettings.paymentCycle);
  }, [salarySettings.paymentCycle]);

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
              <p className={clsx(
                "text-lg font-bold",
                monthlyGrowthPercent >= 0 ? "text-emerald-300" : "text-red-300"
              )}>
                {monthlyGrowthPercent >= 0 ? '+' : ''}{monthlyGrowthPercent.toFixed(2)}%
              </p>
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
          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 relative group overflow-hidden">
            <p className="text-xs text-slate-400 font-black uppercase tracking-wider mb-2">อัปเดตอัตโนมัติรอบถัดไป</p>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                {salarySettings.isAutoEnabled ? (
                  nextUpdate ? `${format(nextUpdate, 'd MMM', { locale: th })} ${nextUpdate.getFullYear() + 543}` : '---'
                ) : 'ปิดใช้งาน'}
              </p>
            </div>
            {salarySettings.isAutoEnabled && (
              <p className="text-[10px] text-slate-400 mt-1 font-bold">
                (+2 วันทำการหลังจากเงินเดือนออก เวลา 12:00)
              </p>
            )}
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          </div>

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
                ออม 3% + ออมเพิ่ม {salarySettings.voluntaryPercent}%
              </p>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-3xl border border-blue-100 dark:border-blue-800/30">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mb-2">รัฐสมทบ/ชดเชย</p>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-1">
                <span className="text-xs font-bold text-blue-500">฿</span>
                <p className="text-2xl font-black text-blue-700 dark:text-blue-300 leading-none">
                  {stateMonthlyContribution.toLocaleString()}
                </p>
              </div>
              <p className="text-xs font-bold text-blue-600/60 dark:text-blue-400/60 uppercase">สมทบ 3% + ชดเชย 2%</p>
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
            <p className="text-xs font-bold text-indigo-600/60 dark:text-indigo-400/60 uppercase mt-1">รวมออม {salarySettings.voluntaryPercent + 8}% ต่อเดือน</p>
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
           {customStrategies.map(bench => {
             const isCustom = bench.id !== 'Steady' && bench.id !== 'Growth' && bench.id !== 'Gold';
             const isActive = activeBenchmarks.includes(bench.id);
             
             return (
               <div 
                 key={bench.id} 
                 className={clsx(
                   "flex items-center gap-1 p-1 rounded-2xl transition-all border",
                   isActive 
                     ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm"
                     : "bg-transparent border-transparent"
                 )}
               >
                 <button
                   onClick={() => {
                     setActiveBenchmarks(prev => 
                       prev.includes(bench.id) ? prev.filter(b => b !== bench.id) : [...prev, bench.id]
                     );
                   }}
                   className={clsx(
                     "flex-1 flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold transition-colors",
                     isActive ? "text-slate-800 dark:text-white" : "text-slate-400"
                   )}
                 >
                   <div className={clsx("w-2 h-2 rounded-full", isActive ? "opacity-100" : "opacity-30")} style={{ backgroundColor: bench.color }} />
                   {bench.name}
                 </button>

                 {isCustom && (
                   <div className="flex items-center gap-0.5 pr-1 border-l border-slate-100 dark:border-slate-700/50 ml-1 pl-1">
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         setStrategyBeingEdited(bench);
                         setNewStrategyName(bench.name);
                         setNewStrategyAllocations(bench.allocations);
                         setIsCreatingStrategy(true);
                       }}
                       className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                     >
                       <Edit2 className="w-3.5 h-3.5" />
                     </button>
                     <button 
                       onClick={(e) => {
                         e.stopPropagation();
                         if (confirm('ยืนยันการลบกลยุทธ์นี้?')) {
                           setCustomStrategies(prev => prev.filter(s => s.id !== bench.id));
                           setActiveBenchmarks(prev => prev.filter(id => id !== bench.id));
                         }
                       }}
                       className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                     >
                       <Trash2 className="w-3.5 h-3.5" />
                     </button>
                   </div>
                 )}
               </div>
             );
           })}
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
                if (!data || !strat || data.length === 0) return null;
                
                const last = data[data.length - 1].value;
                // Find first non-zero value for benchmark baseline
                const firstNonZero = data.find(d => d.value > 0);
                const first = firstNonZero ? firstNonZero.value : 0;
                const change = first > 0 ? ((last - first) / first) * 100 : 0;
                
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
                            value={editUnits || ''}
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

        {/* --- Transaction History --- */}
        {salarySettings.isAutoEnabled && transactionHistory.length > 0 && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] p-6 shadow-sm flex flex-col h-full lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-500 flex-shrink-0" />
                  <span>รายการเคลื่อนไหวในบัญชีตามแผนออม</span>
                </h3>
                <p className="text-xs text-slate-400 font-medium ml-7 mt-1">รายการจำลองอิงตามรอบเงินเดือนที่คุณตั้งค่าไว้</p>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-xl text-xs font-bold self-start sm:self-auto shrink-0 flex items-center gap-1">
                {transactionHistory.length} รอบการออม
              </div>
            </div>
            
            {/* Desktop View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="pb-3 text-xs font-bold text-slate-400 pl-2 w-32">วันที่ซื้อ</th>
                    <th className="pb-3 text-xs font-bold text-slate-400">กองทุน</th>
                    <th className="pb-3 text-xs font-bold text-slate-400 text-right pr-6 w-32">จำนวนเงินสะสม</th>
                    <th className="pb-3 text-xs font-bold text-slate-400 text-right pr-2 w-48">หน่วยลงทุนที่ได้ (Units)</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {transactionHistory.slice(0, 10).map((tx, idx) => (
                    <React.Fragment key={tx.id}>
                      {tx.items.map((item, itemIdx) => (
                         <tr key={`${tx.id}-${item.fund}`} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                           <td className="py-3 pl-2 text-slate-600 dark:text-slate-300 font-medium">
                             {itemIdx === 0 ? (() => {
                               try {
                                 const d = new Date(tx.date);
                                 if (!isNaN(d.getTime())) return `${format(d, 'd MMM', { locale: th })} ${d.getFullYear() + 543}`;
                                 return tx.date;
                               } catch (e) {
                                 return tx.date;
                               }
                             })() : ''}
                           </td>
                           <td className="py-3">
                             <div className="flex items-center gap-2">
                               <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                               <span className="text-slate-800 dark:text-white font-bold text-xs">{item.fund}</span>
                             </div>
                           </td>
                           <td className="py-3 text-right pr-6 font-black text-emerald-600 dark:text-emerald-400">
                             +฿{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                           </td>
                           <td className="py-3 text-right pr-2 text-slate-500 font-mono text-xs font-medium">
                             <span className="text-slate-700 dark:text-slate-300">+{item.units.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                             <span className="text-[10px] ml-1 opacity-60 block sm:inline">(@ {item.nav.toFixed(4)})</span>
                           </td>
                         </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {transactionHistory.length > 10 && (
                <div className="text-center mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs text-slate-400 font-bold">แสดงเพียง 10 รอบล่าสุด (มีข้อมูลเชิงลึกเพิ่มเติมในรายงานฉบับเต็ม)</p>
                </div>
              )}
            </div>

            {/* Mobile View */}
            <div className="md:hidden space-y-3">
              {transactionHistory.slice(0, 10).map((tx) => (
                <details key={tx.id} className="group bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                  <summary className="list-none flex items-center justify-between p-4 cursor-pointer">
                    <div>
                      <div className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                         {(() => {
                            try {
                              const d = new Date(tx.date);
                              if (!isNaN(d.getTime())) return `${format(d, 'd MMM', { locale: th })} ${d.getFullYear() + 543}`;
                              return tx.date;
                            } catch (e) {
                              return tx.date;
                            }
                          })()}
                      </div>
                      <div className="text-xs text-slate-400 font-medium mt-0.5">
                        {tx.items.length} รายการ
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-emerald-600 dark:text-emerald-400 font-black text-sm">
                          +฿{tx.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-slate-400 transition-transform group-open:rotate-180 flex-shrink-0" />
                    </div>
                  </summary>
                  <div className="px-4 pb-4 space-y-4 border-t border-slate-100 dark:border-slate-800/50 pt-4">
                    {tx.items.map((item) => (
                       <div key={`${tx.id}-${item.fund}`} className="flex justify-between items-start">
                         <div className="flex items-start gap-3 min-w-0 flex-1">
                           <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                           <div className="min-w-0">
                             <p className="text-[11px] text-slate-400 font-black uppercase tracking-wider mb-0.5">กองทุน</p>
                             <p className="text-slate-800 dark:text-slate-200 font-bold text-sm leading-tight leading-none truncate">{item.fund}</p>
                           </div>
                         </div>
                         <div className="text-right pl-4 shrink-0">
                           <div className="mb-2">
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">จำนวนเงิน</p>
                             <p className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
                               +฿{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                             </p>
                           </div>
                           <div>
                             <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mb-0.5">หน่วยลงทุน (Units)</p>
                             <p className="text-slate-700 dark:text-slate-300 font-mono text-xs font-bold">
                               +{item.units.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                             </p>
                             <p className="text-[9px] text-slate-400 font-medium">@ {item.nav.toFixed(4)}</p>
                           </div>
                         </div>
                       </div>
                    ))}
                  </div>
                </details>
              ))}
              {transactionHistory.length > 10 && (
                <div className="text-center mt-3 pt-3">
                  <p className="text-xs text-slate-400 font-bold">แสดงเพียง 10 รอบล่าสุด</p>
                </div>
              )}
            </div>
          </div>
        )}
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
                      value={tempSalary || ''}
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
                      value={tempStartDate || ''}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className={clsx(
                        "w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-lg font-bold border-2 border-transparent focus:border-emerald-500 outline-none transition-all",
                        "opacity-0 absolute inset-0 z-10 cursor-pointer"
                      )}
                    />
                    <div className="w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-lg font-bold text-slate-800 dark:text-white border-2 border-slate-100 dark:border-slate-800 flex items-center justify-between">
                       <span>{tempStartDate ? (() => {
                         const d = new Date(tempStartDate);
                         const day = d.getDate();
                         const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                         const month = months[d.getMonth()];
                         const year = (d.getFullYear() + 543).toString();
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
                        value={tempVoluntary}
                        onChange={(e) => setTempVoluntary(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-slate-950 p-5 rounded-3xl text-2xl font-black text-indigo-600 border-2 border-transparent focus:border-indigo-500 outline-none appearance-none cursor-pointer"
                      >
                        {Array.from({length: 28}, (_, i) => i).map(v => <option key={v} value={v}>{v}%</option>)}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300">
                        <ChevronRight className="w-6 h-6 rotate-90" />
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 mt-2 ml-1">
                      เลือกสัดส่วนออมเพิ่มสมัครใจ 0% ถึง 27% (ไม่รวมออมบังคับ 3% และสมทบรัฐ 3%)
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
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={tempIsAutoEnabled || false}
                      onChange={(e) => setTempIsAutoEnabled(e.target.checked)}
                    />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    อัปเดดอัตโนมัติตามสัดส่วนที่ตั้งไว้ เมื่อมีการจ่ายเงินเพิ่ม
                  </p>
                </div>

                {/* --- Target Allocations within Salary Config --- */}
                <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-[32px] border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">สัดส่วนที่ต้องการ (ต้องครบ 100%)</label>
                    <div className={clsx(
                      "px-3 py-1 rounded-full text-[10px] font-black",
                      tempAllocationTotal === 100 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    )}>
                      TOTAL: {tempAllocationTotal}%
                    </div>
                  </div>

                  {hasTempGoldLimitError && (
                    <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-800/20">
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
                              max="100"
                              step="1"
                              value={currentVal}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                const otherTotal = tempAllocationTotal - currentVal;
                                
                                // If new val + others > 100, we need to reduce others proportionally
                                if (val + otherTotal > 100) {
                                  const overflow = (val + otherTotal) - 100;
                                  const nextAllocations = { ...tempAllocations, [fund]: val };
                                  
                                  // List of other funds that HAVE values to reduce
                                  const otherFunds = allFunds.filter(f => f !== fund && (tempAllocations[f] || 0) > 0);
                                  
                                  if (otherFunds.length > 0) {
                                    let remainingOverflow = overflow;
                                    
                                    // Sort other funds by value to reduce larger ones first (more stable feel)
                                    otherFunds.sort((a, b) => (tempAllocations[b] || 0) - (tempAllocations[a] || 0));
                                    
                                    otherFunds.forEach((f, idx) => {
                                      const currentOtherVal = tempAllocations[f] || 0;
                                      const deduction = idx === otherFunds.length - 1 ? remainingOverflow : Math.min(currentOtherVal, Math.round(overflow / otherFunds.length));
                                      nextAllocations[f] = Math.max(0, currentOtherVal - deduction);
                                      remainingOverflow -= deduction;
                                    });
                                    
                                    setTempAllocations(nextAllocations);
                                  } else {
                                    // Nothing else to reduce, just cap current
                                    setTempAllocations({ ...tempAllocations, [fund]: 100 });
                                  }
                                } else {
                                  setTempAllocations({ ...tempAllocations, [fund]: val });
                                }
                              }}
                              className="w-24 accent-emerald-600"
                            />
                            <span className="w-8 text-[11px] font-black text-slate-800 dark:text-white text-right">{currentVal}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">รอบการจ่ายเงินเดือน</label>
                    <div className="flex bg-slate-50 dark:bg-slate-800 p-1 rounded-xl">
                      <button 
                        onClick={() => setTempPaymentCycle('monthly')}
                        className={clsx("flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all", tempPaymentCycle === 'monthly' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
                      >
                        1 ครั้ง/เดือน
                      </button>
                      <button 
                        onClick={() => setTempPaymentCycle('biweekly')}
                        className={clsx("flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all", tempPaymentCycle === 'biweekly' ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm" : "text-slate-400")}
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
                          voluntaryPercent: tempVoluntary,
                          startDate: tempStartDate,
                          paymentCycle: tempPaymentCycle,
                          isAutoEnabled: tempIsAutoEnabled
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
                    value={newUnits || ''}
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
      
      {/* --- Strategy comparison Modal --- */}
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
                        const val = (newStrategyAllocations[fund] as number) || 0;
                        const otherTotal = Object.entries(newStrategyAllocations).reduce((sum: number, [f, v]) => f === fund ? sum : sum + (v as number), 0);
                        
                        return (
                          <div key={fund} className="flex items-center gap-3">
                            <span className="flex-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{fund}</span>
                            <div className="flex items-center gap-2">
                              <input 
                                type="range" min="0" max="100" step="1"
                                value={val}
                                onChange={(e) => {
                                  let requested = Number(e.target.value);
                                  if (requested + otherTotal > 100) {
                                    const overflow = (requested + otherTotal) - 100;
                                    const nextBatch = { ...newStrategyAllocations, [fund]: requested };
                                    const others = allFunds.filter(f => f !== fund && ((newStrategyAllocations[f] as number) || 0) > 0);
                                    
                                    if (others.length > 0) {
                                      let rem = overflow;
                                      others.sort((a, b) => ((newStrategyAllocations[b] as number) || 0) - ((newStrategyAllocations[a] as number) || 0));
                                      others.forEach((f, i) => {
                                        const cur = (newStrategyAllocations[f] as number) || 0;
                                        const dec = i === others.length - 1 ? rem : Math.min(cur, Math.round(overflow / others.length));
                                        nextBatch[f] = Math.max(0, cur - dec);
                                        rem -= dec;
                                      });
                                      setNewStrategyAllocations(nextBatch);
                                    } else {
                                      setNewStrategyAllocations({ ...newStrategyAllocations, [fund]: 100 });
                                    }
                                  } else {
                                    setNewStrategyAllocations({...newStrategyAllocations, [fund]: requested});
                                  }
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
                        (Object.values(newStrategyAllocations).reduce((a: number, b: number) => a + (b as number), 0) as number) === 100 ? "text-emerald-600" : "text-amber-500"
                      )}>
                        {Object.values(newStrategyAllocations).reduce((a: number, b: number) => a + (b as number), 0) as number}%
                        {(Object.values(newStrategyAllocations).reduce((a: number, b: number) => a + (b as number), 0) as number) < 100 && <span className="text-[10px] ml-2 font-bold">(ยังไม่ครบ 100%)</span>}
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
                      disabled={!newStrategyName || Object.values(newStrategyAllocations).reduce((a: number, b: number) => a + (b as number), 0) !== 100}
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
                        !newStrategyName || Object.values(newStrategyAllocations).reduce((a: number, b: number) => a + (b as number), 0) !== 100 
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
