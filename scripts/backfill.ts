import axios from "axios";
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

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
                        console.log(`[Backfill] Firestore offline, retrying ${stdDate}... (${retries} left)`);
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
    return updatedCount;
}

async function runBackfill() {
    console.log("Starting historical backfill...");
    const currentYear = new Date().getFullYear();
    const startYear = 2021; // Backfill up to 5-6 years
    let totalAdded = 0;
    
    // We fetch from past to present
    for(let y = currentYear; y >= startYear; y--) {
        for(let m = 12; m >= 1; m--) {
             const mStr = m.toString().padStart(2, '0');
             const yStr = y.toString();
             // Skip future months
             if (y === currentYear && m > new Date().getMonth() + 1) continue;
             
             console.log(`Fetching ${mStr}/${yStr}...`);
             const data = await fetchMonthData(mStr, yStr);
             if (data && Array.isArray(data)) {
                 const count = await processDataAndSaveToFirestore(data);
                 console.log(`Saved ${count} records for ${mStr}/${yStr}.`);
                 totalAdded += count;
             }
        }
    }
    console.log(`Backfill complete. Total new/updated records: ${totalAdded}`);
    process.exit(0);
}

runBackfill();
