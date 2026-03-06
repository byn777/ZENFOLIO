async function testProxy(symbol) {
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const url = `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`;
  // Note: corsproxy.io uses ?url= parameter officially, or just passes it in query. Let's see.
  // Actually, standard is `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`

  console.log("Fetching: " + url);
  try {
    const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`);
    console.log(`Status for ${symbol}:`, res.status);
    if (!res.ok) {
      console.log('Error Text:', await res.text().catch(e => e.message));
      return;
    }
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    console.log(`[${symbol}] -> Price via proxy: ${price}`);
  } catch (err) {
    console.error(`Error for ${symbol}:`, err.message);
  }
}

async function run() {
  await testProxy('AAPL');
  await testProxy('2330.TW');
}

run();
