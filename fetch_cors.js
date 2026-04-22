import https from 'https';

https.get('https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=NAVBottom_03_2026', (res) => {
  console.log('Headers:', res.headers);
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
