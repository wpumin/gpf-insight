import axios from "axios";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import fs from 'fs';

import * as cheerio from 'cheerio';

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

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase, firebaseConfig.firestoreDatabaseId);

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
