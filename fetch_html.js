import https from 'https';
import fs from 'fs';
https.get('https://www.gpf.or.th/thai2019/About/main.php?page=memberfund&lang=th&menu=statistic', (res) => {
  let data = '';
  res.on('data', Buffer.from);
  const file = fs.createWriteStream('./gpf.html');
  res.pipe(file);
  file.on('finish', () => { file.close(); console.log('Done'); });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
