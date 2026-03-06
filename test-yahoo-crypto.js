async function testYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    console.log(`[${symbol}] -> Price: ${price}, typeof: ${typeof price}`);
    if (price === undefined) {
      console.log(`[${symbol}] FULL JSON:`, JSON.stringify(json).substring(0, 300));
    }
  } catch (err) {
    console.error(`Error for ${symbol}:`, err.message);
  }
}

async function run() {
  await testYahoo('AAPL');
  await testYahoo('2330.TW');
  await testYahoo('BTC-USD');
  await testYahoo('ETH-USD');
}

run();
