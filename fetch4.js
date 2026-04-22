import https from 'https';

https.get('https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=NAV_ALL', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    data = data.replace(/^\uFEFF/, '').trim();
    const json = JSON.parse(data);
    console.log("Total entries:", json.length);
    console.log("Random entry:");
    console.log(json[json.length - 1]);
    const keys = Object.keys(json[json.length - 1]);
    console.log("Keys:", keys);
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
