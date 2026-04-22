async function test() {
  try {
    const res = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log(res.status);
    const data = await res.json();
    console.log("SUCCESS:", Object.keys(data));
  } catch (e) {
    console.error(e.message);
  }
}
test();
