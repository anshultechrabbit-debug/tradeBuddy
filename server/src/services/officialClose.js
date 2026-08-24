/**
 * officialClose — fetches a verified END-OF-DAY closing price for a symbol
 * on a specific trading day, sourced from the same daily-candle pipeline
 * used everywhere else in the app (nselib/jugaad historical, cached in
 * Postgres). Never a live intraday tick.
 *
 * Used by the prediction close-verification job (see backgroundJobs.js) to
 * evaluate OPEN predictions against the real close instead of whatever the
 * market happens to be doing when the job runs.
 */

// IST calendar day, independent of the server OS timezone.
export function dayKey(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function istMinutesOfDay(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

function istWeekday(d = new Date()) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

// NSE equity cash session closes 15:30 IST.
const MARKET_CLOSE_MINUTES = 15 * 60 + 30;

export function isPastClose(d = new Date()) {
  const day = istWeekday(d);
  if (day === 0 || day === 6) return true; // weekend — no session today, prior close already final
  return istMinutesOfDay(d) > MARKET_CLOSE_MINUTES;
}

/**
 * Returns the official close for `symbol` on the trading day `tradeDateKey`
 * (an IST "YYYY-MM-DD" string, e.g. from dayKey()), or null if that day's
 * EOD data hasn't been published yet (or is out of the fetched window).
 * Searches back a few sessions so a job that missed a day or two can still
 * catch up, without ever substituting a different day's close.
 */
export async function getOfficialClose(provider, symbol, tradeDateKey, { lookback = 10 } = {}) {
  const candles = await provider.getCandles(symbol, '1d', lookback, 'NSE').catch(() => []);
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const c = candles[i];
    const d = c.date ?? c.ts;
    if (!d) continue;
    if (dayKey(new Date(d)) === tradeDateKey) {
      const close = Number(c.close);
      return Number.isFinite(close) ? close : null;
    }
  }
  return null;
}
