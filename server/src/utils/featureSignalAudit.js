/**
 * Feature signal audit: for each candidate feature/condition, measures the
 * ACTUAL next-session up-rate on real historical data, against the sample's
 * overall base rate. If a feature's conditional up-rate doesn't differ
 * meaningfully from the base rate, it carries ~no next-day directional
 * information on this data, no matter how standard it is in TA folklore.
 */
import { getMarketDataProvider } from '../providers/marketData/index.js';
import {
  sma, ema, rsi, atr, roc,
} from '../services/radar/indicators.js';
import {
  stochastic, cci, williamsR, adxDmi, bollingerBands, obv, cmf, mfi,
  supertrend, parabolicSar, ichimoku, swingStructure, candlestickPattern,
  previousDayLevels, gapPct,
} from '../services/radar/indicators.js';

const SYMS = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TATAMOTORS', 'SBIN', 'BHARTIARTL', 'ITC', 'LICI'];
const provider = getMarketDataProvider();

const buckets = {};
function record(name, cond, up) {
  if (!buckets[name]) buckets[name] = { up: 0, down: 0 };
  if (cond) buckets[name][up ? 'up' : 'down'] += 1;
}

let baseUp = 0;
let baseDown = 0;

for (const symbol of SYMS) {
  const candles = await provider.getCandles(symbol, '1d', 280, 'NSE').catch(() => []);
  if (!candles || candles.length < 210) continue;
  const closes = candles.map((c) => Number(c.close));

  for (let t = 205; t < candles.length - 1; t += 1) {
    const windowCandles = candles.slice(0, t + 1);
    const windowCloses = closes.slice(0, t + 1);
    const price = windowCloses[windowCloses.length - 1];
    const prevPrice = windowCloses[windowCloses.length - 2];
    const nextClose = closes[t + 1];
    const up = nextClose >= price;
    baseUp += up ? 1 : 0;
    baseDown += up ? 0 : 1;

    const macdV = (() => {
      let e12 = windowCloses[0]; let e26 = windowCloses[0]; const line = [];
      for (const c of windowCloses) { e12 = c * (2 / 13) + e12 * (11 / 13); e26 = c * (2 / 27) + e26 * (25 / 27); line.push(e12 - e26); }
      return { value: line[line.length - 1], signal: ema(line, 9) };
    })();
    record('MACD bullish cross (value>signal)', macdV.value > macdV.signal, up);
    record('MACD bearish cross (value<signal)', macdV.value < macdV.signal, up);

    const volRatio = (() => {
      const v20 = windowCandles.slice(-20).map((c) => Number(c.volume) || 0);
      const avg = v20.reduce((a, b) => a + b, 0) / v20.length;
      return avg > 0 ? (Number(windowCandles[windowCandles.length - 1].volume) || 0) / avg : 1;
    })();
    const dayChg = ((price - prevPrice) / prevPrice) * 100;
    record('High volume + price up (volRatio>=1.2 & dayChg>0)', volRatio >= 1.2 && dayChg > 0, up);
    record('High volume + price down (volRatio>=1.2 & dayChg<0)', volRatio >= 1.2 && dayChg < 0, up);

    const adx = adxDmi(windowCandles);
    record('ADX>25 & +DI>-DI (strong uptrend)', adx && adx.adx > 25 && adx.plusDI > adx.minusDI, up);
    record('ADX>25 & -DI>+DI (strong downtrend)', adx && adx.adx > 25 && adx.minusDI > adx.plusDI, up);

    const bb = bollingerBands(windowCloses);
    record('Bollinger %B>0.95 (near upper band)', bb && bb.percentB > 0.95, up);
    record('Bollinger %B<0.05 (near lower band)', bb && bb.percentB < 0.05, up);

    const stoch = stochastic(windowCandles);
    record('Stochastic k>80 (overbought)', stoch && stoch.k > 80, up);
    record('Stochastic k<20 (oversold)', stoch && stoch.k < 20, up);

    const cciVal = cci(windowCandles);
    record('CCI>100', cciVal != null && cciVal > 100, up);
    record('CCI<-100', cciVal != null && cciVal < -100, up);

    const wpr = williamsR(windowCandles);
    record('Williams%R>-20 (overbought)', wpr != null && wpr > -20, up);
    record('Williams%R<-80 (oversold)', wpr != null && wpr < -80, up);

    const obvRead = obv(windowCandles);
    record('OBV rising', obvRead && obvRead.trend === 'rising', up);
    record('OBV falling', obvRead && obvRead.trend === 'falling', up);

    const cmfVal = cmf(windowCandles);
    record('CMF>0.1', cmfVal != null && cmfVal > 0.1, up);
    record('CMF<-0.1', cmfVal != null && cmfVal < -0.1, up);

    const mfiVal = mfi(windowCandles);
    record('MFI>80', mfiVal != null && mfiVal > 80, up);
    record('MFI<20', mfiVal != null && mfiVal < 20, up);

    const st = supertrend(windowCandles);
    record('Supertrend up', st && st.direction === 'up', up);
    record('Supertrend down', st && st.direction === 'down', up);

    const psar = parabolicSar(windowCandles);
    record('ParabolicSAR up', psar && psar.direction === 'up', up);
    record('ParabolicSAR down', psar && psar.direction === 'down', up);

    const cloud = ichimoku(windowCandles);
    record('Price above Ichimoku cloud', cloud && cloud.cloudPosition === 'above', up);
    record('Price below Ichimoku cloud', cloud && cloud.cloudPosition === 'below', up);

    const swing = swingStructure(windowCandles);
    record('Swing: Higher High', swing && swing.higherHigh === true, up);
    record('Swing: Lower High', swing && swing.higherHigh === false, up);
    record('Swing: Higher Low', swing && swing.higherLow === true, up);
    record('Swing: Lower Low', swing && swing.higherLow === false, up);

    const pat = candlestickPattern(windowCandles);
    record('Candlestick bullish pattern', pat && pat.bias === 'bullish', up);
    record('Candlestick bearish pattern', pat && pat.bias === 'bearish', up);

    const high20 = windowCandles.length >= 21 ? Math.max(...windowCandles.slice(-21, -1).map((c) => Number(c.high))) : null;
    const low20 = windowCandles.length >= 21 ? Math.min(...windowCandles.slice(-21, -1).map((c) => Number(c.low))) : null;
    record('20-day breakout', high20 != null && price >= high20, up);
    record('20-day breakdown', low20 != null && price <= low20, up);

    const prevDay = previousDayLevels(windowCandles);
    const gap = prevDay ? gapPct(windowCandles[windowCandles.length - 1].open, prevDay.prevClose) : null;
    record('Gap up >0.5%', gap != null && gap > 0.5, up);
    record('Gap down <-0.5%', gap != null && gap < -0.5, up);

    const roc5 = roc(windowCloses, 5);
    record('roc5 in bottom decile (<-4%)', roc5 != null && roc5 < -4, up);
    record('roc5 in top decile (>4%)', roc5 != null && roc5 > 4, up);
  }
}

const baseRate = (100 * baseUp) / (baseUp + baseDown);
console.log(`Overall base rate: up=${baseUp} down=${baseDown} up%=${baseRate.toFixed(1)}\n`);
console.log('Feature'.padEnd(48), 'n'.padEnd(6), 'up%'.padEnd(8), 'edge vs base');
const rows = Object.entries(buckets).map(([name, v]) => {
  const total = v.up + v.down;
  const upPct = total ? (100 * v.up) / total : null;
  return { name, total, upPct, edge: upPct != null ? upPct - baseRate : null };
});
rows.sort((a, b) => Math.abs(b.edge ?? 0) - Math.abs(a.edge ?? 0));
for (const r of rows) {
  console.log(
    r.name.padEnd(48),
    String(r.total).padEnd(6),
    (r.upPct != null ? r.upPct.toFixed(1) : 'n/a').padEnd(8),
    r.edge != null ? (r.edge > 0 ? '+' : '') + r.edge.toFixed(1) : 'n/a',
  );
}
process.exit(0);
