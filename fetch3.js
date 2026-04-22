import https from 'https';

https.get('https://www.gpf.or.th/thai2019/About/memberfund-api.php?pageName=NAV_ALL', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
       const json = JSON.parse(data);
       console.log("Length of API output is", json.length);
       console.log("First element:", json[json.length - 1]); // showing the latest
    } catch(err) {
       console.log("Not JSON :(");
       console.log(data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.log("Error: " + err.message);
});
