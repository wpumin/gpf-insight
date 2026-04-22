import fs from 'fs';
import { load } from 'cheerio'; // we need an HTML parser to be safer, or regex
const data = fs.readFileSync('gpf.html', 'utf8');

const tHeadMatches = data.match(/<th(.*?)<\/th>/g);
if (tHeadMatches) {
   tHeadMatches.forEach(m => {
      if (m.includes('แผน')) {
          console.log(m.replace(/<[^>]+>/g, '').trim());
      }
   });
}
console.log("----");
let lines = data.split('\n');
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('table = $table +')) {
      console.log(lines[i].trim());
  }
}
