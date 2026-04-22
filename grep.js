import fs from 'fs';
const data = fs.readFileSync('gpf.html', 'utf8');
const lines = data.split('\n');
const results = [];
for (let i = 0; i < lines.length; i++) {
   if (lines[i].includes('UNIT_COST') && lines[i-1] && lines[i-1].includes('แผน')) {
      console.log("Found:", lines[i-1].trim(), lines[i].trim());
   }
}
// lets also just find '<th>แผน' or similar
const tableHeaders = lines.filter(l => l.includes('แผน'));
console.log("Headers:");
console.log(tableHeaders.slice(0, 30).join('\n'));
