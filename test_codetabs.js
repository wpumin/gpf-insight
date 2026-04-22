import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://api.codetabs.com/v1/proxy?quest=https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    console.log(res.status, res.data.substring(0, 100));
  } catch (e) {
    if(e.response) console.error(e.response.status, e.response.statusText);
    else console.error(e.message);
  }
}
test();
