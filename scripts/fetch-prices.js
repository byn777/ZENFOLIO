import fs from 'fs';

const SYMBOLS = [
  "VT", "TSM", "0050.TW", "006208.TW", "2330.TW", 
  "VUSA.L", "VWRL.L", "VWRA.L", "BTC-USD", "ETH-USD", 
  "BND", "BNDX", "AGGU.L", "USDTWD=X"
];

async function fetchYahoo(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
    const res = await fetch(url);
    if (!res.ok) return { symbol, price: null };
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return { symbol, price: price || null };
  } catch (e) {
    return { symbol, price: null };
  }
}

async function run() {
  const finalPrices = {};
  for (const sym of SYMBOLS) {
    const res = await fetchYahoo(sym);
    if (res.price) finalPrices[sym] = res.price;
  }
  
  if (Object.keys(finalPrices).length > 0) {
    fs.mkdirSync('public', { recursive: true });
    // Write to a static file that the React app can fetch
    fs.writeFileSync('public/live_prices.json', JSON.stringify(finalPrices, null, 2));
    console.log("Prices written to public/live_prices.json:", finalPrices);
  }
}

run();
