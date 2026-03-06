async function testApi() {
  try {
    console.log("Fetching Binance...");
    const binanceRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
    const btc = await binanceRes.json();
    console.log("BTC Price:", btc.price);

    console.log("Fetching TWSE...");
    const twseRes = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL');
    const twseData = await twseRes.json();
    const tsmc = twseData.find(s => s.Code === '2330');
    console.log("TSMC Price:", tsmc.ClosingPrice);
  } catch(e) {
    console.error("Error:", e);
  }
}
testApi();
