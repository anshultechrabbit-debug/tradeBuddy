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
// NSE equity cash session opens 09:15 IST.
const MARKET_OPEN_MINUTES = 9 * 60 + 15;

export function isPastClose(d = new Date()) {
  const day = istWeekday(d);
  if (day === 0 || day === 6) return true; // weekend — no session today, prior close already final
  return istMinutesOfDay(d) > MARKET_CLOSE_MINUTES;
}

export function isMarketOpen(d = new Date()) {
  const day = istWeekday(d);
  if (day === 0 || day === 6) return false;
  const mins = istMinutesOfDay(d);
  return mins >= MARKET_OPEN_MINUTES && mins <= MARKET_CLOSE_MINUTES;
}

// Sources that indicate synthetic/generated data — never use for evaluation.
const SYNTHETIC_SOURCE_RE = /synthetic|mock|demo|fake|test|development/i;

function isSyntheticSource(source) {
  return source != null && SYNTHETIC_SOURCE_RE.test(String(source));
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

/**
 * Returns { close, high, low, source } for `symbol` on `tradeDateKey`.
 * Used by the prediction evaluation job to validate targets (which need the
 * intraday HIGH) and invalidation levels (which need the intraday LOW).
 *
 * Returns null if:
 *   - the candle for that day isn't found yet (AWAITING_VERIFIED_CLOSE)
 *   - the data source is synthetic (DATA_INVALID)
 *
 * Never substitutes a different day's OHLC — it either finds the exact
 * trading session or returns null.
 */
export async function getOfficialOHLC(provider, symbol, tradeDateKey, { lookback = 10 } = {}) {
  const candles = await provider.getCandles(symbol, '1d', lookback, 'NSE').catch(() => []);
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const c = candles[i];
    const d = c.date ?? c.ts;
    if (!d) continue;
    if (dayKey(new Date(d)) !== tradeDateKey) continue;

    const source = c.source ?? c.provider ?? 'unknown';
    if (isSyntheticSource(source)) return { status: 'DATA_INVALID', source };

    const close = Number(c.close);
    const high = Number(c.high);
    const low = Number(c.low);
    if (!Number.isFinite(close)) return null;

    return {
      status: 'VERIFIED',
      close,
      high: Number.isFinite(high) ? high : null,
      low: Number.isFinite(low) ? low : null,
      source,
    };
  }
  return null; // not published yet
}
