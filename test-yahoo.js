async function testYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const price = result?.meta?.regularMarketPrice;
    console.log(`[${symbol}] -> Price: ${price}`);
  } catch (err) {
    console.error(`Error for ${symbol}:`, err.message);
  }
}

async function run() {
  await testYahoo('AAPL');
  await testYahoo('2330.TW');
}

run();
