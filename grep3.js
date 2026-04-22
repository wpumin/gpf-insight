import fs from 'fs';
const data = fs.readFileSync('gpf.html', 'utf8');

const ths = data.split('<th').map(chunk => chunk.split('</th>')[0]).filter(c => c.includes('แผน'));
ths.forEach(t => {
   console.log(t.replace(/<[^>]+>/g, '').trim());
});

console.log("----");
let lines = data.split('\n');
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('$table = $table +') && lines[i].includes('UNIT')) {
      console.log(lines[i].trim());
  }
}
