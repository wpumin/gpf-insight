import axios from 'axios';
async function test() {
  try {
    const res = await axios.get('https://api.allorigins.win/get?url=https%3A%2F%2Fproduction.dataviz.cnn.io%2Findex%2Ffearandgreed%2Fgraphdata');
    console.log(res.status);
    console.log(res.data.contents.substring(0, 50));
  } catch (e) {
    if(e.response) console.error(e.response.status, e.response.data);
    else console.error(e.message);
  }
}
test();
