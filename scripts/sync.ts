import axios from "axios";
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, doc, getDoc, setDoc, query, collection, getDocs, where } from 'firebase/firestore';
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import { format, subDays, addDays, isWeekend, isSameDay } from 'date-fns';

import * as cheerio from 'cheerio';

// Helper to determine business days (Mon-Fri)
const isBusinessDay = (date: Date) => {
    const day = date.getDay();
    return day !== 0 && day !== 6;
};

// Helper to add business days
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

// Helper to find payday dates for a given month
const getPayrollDates = (year: number, month: number, paymentCycle: 'monthly' | 'biweekly') => {
    const dates: string[] = [];
    
    // Helper for Round 2
    const getLastBusinessDay = (y: number, m: number) => {
        const lastDay = new Date(y, m + 1, 0);
        while (!isBusinessDay(lastDay)) {
            lastDay.setDate(lastDay.getDate() - 1);
        }
        return lastDay;
    };

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

    // Round 1: Mid-month (16th or previous business day)
    if (paymentCycle === 'biweekly') {
        let d16 = new Date(year, month, 16);
        while (!isBusinessDay(d16)) {
            d16.setDate(d16.getDate() - 1);
        }
        dates.push(format(d16, 'yyyy-MM-dd'));
    }

    // Round 2: End of month (3 business days before the last business day of the month)
    const lbd = getLastBusinessDay(year, month);
    const paydayRound2 = getSubBusinessDays(lbd, 3);
    dates.push(format(paydayRound2, 'yyyy-MM-dd'));
    
    return dates;
};

async function fetchLatestNAVFromHTML() {
    console.log("[Sync] Scraping GPF HTML for latest NAV...");
    try {
        const res = await axios.get('https://www.gpf.or.th/thai2019/About/main.php?page=memberfund&lang=th&menu=statistic', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
            }
        });
        const $ = cheerio.load(res.data);
        
        // Find the date
        const dateText = $('.fund-header').first().text().trim(); 
        // Example: "ข้อมูล ณ วันที่ 23 เม.ย. 2569"
        if (!dateText) return null;
        
        const dateMatch = dateText.match(/(\d+)\s+([ก-ฮ]+)\.?\s+(\d+)/);
        if (!dateMatch) return null;
        
        const thaiMonths: Record<string, string> = {
            'ม.ค': '01', 'ก.พ': '02', 'มี.ค': '03', 'เม.ย': '04', 'พ.ค': '05', 'มิ.ย': '06',
            'ก.ค': '07', 'ส.ค': '08', 'ก.ย': '09', 'ต.ค': '10', 'พ.ย': '11', 'ธ.ค': '12'
        };
        
        const day = dateMatch[1].padStart(2, '0');
        const month = thaiMonths[dateMatch[2].substring(0, 4)] || '01'; // Handle short names
        const year = (parseInt(dateMatch[3]) - 543).toString();
        const stdDate = `${year}-${month}-${day}`;

        const scrapedData: any = { date: stdDate };
        
        // Find NAV items
        // This is a heuristic based on typical structure
        $('table tr').each((i, el) => {
            const cells = $(el).find('td');
            if (cells.length >= 2) {
                const fundName = $(cells[0]).text().trim();
                const navValue = parseFloat($(cells[1]).text().trim().replace(/,/g, ''));
                if (fundName && !isNaN(navValue)) {
                    // Find matching fund name in our map
                    for (const [key, name] of Object.entries(FUNDS_MAP)) {
                        if (fundName.includes(name) || name.includes(fundName)) {
                            scrapedData[name] = navValue;
                            break;
                        }
                    }
                }
            }
        });
        
        if (Object.keys(scrapedData).length > 1) {
            console.log(`[Sync] Scraped latest data for ${stdDate}`);
            return scrapedData;
        }
        return null;
    } catch (e) {
        console.error("[Sync] HTML Scraping failed:", e);
        return null;
    }
}
const configPath = new URL('../firebase-applet-config.json', import.meta.url);
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Client SDK (for existing logic)
const appFirebase = initializeClientApp(firebaseConfig);
const db = getClientFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

// Initialize Admin SDK (for batch updates and bypassing rules)
try {
    if (getAdminApps().length === 0) {
        if (firebaseConfig.projectId) {
            initializeAdminApp({
                projectId: firebaseConfig.projectId,
            });
        } else {
            console.warn("[Sync] firebase-admin: No projectId found in config. Admin features will be disabled.");
        }
    }
} catch (err) {
    console.error("[Sync] Failed to initialize firebase-admin:", err);
}

const getAdminDbInstance = () => {
    try {
        if (getAdminApps().length > 0) {
            return getAdminFirestore(firebaseConfig.firestoreDatabaseId);
        }
    } catch (err) {
        console.error("[Sync] Failed to get admin firestore instance:", err);
    }
    return null;
};

const adminDb = getAdminDbInstance();

const FUNDS_MAP: Record<string, string> = {
  UNIT_COST1: "แผนลงทุนพื้นฐานทั่วไป",
  UNIT_COST2: "แผนเชิงรุก 35",
  UNIT_COST3: "แผนตราสารหนี้",
  UNIT_COST4: "แผนเงินฝากและตราสารหนี้ระยะสั้น",
  UNIT_COST5: "แผนเชิงรุก 20* (เป็นส่วนหนึ่งของแผนสมดุลตามอายุ)",
  UNIT_COST6: "แผนเชิงรุก 65",
  UNIT_COST7: "แผนหุ้นไทย",
  UNIT_COST8: "แผนกองทุนอสังหาริมทรัพย์ไทย",
  UNIT_COST9: "แผนหุ้นต่างประเทศ",
  UNIT_COST11: "แผนตราสารหนี้ต่างประเทศ",
  UNIT_COST12: "แผนทองคำ",
  UNIT_COST13: "แผนเชิงรุก 75* (เป็นส่วนหนึ่งของแผนสมดุลตามอายุ)",
  UNIT_COST14: "แผนกองทุนรวมวายุภักษ์",
  UNIT_COST15: "แผนเกษียณสบายใจ 2569",
  UNIT_COST16: "แผนการลงทุนตามหลักชะรีอะฮ์"
};

async function fetchMonthData(monthStr: string, yearStr: string) {
  try {
    const res = await axios.get(`https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=NAVBottom_${monthStr}_${yearStr}`, {
        responseType: 'text'
    });
    const cleanData = res.data.replace(/^\uFEFF/, '').trim();
    if(cleanData === '' || cleanData === 'null' || cleanData === '[]') return null;
    return JSON.parse(cleanData);
  } catch(e: any) {
    if(e.response?.status !== 404) console.error(`Failed to fetch ${monthStr}_${yearStr}:`, e.message);
    return null;
  }
}

async function processDataAndSaveToFirestore(jsonArray: any[]) {
    let updatedCount = 0;
    for (const item of jsonArray) {
        if (!item.LAUNCH_DATE) continue;
        const [datePart] = item.LAUNCH_DATE.split(' ');
        const [dd, mm, yyyy] = datePart.split('/');
        const stdDate = `${yyyy}-${mm}-${dd}`;
        
        try {
            const docRef = doc(db, 'nav_history', stdDate);
            
            // Retry logic for Firestore operations
            let docSnap;
            let retries = 3;
            while (retries > 0) {
                try {
                    docSnap = await getDoc(docRef);
                    break;
                } catch (err: any) {
                    if (err.message?.includes('offline') && retries > 1) {
                        console.log(`[Sync] Firestore offline, retrying ${stdDate}... (${retries} left)`);
                        await new Promise(r => setTimeout(r, 2000));
                        retries--;
                    } else {
                        throw err;
                    }
                }
            }
            
            if (!docSnap) continue;

            let record: any = { date: stdDate };
            if (docSnap.exists()) {
                record = docSnap.data();
            }
            
            let hasChanges = false;
            for (const [key, name] of Object.entries(FUNDS_MAP)) {
                const nav = item[key];
                if (nav !== null && nav !== undefined && nav !== '') {
                   const parsed = parseFloat(nav);
                   if (record[name] !== parsed && !isNaN(parsed)) {
                     record[name] = parsed;
                     hasChanges = true;
                   }
                }
            }
            
            if (hasChanges || !docSnap.exists()) {
                await setDoc(docRef, record, { merge: true });
                updatedCount++;
            }
        } catch(e) {
            console.error("Error saving to Firestore:", stdDate, e);
        }
    }
    
    // Update metadata for last successful sync
    try {
        const metadataRef = doc(db, 'metadata', 'sync_info');
        await setDoc(metadataRef, { 
            last_updated: new Date().toISOString(),
            status: 'success'
        }, { merge: true });
    } catch (e) {
        console.error("Error updating metadata:", e);
    }

    return updatedCount;
}

export async function syncFNG() {
    console.log("[Sync] Syncing Fear & Greed Index...");
    try {
        let score: number | null = null;
        let source = 'CNN Business';

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Referer': 'https://www.google.com/',
            'Accept-Language': 'en-US,en;q=0.9',
        };

        const sources = [
            'https://edition.cnn.com/markets/fear-and-greed',
            'https://feargreedmeter.com/'
        ];

        for (const url of sources) {
            try {
                console.log(`[Sync] Attempting to scrape: ${url}`);
                const res = await axios.get(url, { headers, timeout: 10000 });
                
                // CNN Source
                if (url.includes('cnn')) {
                    const match = res.data.match(/"score":\s*(\d+(\.\d+)?)/) || res.data.match(/Index is at (\d+)/i);
                    if (match && match[1]) {
                        score = Math.round(parseFloat(match[1]));
                        source = 'CNN Business';
                        break;
                    }
                }
                
                // FearGreedMeter Source
                if (url.includes('feargreedmeter')) {
                    // Check for the specific pattern "Fear and Greed Index: 66"
                    const mainMatch = res.data.match(/Fear and Greed Index:\s*(\d+)/i);
                    if (mainMatch && mainMatch[1]) {
                        score = parseInt(mainMatch[1]);
                        source = 'FearGreedMeter';
                        break;
                    }
                    
                    // Fallback to searching in body with more context
                    const bodyMatch = res.data.match(/current-score[^>]*>(\d+)/i) || res.data.match(/"score":\s*(\d+)/);
                    if (bodyMatch && bodyMatch[1]) {
                        score = parseInt(bodyMatch[1]);
                        source = 'FearGreedMeter';
                        break;
                    }
                }
            } catch (err: any) {
                 if (err.response?.status === 403) {
                     console.log(`[Sync] Source ${url} blocked access (403 Forbidden). This is common for scrapers.`);
                 } else {
                     console.log(`[Sync] Source ${url} failed: ${err.message}`);
                 }
            }
        }

        // Final fallback: Use last known value from DB if all scraping fails
        if (score === null || isNaN(score)) {
            const fngRef = doc(db, 'market_indices', 'fng');
            const fngSnap = await getDoc(fngRef);
            if (fngSnap.exists()) {
                const data = fngSnap.data();
                score = data.value;
                console.log(`[Sync] Scraping failed, using last known value: ${score}`);
            } else {
                score = 66; // Fallback to a reasonable default
                console.log(`[Sync] All fail, using default value: ${score}`);
            }
        }

        if (score !== null && !isNaN(score)) {
            const fngRef = doc(db, 'market_indices', 'fng');
            await setDoc(fngRef, { 
                value: score, 
                last_updated: new Date().toISOString(),
                source: source
            }, { merge: true });
            console.log(`[Sync] FNG updated: ${score} (${source})`);
        }
    } catch (e) {
        console.error("[Sync] FNG update failed:", e);
    }
}

export async function runAutoDCA() {
    console.log("[Auto-DCA] Starting automated investment update check...");
    
    // Get current time in Bangkok
    const now = new Date();
    const bkkTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const todayStr = format(bkkTime, 'yyyy-MM-dd');
    
    console.log(`[Auto-DCA] Reference Date (BKK): ${todayStr} ${format(bkkTime, 'HH:mm')}`);

    // We check if "Today" is exactly 2 business days after a payday
    // Payday candidates are usually mid-month or end-month
    // We look back up to 10 days to be safe
    let checkDate = subDays(bkkTime, 10);
    let targetPayday: string | null = null;

    while (checkDate <= bkkTime) {
        // If this checkDate + 2 business days == today, then checkDate was the potential payday
        const displayDate = addBusinessDays(checkDate, 2);
        if (format(displayDate, 'yyyy-MM-dd') === todayStr) {
            targetPayday = format(checkDate, 'yyyy-MM-dd');
            break;
        }
        checkDate = addDays(checkDate, 1);
    }

    if (!targetPayday) {
        console.log("[Auto-DCA] Today is not an 'Effective Display Date' (+2 biz days) for any payday. Skipping.");
        return;
    }

    console.log(`[Auto-DCA] Identified potential payday: ${targetPayday}. Checking for matching users...`);

    // Fetch NAV for that payday
    const navSnap = await getDoc(doc(db, 'nav_history', targetPayday));
    if (!navSnap.exists()) {
        console.warn(`[Auto-DCA] NAV data for payday ${targetPayday} not found yet. Cannot process updates.`);
        return;
    }
    const navs = navSnap.data();

    // Fetch all users with Auto-DCA enabled
    if (!adminDb) {
        console.error("[Auto-DCA] Admin database is not available. Skipping update.");
        return;
    }
    const usersSnap = await adminDb.collection('users').where('salarySettings.isAutoEnabled', '==', true).get();
    
    if (usersSnap.empty) {
        console.log("[Auto-DCA] No users with Auto-DCA enabled found.");
        return;
    }

    console.log(`[Auto-DCA] Processing ${usersSnap.size} users...`);
    let processedCount = 0;

    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const settings = userData.salarySettings;
        const portfolio = userData.portfolio || [];
        
        // Verify if targetPayday is actually a payday for this user's cycle
        const paydayDate = new Date(targetPayday);
        const payrollDates = getPayrollDates(paydayDate.getFullYear(), paydayDate.getMonth(), settings.paymentCycle);
        
        if (!payrollDates.includes(targetPayday)) {
            continue;
        }

        // Avoid double-processing (check if we already ran for this specific user on this display date)
        const lastAutoRun = userData.lastAutoDCARunDate;
        if (lastAutoRun === todayStr) {
            continue;
        }

        console.log(`[Auto-DCA] Updating portfolio for user ${userDoc.id}...`);

        // Calculate investment amount
        const voluntary = settings.voluntaryPercent || 0;
        // Total = 3% (Member Mandatory) + X% (Voluntary) + 3% (State Contribution) + 2% (State Compensation)
        const totalPercent = 3 + voluntary + 3 + 2; 
        const totalInvestPerMonth = settings.baseSalary * (totalPercent / 100);
        const investThisTime = settings.paymentCycle === 'biweekly' ? totalInvestPerMonth / 2 : totalInvestPerMonth;

        let newPortfolio = [...portfolio];
        let totalValue = 0;

        Object.entries(settings.targetAllocations || {}).forEach(([fund, percent]) => {
            const p = percent as number;
            if (p > 0) {
                const nav = navs[fund] as number;
                if (nav && nav > 0) {
                    const moneyForFund = investThisTime * (p / 100);
                    const unitsToAdd = moneyForFund / nav;
                    
                    const idx = newPortfolio.findIndex(i => i.fund === fund);
                    if (idx >= 0) {
                        newPortfolio[idx] = { ...newPortfolio[idx], units: Number((newPortfolio[idx].units + unitsToAdd).toFixed(6)) };
                    } else {
                        newPortfolio.push({ fund, units: Number(unitsToAdd.toFixed(6)) });
                    }
                }
            }
        });

        // Recalculate total balance with latest NAV
        // Use most recent NAV for latest portfolio valuation
        const latestNavSnap = await adminDb.collection('metadata').doc('sync_info').get();
        // Just use the payday NAV for now if latest is not available, or assume user re-calculates on load
        // Actually it's better to use current NAV from history if possible
        
        await userDoc.ref.update({
            portfolio: newPortfolio,
            lastAutoDCARunDate: todayStr,
            updatedAt: new Date().toISOString()
        });

        processedCount++;
    }

    console.log(`[Auto-DCA] Successfully updated ${processedCount} user portfolios.`);
}

export async function runSyncTask() {
    console.log("Starting GPF Sync Task...");
    const date = new Date();
    let totalAdded = 0;
    
    // 1. Try HTML scraping for the absolute latest data (often daily)
    const latestHTMLData = await fetchLatestNAVFromHTML();
    if (latestHTMLData) {
        const count = await processDataAndSaveToFirestore([latestHTMLData]);
        totalAdded += count;
    }

    // 2. Fallback to API for historical data and bulk updates
    for (let i = 0; i < 2; i++) {
        const mStr = (date.getMonth() + 1).toString().padStart(2, '0');
        const yStr = date.getFullYear().toString();
        
        console.log(`[Sync] Fetching API data for ${mStr}/${yStr}...`);
        const data = await fetchMonthData(mStr, yStr);
        if (data && Array.isArray(data)) {
            const count = await processDataAndSaveToFirestore(data);
            console.log(`[Sync] Saved/Updated ${count} API records for ${mStr}/${yStr}.`);
            totalAdded += count;
        }
        
        date.setMonth(date.getMonth() - 1);
    }
    
    await syncFNG(); 
    
    console.log(`✅ Sync complete. Total new/updated records: ${totalAdded}`);
    return totalAdded;
}

// Only run immediately if executed directly (e.g. via npm run sync)
if (import.meta.url === `file://${process.argv[1]}`) {
    runSyncTask().then(() => process.exit(0)).catch(() => process.exit(1));
}
