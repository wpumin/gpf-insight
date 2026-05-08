import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, ChevronRight, User as UserIcon, PieChart, Wallet, Calendar, TrendingUp, Search, Info, Share2, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { collection, query, orderBy, onSnapshot, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
// Use default import for canvas-confetti
import confetti from 'canvas-confetti';
import { 
  PieChart as RePieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer,
  Tooltip as ReTooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899'];

// --- Helper Functions copied from MyPortfolio ---
const isBusinessDay = (date: Date) => {
  const day = date.getDay();
  return day !== 0 && day !== 6;
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
    dates.push(`${d16.getFullYear()}-${String(d16.getMonth() + 1).padStart(2, '0')}-${String(d16.getDate()).padStart(2, '0')}`);
  }

  // Round 2: End of month (3rd business day before the last business day)
  const lbd = getLastBusinessDay(year, month);
  const paydayRound2 = getSubBusinessDays(lbd, 3);
  dates.push(`${paydayRound2.getFullYear()}-${String(paydayRound2.getMonth() + 1).padStart(2, '0')}-${String(paydayRound2.getDate()).padStart(2, '0')}`);
  
  return dates;
};

interface LeaderboardProps {
    historyData?: any[];
    latestData?: any;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ historyData = [], latestData = {} }) => {
    const { user, signInWithGoogle, loading: authLoading } = useAuth();
    const [competitors, setCompetitors] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const hasCelebrated = useRef(false);

    const ADMIN_EMAILS = ['pumin.wo@gmail.com', 'pumin.wongsiri@gmail.com'];
    const isAdmin = user && ADMIN_EMAILS.includes(user.email || '');

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const q = query(
            collection(db, 'users'),
            orderBy('totalValue', 'desc'),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.totalValue !== undefined && data.totalValue > 0) {
                    list.push({ id: doc.id, ...data });
                }
            });
            setCompetitors(list);
            setLoading(false);
        }, (error) => {
            console.error("Leaderboard fetch error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const dynamicCompetitors = React.useMemo(() => {
        if (!historyData || historyData.length === 0 || !latestData) return competitors;

        const ascendingHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));

        return competitors.map(comp => {
            const manualItems = comp.portfolio || [];
            const settings = comp.salarySettings || {};
            let isAutoEnabled = settings.isAutoEnabled;
            if (isAutoEnabled === undefined) isAutoEnabled = false;

            let latestTxItems: any[] = [];
            let txs: any[] = [];
            
            if (isAutoEnabled) {
                const simulationStart = settings.startDate || '2022-09-01';
                let lastPayrollStr = '';
                
                const base = Number(settings.baseSalary) || 15000;
                const mand = Number(settings.contributionPercent || 3);
                const vol = Number(settings.voluntaryPercent || 0);
                const match = Number(settings.stateContributionPercent || 3);
                const compFixed = 2;
                const totalPct = mand + vol + match + compFixed;
                const monthlyTotal = base * (totalPct / 100);
                const rounds = settings.paymentCycle === 'biweekly' ? 2 : 1;
                const perRound = monthlyTotal / rounds;

                for (const day of ascendingHistory) {
                    if (day.date < simulationStart) continue;

                    const date = new Date(day.date);
                    const year = date.getFullYear();
                    const month = date.getMonth();
                    const currentDayStr = day.date;
                    
                    const payrollDates = getPayrollDates(year, month, settings.paymentCycle || 'monthly');
                    
                    if (payrollDates.includes(currentDayStr) && currentDayStr !== lastPayrollStr) {
                        lastPayrollStr = currentDayStr;
                        
                        const dayItems: any[] = [];
                        
                        Object.entries(settings.targetAllocations || {}).forEach(([fund, percent]) => {
                            const p = percent as number;
                            if (p > 0) {
                                const nav = day[fund] || 1;
                                const amount = perRound * (p / 100);
                                const units = amount / nav;
                                dayItems.push({ fund, units });
                            }
                        });
                        
                        if (dayItems.length > 0) {
                            txs.push({
                                id: currentDayStr,
                                items: dayItems
                            });
                        }
                    }
                }
                
                const reversedTxs = txs.reverse();
                if (reversedTxs.length > 0) {
                    latestTxItems = reversedTxs[0].items;
                }
            }

            const combined: Record<string, { manual: number, auto: number, total: number }> = {};
            
            manualItems.forEach((item: any) => {
                if (!combined[item.fund]) combined[item.fund] = { manual: 0, auto: 0, total: 0 };
                combined[item.fund].manual = item.units;
                combined[item.fund].total += item.units;
            });

            latestTxItems.forEach(item => {
                if (!combined[item.fund]) combined[item.fund] = { manual: 0, auto: 0, total: 0 };
                combined[item.fund].auto += item.units;
                combined[item.fund].total += item.units;
            });

            const displayPortfolio = Object.entries(combined).map(([fund, data]) => ({
                fund,
                units: data.total,
                total: data.total,
                manual: data.manual,
                auto: data.auto
            })).filter(i => i.total > 0);

            let calculatedTotalValue = 0;
            displayPortfolio.forEach(item => {
                let nav = latestData[item.fund] || 0;
                calculatedTotalValue += nav * item.total;
            });

            return {
                ...comp,
                totalValue: calculatedTotalValue > 0 ? calculatedTotalValue : comp.totalValue,
                portfolio: displayPortfolio
            };
        }).sort((a, b) => b.totalValue - a.totalValue);
    }, [competitors, historyData, latestData]);

    const filteredCompetitors = dynamicCompetitors.filter(c => 
        c.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const myRank = dynamicCompetitors.findIndex(c => c.id === user?.uid) + 1;
    // Handle Confetti for Top 3
    useEffect(() => {
        if (!loading && dynamicCompetitors.length > 0 && user && !hasCelebrated.current) {
            const myRank = dynamicCompetitors.findIndex(c => c.id === user.uid) + 1;
            if (myRank > 0 && myRank <= 3) {
                triggerConfetti();
                hasCelebrated.current = true;
            }
        }
    }, [loading, dynamicCompetitors, user]);

    // Handle Confetti when viewing a top 3 user
    useEffect(() => {
        if (selectedUser && dynamicCompetitors.length > 0) {
            const rank = dynamicCompetitors.findIndex(c => c.id === selectedUser.id) + 1;
            if (rank > 0 && rank <= 3) {
                triggerConfetti();
            }
        }
    }, [selectedUser, dynamicCompetitors]);

    // Leaderboard auto-sync for Admin
    useEffect(() => {
        if (!user || !isAdmin) return;
        if (loading || dynamicCompetitors.length === 0 || competitors.length === 0) return;

        // Calculate sync cutoff (Today at 12:00 GMT+7 -> 05:00 UTC)
        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setUTCHours(5, 0, 0, 0);
        
        // If it's before 5:00 UTC today, the cutoff for "latest update" should be yesterday's 5:00 UTC
        if (now < cutoff) {
            cutoff.setUTCDate(cutoff.getUTCDate() - 1);
        }

        const runSync = async () => {
            const batchConfig: any[] = [];
            for (let comp of competitors) {
                const dComp = dynamicCompetitors.find(c => c.id === comp.id);
                if (!dComp) continue;
                
                const lastSyncDate = comp.syncUpdatedAt ? new Date(comp.syncUpdatedAt) : new Date(0);
                
                if (lastSyncDate < cutoff || Math.abs(comp.totalValue - dComp.totalValue) > 5) {
                    batchConfig.push({
                        id: comp.id,
                        totalValue: dComp.totalValue,
                        calculatedPortfolio: dComp.portfolio,
                        syncUpdatedAt: new Date().toISOString()
                    });
                }
            }

            if (batchConfig.length > 0) {
                console.log(`Syncing ${batchConfig.length} users to Firestore...`);
                for (let b of batchConfig) {
                    try {
                        await setDoc(doc(db, 'users', b.id), {
                            totalValue: b.totalValue,
                            calculatedPortfolio: b.calculatedPortfolio,
                            syncUpdatedAt: b.syncUpdatedAt
                        }, { merge: true });
                    } catch(e) {
                        console.error('Failed to sync', b.id, e);
                    }
                }
            }
        };

        runSync();
    }, [user, loading, dynamicCompetitors, competitors]);

    const triggerConfetti = () => {
        const duration = 2 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    const anonymizeName = (name: string) => {
        if (!name) return 'Anonymous Member';
        const parts = name.split(' ');
        return parts.map(part => {
            if (part.length <= 1) return part;
            if (part.length === 2) return part[0] + '*';
            return part[0] + '*'.repeat(part.length - 2) + part[part.length - 1];
        }).join(' ');
    };

    const [isSharing, setIsSharing] = useState(false);

    const copyPortfolioLink = async (compId: string) => {
        if (isSharing) return;
        setIsSharing(true);
        
        // Build robust share URL: ensure it works across different hosting setups
        const url = `${window.location.origin}${window.location.pathname}#/leaderboard?user=${compId}`;
        
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'เช็คพอร์ต กบข. ของฉัน!',
                    text: 'ดูพอร์ตลงทุนและการจัดอันดับของฉันใน GPF Insight',
                    url: url,
                });
            } else {
                throw new Error('Share API not supported');
            }
        } catch (err: any) {
            if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
                console.error('Error sharing:', err);
                try {
                    await navigator.clipboard.writeText(url);
                    alert('คัดลอกลิงก์พอร์ตแล้ว!');
                } catch (clipErr) {
                    console.error('Clipboard fallback failed:', clipErr);
                }
            }
        } finally {
            setIsSharing(false);
        }
    };

    useEffect(() => {
        const hash = window.location.hash;
        const searchPart = hash.includes('?') ? hash.split('?')[1] : window.location.search.replace(/^\?/, '');
        const params = new URLSearchParams(searchPart);
        const userIdParam = params.get('user');
        
        if (!userIdParam) return;

        const handleUrlParam = async () => {
            if (dynamicCompetitors.length > 0) {
                const found = dynamicCompetitors.find(c => c.id === userIdParam);
                if (found) {
                    setSelectedUser(found);
                    const newHash = hash.split('?')[0];
                    window.history.replaceState({}, '', window.location.pathname + newHash);
                    return;
                }
            }

            try {
                const userDoc = await getDoc(doc(db, 'users', userIdParam));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setSelectedUser({ 
                        id: userDoc.id, 
                        ...data,
                        portfolio: data.calculatedPortfolio || data.portfolio
                    });
                    const newHash = hash.split('?')[0];
                    window.history.replaceState({}, '', window.location.pathname + newHash);
                }
            } catch (err) {
                console.error("Error fetching shared user profile:", err);
            }
        };

        handleUrlParam();
    }, [competitors]);


    const selectedUserHistory = React.useMemo(() => {
        if (!selectedUser || historyData.length === 0) return [];
        
        const salarySettings = selectedUser.salarySettings || {
            baseSalary: 15000,
            contributionPercent: 3,
            voluntaryPercent: 3,
            stateContributionPercent: 3,
            paymentCycle: 'monthly',
            targetAllocations: { "แผนลงทุนพื้นฐานทั่วไป": 100 },
            startDate: '2022-09-01'
        };
        
        const sortedHistory = [...historyData].sort((a, b) => a.date.localeCompare(b.date));
        let simulationStart = salarySettings.startDate || (sortedHistory.length > 0 ? sortedHistory[0].date : '2022-09-01');
        
        if (sortedHistory.length > 0 && simulationStart < sortedHistory[0].date) {
            simulationStart = sortedHistory[0].date;
        }
        
        const simulatedUnits: Record<string, number> = {};
        let lastPayrollStr = '';
        const historicalPoints: any[] = [];

        for (const day of sortedHistory) {
            if (day.date < simulationStart) continue;

            const date = new Date(day.date);
            const year = date.getFullYear();
            const month = date.getMonth();
            const currentDayStr = day.date; // Use day.date directly since it is padded
            
            const payrollDates = getPayrollDates(year, month, salarySettings.paymentCycle);
            
            if (payrollDates.includes(currentDayStr) && currentDayStr !== lastPayrollStr) {
                lastPayrollStr = currentDayStr;
                
                const base = Number(salarySettings.baseSalary) || 15000;
                const mand = Number(salarySettings.contributionPercent || 3);
                const vol = Number(salarySettings.voluntaryPercent || 0);
                const match = Number(salarySettings.stateContributionPercent || 3);
                const compFixed = 2;
                const totalPct = mand + vol + match + compFixed;
                const monthlyTotal = base * (totalPct / 100);
                const rounds = salarySettings.paymentCycle === 'biweekly' ? 2 : 1;
                const perPaycheck = monthlyTotal / rounds;

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

        let scaleRatio = 1;
        if (historicalPoints.length > 0 && selectedUser.totalValue > 0) {
            const simLatest = historicalPoints[historicalPoints.length - 1].value;
            if (simLatest > 0) {
                scaleRatio = selectedUser.totalValue / simLatest;
            }
        }

        return historicalPoints.map(p => ({
            ...p,
            value: Number((p.value * scaleRatio).toFixed(2))
        }));
    }, [selectedUser, historyData]);

    if (!user && !authLoading && !selectedUser) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 px-4">
                <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-3xl flex items-center justify-center">
                    <Trophy className="w-10 h-10 text-amber-600" />
                </div>
                <div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white">เข้าสู่ระบบเพื่อดูอันดับ</h2>
                    <p className="text-slate-500 max-w-xs mx-auto mt-2 text-sm">เข้าร่วมการจัดอันดับและเปรียบเทียบแผนการลงทุนกับเพื่อนสมาชิก กบข. ท่านอื่นๆ</p>
                </div>
                <button 
                    onClick={signInWithGoogle}
                    className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-4 px-8 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-none active:scale-95 transition-all text-sm mb-20"
                >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" />
                    </svg>
                    เข้าสู่ระบบด้วยบัญชี Google
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-28">
            {/* Header section */}
            <section className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-[32px] p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
                            <Trophy className="w-8 h-8 text-amber-200" />
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black tracking-tight">ทำเนียบนักลงทุน</h2>
                            <p className="text-amber-100/70 text-[10px] sm:text-xs font-bold uppercase tracking-widest leading-none">GPF Leaderboard</p>
                            <p className="text-[10px] text-amber-200/60 font-black uppercase tracking-widest mt-1">อัปเดตรายวัน 12:00 น.</p>
                        </div>
                    </div>
                    
                    {user && myRank > 0 && (
                        <div className="mt-8 flex items-center gap-4 sm:gap-6">
                            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-2xl border border-white/10">
                                <p className="text-[10px] font-black uppercase text-amber-200/60 mb-0.5">อันดับของคุณ</p>
                                <p className="text-lg sm:text-xl font-black">#{myRank}</p>
                            </div>
                            <div className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-2xl border border-white/10">
                                <p className="text-[10px] font-black uppercase text-amber-200/60 mb-0.5">จากทั้งหมด</p>
                                <p className="text-lg sm:text-xl font-black">{dynamicCompetitors.length} คน</p>
                            </div>
                        </div>
                    )}
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/4" />
            </section>

            {/* List */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] overflow-hidden shadow-sm">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="ค้นหาเพื่อนร่วมแผน..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium focus:ring-2 focus:ring-amber-500 transition-all"
                        />
                    </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {loading ? (
                        <div className="py-24 flex flex-col items-center justify-center space-y-4">
                            <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                            <p className="text-slate-400 font-bold animate-pulse">กำลังเรียกข้อมูลทำเนียบนักลงทุน...</p>
                        </div>
                    ) : filteredCompetitors.length === 0 ? (
                        <div className="py-24 flex flex-col items-center justify-center text-center px-6">
                            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4 text-slate-300">
                                <Search className="w-8 h-8" />
                            </div>
                            <h3 className="font-bold text-slate-800 dark:text-white">ไม่พบข้อมูล</h3>
                            <p className="text-sm text-slate-500 mt-1">ไม่พบรายชื่อเพื่อนสมาชิกที่คุณค้นหา ลองเปลี่ยนคำค้นหาดูใหม่</p>
                        </div>
                    ) : (
                        filteredCompetitors.map((comp, idx) => {
                            const rank = dynamicCompetitors.findIndex(c => c.id === comp.id) + 1;
                            const isMe = comp.id === user?.uid;
                            
                            return (
                                <motion.button
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    key={comp.id}
                                    onClick={() => setSelectedUser(comp)}
                                    className={clsx(
                                        "w-full flex items-center gap-3 sm:gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all text-left",
                                        isMe && "bg-emerald-50/30 dark:bg-emerald-500/5"
                                    )}
                                >
                                    <div className="flex items-center justify-center w-8 text-base sm:text-lg font-black text-slate-400 italic shrink-0">
                                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                                    </div>
                                    
                                    <div className="relative shrink-0">
                                        {comp.photoURL ? (
                                            <img src={comp.photoURL} alt="p" className="w-10 h-10 rounded-xl" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                <UserIcon className="w-5 h-5 text-slate-400" />
                                            </div>
                                        )}
                                        {isMe && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-slate-800 dark:text-white truncate text-sm sm:text-base">
                                            {isMe || isAdmin ? comp.displayName : anonymizeName(comp.displayName)}
                                        </h3>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest truncate">
                                            {comp.updatedAt ? new Date(comp.updatedAt).toLocaleDateString('th-TH', { 
                                                year: 'numeric', 
                                                month: 'short', 
                                                day: 'numeric' 
                                            }) : '...'}
                                        </p>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <p className="font-black text-slate-800 dark:text-white text-sm sm:text-base">
                                            ฿{comp.totalValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </p>
                                        <div className="flex items-center justify-end gap-1 text-[10px] font-bold text-emerald-500">
                                            <TrendingUp className="w-2.5 h-2.5" />
                                            Active
                                        </div>
                                    </div>
                                    
                                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                                </motion.button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal for detail view */}
            <AnimatePresence>
                {selectedUser && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedUser(null)}
                            className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ y: "100%" }}
                            animate={{ y: 0 }}
                            exit={{ y: "100%" }}
                            className="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-[32px] sm:rounded-[40px] overflow-hidden relative shadow-2xl flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 sm:p-8 pb-4 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="relative shrink-0">
                                        {selectedUser.photoURL ? (
                                            <img src={selectedUser.photoURL} alt="p" className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl shadow-lg border-2 border-white dark:border-slate-800" />
                                        ) : (
                                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                <UserIcon className="w-6 h-6 sm:w-8 sm:h-8 text-slate-400" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="text-lg sm:text-xl font-black text-slate-800 dark:text-white truncate pr-2">
                                            {selectedUser.id === user?.uid || isAdmin ? selectedUser.displayName : anonymizeName(selectedUser.displayName)}
                                        </h3>
                                        <p className="text-[12px] sm:text-sm font-bold text-slate-400 uppercase tracking-wider">สมาชิก กบข. Insight</p>
                                    </div>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            copyPortfolioLink(selectedUser.id);
                                        }}
                                        disabled={isSharing}
                                        className="p-3 bg-slate-50 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-slate-500 hover:text-emerald-600 rounded-2xl transition-all shadow-sm shrink-0 border border-slate-100 dark:border-slate-800 flex items-center justify-center"
                                        title="แชร์พอร์ต"
                                    >
                                        <Share2 className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3 mb-8">
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 min-w-0">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest truncate">มูลค่าพอร์ต</p>
                                        <p className="text-sm sm:text-lg font-black text-slate-800 dark:text-white break-all">฿{selectedUser.totalValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-800 min-w-0">
                                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest truncate">เริ่มลงทุน</p>
                                        <p className="text-sm sm:text-lg font-black text-slate-800 dark:text-white">
                                            {selectedUser.salarySettings?.startDate ? new Date(selectedUser.salarySettings.startDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'short' }) : '---'}
                                        </p>
                                    </div>
                                </div>

                                <div className="space-y-8 mb-4">
                                    {selectedUserHistory.length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-wider">มูลค่าพอร์ตย้อนหลัง</h4>
                                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                                            </div>
                                            <div className="h-56 w-full bg-slate-50/50 dark:bg-slate-950/50 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 overflow-hidden">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <AreaChart data={selectedUserHistory}>
                                                        <defs>
                                                            <linearGradient id="colorValueSelected" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                                                                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                                            </linearGradient>
                                                        </defs>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.1} />
                                                        <XAxis dataKey="date" hide />
                                                        <YAxis hide domain={['auto', 'auto']} />
                                                        <ReTooltip 
                                                            content={({ active, payload }) => {
                                                                if (active && payload && payload.length) {
                                                                    const val = Number(payload[0].value);
                                                                    return (
                                                                        <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700">
                                                                            <p className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">{payload[0].payload.displayDate}</p>
                                                                            <p className="text-sm font-black text-emerald-600">฿{val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            }}
                                                        />
                                                        <Area 
                                                            type="monotone" 
                                                            dataKey="value" 
                                                            stroke="#10B981" 
                                                            strokeWidth={4}
                                                            fillOpacity={1} 
                                                            fill="url(#colorValueSelected)" 
                                                            animationDuration={1500}
                                                        />
                                                    </AreaChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-wider">พอร์ตลงทุน (Portfolio)</h4>
                                            <PieChart className="w-4 h-4 text-slate-400" />
                                        </div>
                                        
                                        {selectedUser.portfolio && selectedUser.portfolio.length > 0 ? (
                                            <>
                                                <div className="h-44 w-full">
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <RePieChart>
                                                            <Pie
                                                                data={selectedUser.portfolio}
                                                                cx="50%"
                                                                cy="50%"
                                                                innerRadius={45}
                                                                outerRadius={65}
                                                                paddingAngle={5}
                                                                dataKey="units"
                                                            >
                                                                {selectedUser.portfolio.map((_: any, index: number) => (
                                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={4} />
                                                                ))}
                                                            </Pie>
                                                            <ReTooltip 
                                                                content={({ active, payload }) => {
                                                                    if (active && payload && payload.length) {
                                                                        return (
                                                                            <div className="bg-white dark:bg-slate-800 p-2 rounded-lg shadow-xl border border-slate-100 dark:border-slate-700 text-[10px] font-bold">
                                                                                {payload[0].name}
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                }}
                                                            />
                                                        </RePieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {selectedUser.portfolio.map((item: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                <div className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">{item.fund}</span>
                                                            </div>
                                                            <span className="text-[11px] font-black text-slate-800 dark:text-white shrink-0 ml-2">
                                                                {item.units.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} Units
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                                                <p className="text-slate-400 text-sm font-bold italic">ไม่พบข้อมูลกองทุน</p>
                                            </div>
                                        )}
                                    </div>

                                    {selectedUser.salarySettings?.targetAllocations && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-[12px] font-black text-slate-800 dark:text-white uppercase tracking-wider">สัดส่วนที่เป้าหมาย</h4>
                                                <TrendingUp className="w-4 h-4 text-slate-400" />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {(() => {
                                                    const validAllocs = Object.entries(selectedUser.salarySettings!.targetAllocations as Record<string, number>)
                                                        .filter(([_, val]) => val > 0);
                                                    const totalAlloc = validAllocs.reduce((sum, [_, val]) => sum + val, 0);

                                                    return validAllocs.map(([name, val], idx) => {
                                                        const displayVal = totalAlloc > 0 ? Math.round((val / totalAlloc) * 100) : 0;
                                                        return (
                                                            <div key={idx} className="flex flex-col gap-1 p-3 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                                                                <span className="text-[9px] font-black uppercase text-slate-400 truncate tracking-wider">{name}</span>
                                                                <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{displayVal}%</span>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <button 
                                    onClick={() => setSelectedUser(null)}
                                    className="w-full mt-4 p-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-3xl active:scale-95 transition-all shadow-xl shadow-slate-900/20 dark:shadow-white/5 mb-8"
                                >
                                    ปิดหน้าต่าง
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <div className="bg-emerald-50 dark:bg-emerald-950/20 p-6 rounded-[32px] border border-emerald-100 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 shadow-sm shadow-emerald-500/5">
                <div className="flex items-center gap-3 mb-2">
                    <Info className="w-5 h-5 shrink-0" />
                    <h4 className="font-black text-sm uppercase tracking-wider">เกี่ยวกับการจัดอันดับ</h4>
                </div>
                <p className="text-[11px] leading-relaxed opacity-80 font-bold">
                    อันดับคำนวณจากมูลค่าพอร์ตปัจจุบัน (Current Value) ของสมาชิกแต่ละท่าน โดยอิงจากจำนวนหน่วยลงทุนที่บันทึกไว้ และสัดส่วนการลงทุนที่ท่านเลือกใช้งาน ข้อมูลทั้งหมดเป็นเพียงการเปรียบเทียบในแอปเพื่อความสนุกสนานและเป็นแนวทางในการศึกษาแผนการลงทุนของเพื่อนสมาชิก
                </p>
            </div>
        </div>
    );
};
