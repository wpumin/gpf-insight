import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://edition.cnn.com',
        'Referer': 'https://edition.cnn.com/'
      }
    });
    console.log(res.status, res.data.fear_and_greed.score);
  } catch (e) {
    if(e.response) console.error(e.response.status, e.response.data);
    else console.error(e.message);
  }
}
test();
