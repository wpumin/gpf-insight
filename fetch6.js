import https from 'https';

function fetchPage(page) {
https.get('https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=' + page, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    data = data.replace(/^\uFEFF/, '').trim();
    try {
        const json = JSON.parse(data);
        console.log(page, "Total entries:", json.length, "First:", json[0].LAUNCH_DATE, "Last:", json[json.length - 1].LAUNCH_DATE);
    } catch(e) {
        console.log("Error on", page, data.substring(0, 100));
    }
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
}

fetchPage('NAVBottom_03_2026');
fetchPage('NAVBottom_02_2026');
fetchPage('NAVBottom_01_2026');
fetchPage('NAVBottom_04_2021');
