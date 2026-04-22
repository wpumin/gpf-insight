import https from 'https';

function fetchPage(page) {
https.get('https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=' + page, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    data = data.replace(/^\uFEFF/, '').trim();
    const json = JSON.parse(data);
    console.log(page, "Total entries:", json.length, "First:", json[0].LAUNCH_DATE, "Last:", json[json.length - 1].LAUNCH_DATE);
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
}

fetchPage('NAV_12');
fetchPage('NAV_3');
fetchPage('NAV_5');
