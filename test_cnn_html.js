const axios = require('axios');
async function test() {
  try {
    const res = await axios.get('https://edition.cnn.com/markets/fear-and-greed', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      }
    });
    console.log(res.status, res.data.length);
    const match = res.data.match(/Fear & Greed Index/i);
    console.log("Match found: ", !!match);
  } catch (e) {
    console.error(e.message);
  }
}
test();
