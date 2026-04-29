const fs = require('fs');
const content = fs.readFileSync('src/components/Leaderboard.tsx', 'utf-8');
const lines = content.split('\n');

const effectStart = 120; // zero indexed -> line 121
const effectEnd = 239; // zero indexed -> line 240

const effects = lines.slice(effectStart, effectEnd);
const beforeEffects = lines.slice(0, effectStart);
const afterEffects = lines.slice(effectEnd);

const newLines = [...beforeEffects, ...afterEffects];
const targetIndex = newLines.findIndex(line => line.includes('const myRank = dynamicCompetitors.findIndex(c => c.id === user?.uid) + 1;'));

if (targetIndex !== -1) {
    newLines.splice(targetIndex + 1, 0, ...effects);
    fs.writeFileSync('src/components/Leaderboard.tsx', newLines.join('\n'), 'utf-8');
    console.log("Rewrite successful.");
} else {
    console.log("Could not find target line for insertion.");
}
