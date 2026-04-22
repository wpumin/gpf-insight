import axios from 'axios';
async function test() {
  try {
    const res = await axios.options('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'Origin': 'http://localhost:3000',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    console.log(res.headers);
  } catch (e) {
    console.error(e.message);
  }
}
test();
