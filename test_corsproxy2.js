import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://corsproxy.io/?https%3A%2F%2Fproduction.dataviz.cnn.io%2Findex%2Ffearandgreed%2Fgraphdata', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    });
    console.log(res.status, res.data.fear_and_greed.score);
  } catch (e) {
    if(e.response) console.error(e.response.status, e.response.data);
    else console.error(e.message);
  }
}
test();
