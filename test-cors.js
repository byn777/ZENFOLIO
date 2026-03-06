async function checkCORS() {
  const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', { method: 'OPTIONS' });
  console.log('TWSE CORS:', res.headers.get('access-control-allow-origin'));

  const res2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { method: 'OPTIONS' });
  console.log('Binance CORS:', res2.headers.get('access-control-allow-origin'));
}
checkCORS();
