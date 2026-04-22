import https from 'https';

https.get('https://www.gpf.or.th/thai2019/About/main.php?page=memberfund&lang=th&menu=statistic', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const jsLines = data.split('\n').filter(line => line.includes('api') || line.includes('fetch') || line.includes('$.ajax') || line.includes('json') || line.includes('.txt') || line.includes('url:'));
    console.log("Lines with potential API endpoints:");
    console.log(jsLines.join('\n'));
    console.log("Length of HTML:", data.length);
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
