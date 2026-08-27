import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type CandlestickData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import type { Candle } from '../lib/types';
import { apiClient } from '../api/client';
import { formatCurrency, formatNumber, formatCompact, formatTimeAgo } from '../lib/format';

const UP = '#00a34d';
const DOWN = '#e3452f';

const RANGES = [30, 60, 90, 120];
const TIMEFRAMES: { key: '1m' | '5m' | '15m' | '60m' | '1d'; label: string }[] = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '60m', label: '60m' },
  { key: '1d', label: '1D' },
];

export function CandleChart({
  symbol,
  livePrice,
  lastUpdated,
  dayChangePct,
}: {
  symbol: string;
  livePrice?: number | null;
  lastUpdated?: string | null;
  // Authoritative day-over-day % change (vs previous close), e.g. from the
  // quote endpoint — same number Groww/TradingView show next to the price.
  // When omitted, falls back to the last candle's own open→close move, which
  // is a different (and often misleading) number once that candle is a thin
  // closing tick with open ≈ close.
  dayChangePct?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '60m' | '1d'>('1m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [range, setRange] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTsRef = useRef<string | null>(null);

  const intraday = timeframe !== '1d';

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = async () => {
      if (cancelled) return;
      try {
        const params = intraday ? `?timeframe=${timeframe}&days=1` : `?limit=${Math.max(range, 120)}`;
        const res = await apiClient.get<{ candles: Candle[] }>(`/market/candles/${symbol}${params}`);
        if (cancelled) return;
        setCandles(res.data.candles);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load candles');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    if (intraday) {
      timer = setInterval(run, 2000);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [symbol, timeframe, range, intraday]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = document.documentElement.classList.contains('dark');

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: isDark ? '#94a3b8' : '#64748b',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? '#3b82f6' : '#2563eb', labelBackgroundColor: isDark ? '#0b132b' : '#1e293b' },
        horzLine: { color: isDark ? '#3b82f6' : '#2563eb', labelBackgroundColor: isDark ? '#0b132b' : '#1e293b' },
      },
      rightPriceScale: { borderColor: isDark ? '#1c2541' : '#e2e8f0' },
      timeScale: { borderColor: isDark ? '#1c2541' : '#e2e8f0', timeVisible: true, secondsVisible: false },
      localization: { timeFormatter: istTimeFormatter },
    });

    const candlesSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineColor: UP,
      priceLineStyle: 2,
      priceLineWidth: 1,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
      visible: true,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candlesSeries;
    volumeSeriesRef.current = volumeSeries;

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      chart.applyOptions({
        layout: { textColor: dark ? '#94a3b8' : '#64748b' },
        grid: {
          vertLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
          horzLines: { color: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
        },
        rightPriceScale: { borderColor: dark ? '#1c2541' : '#e2e8f0' },
        timeScale: { borderColor: dark ? '#1c2541' : '#e2e8f0' },
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const candlesSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    const chart = chartRef.current;
    if (!candlesSeries || !volumeSeries || !chart || !candles.length) return;

    let window = intraday ? [...candles] : candles.slice(-range);

    // Keep the last intraday candle "forming" with the realtime LTP so the
    // chart ticks live like Groww (close/high/low track the quote).
    if (intraday && livePrice != null && livePrice > 0 && window.length) {
      const last = { ...window[window.length - 1] };
      last.close = livePrice;
      last.high = Math.max(last.high, livePrice);
      last.low = Math.min(last.low, livePrice);
      window[window.length - 1] = last;
    }

    // Append today's "forming" candle from the live price so the daily chart
    // stays consistent with the realtime quote even when EOD data lags.
    if (!intraday && livePrice != null && livePrice > 0 && window.length) {
      const lastC = window[window.length - 1];
      const isToday = new Date(lastC.date).toDateString() === new Date().toDateString();
      if (!isToday) {
        window = [
          ...window,
          {
            ...lastC,
            date: new Date().toISOString(),
            open: lastC.close,
            high: Math.max(lastC.close, livePrice),
            low: Math.min(lastC.close, livePrice),
            close: livePrice,
            volume: 0,
          },
        ];
      }
    }

    const candleData: CandlestickData<UTCTimestamp>[] = window.map((c) => ({
      time: chartTime(c.date),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    const volumeData: HistogramData<UTCTimestamp>[] = window.map((c) => ({
      time: chartTime(c.date),
      value: c.volume,
      color: c.close >= c.open ? 'rgba(0,163,77,0.35)' : 'rgba(227,69,47,0.35)',
    }));

    candlesSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    volumeSeries.applyOptions({ visible: !intraday });
    chart.priceScale('volume').applyOptions({ visible: !intraday });
    chart.timeScale().applyOptions({ timeVisible: intraday });

    const newLast = window.length ? window[window.length - 1].date : null;
    if (newLast !== lastTsRef.current) {
      chart.timeScale().fitContent();
      lastTsRef.current = newLast;
    } else if (intraday) {
      chart.timeScale().scrollToRealTime();
    }
  }, [candles, range, intraday, livePrice]);

  useEffect(() => {
    const candlesSeries = candleSeriesRef.current;
    if (!candlesSeries) return;
    for (const pl of candlesSeries.priceLines()) {
      candlesSeries.removePriceLine(pl);
    }
    if (livePrice != null && livePrice > 0) {
      candlesSeries.createPriceLine({
        price: livePrice,
        color: UP,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'LIVE',
      });
    }
  }, [livePrice, candles]);

  const shown = intraday ? candles : candles.slice(-range);
  const shownLast = shown.length ? shown[shown.length - 1] : null;
  const effectiveLast = useMemo(() => {
    if (!shownLast) return null;
    if (livePrice == null || livePrice <= 0) return shownLast;
    const isTodayDaily = !intraday && new Date(shownLast.date).toDateString() === new Date().toDateString();
    if (intraday || !isTodayDaily) {
      return {
        ...shownLast,
        close: livePrice,
        high: Math.max(shownLast.high, livePrice),
        low: Math.min(shownLast.low, livePrice),
        open: intraday ? shownLast.open : shownLast.close,
        volume: intraday ? shownLast.volume : 0,
      };
    }
    return shownLast;
  }, [shownLast, intraday, livePrice]);

  const isPos = (dayChangePct ?? (effectiveLast ? intradayPct(effectiveLast) : 0)) >= 0;

  return (
    <div className="w-full flex flex-col h-full space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-[#1c2541]">
        <div>
          <div className="flex items-baseline gap-2 font-mono">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              {effectiveLast ? formatCurrency(effectiveLast.close) : '—'}
            </span>
            {effectiveLast ? (
              <span className={`text-xs font-bold ${isPos ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                {formatPctShort(dayChangePct ?? intradayPct(effectiveLast))}
              </span>
            ) : null}
          </div>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
            <span>{lastUpdated ? `Updated ${formatTimeAgo(lastUpdated)}` : '—'}</span>
            {effectiveLast ? <span>· O {formatNumber(effectiveLast.open)} H {formatNumber(effectiveLast.high)} L {formatNumber(effectiveLast.low)}</span> : null}
            {effectiveLast && !intraday ? <span>· Vol {formatCompact(effectiveLast.volume)}</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-[#1c2541]">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                type="button"
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                  timeframe === tf.key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                onClick={() => setTimeframe(tf.key)}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {!intraday ? (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-[#1c2541]">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    range === r
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  onClick={() => setRange(r)}
                >
                  {r === 120 ? 'MAX' : `${r}D`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-xs text-slate-500">
        {loading && !candles.length ? <span>Loading live candlestick feed…</span> : null}
        {error ? <span className="text-rose-500">{error}</span> : null}
        {!loading && !error && !candles.length ? (
          <span>No candle data available right now — the live feed may be down, try again shortly.</span>
        ) : null}
      </div>

      <div ref={containerRef} className="h-[280px] w-full" />
    </div>
  );
}

function formatPctShort(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

// Fallback when no authoritative day-change is passed in: the last visible
// candle's own open→close move. Only meaningful as a "day change" when that
// candle happens to span the whole session — for a single 1m/5m bar it is
// not the same thing and callers should prefer `dayChangePct`.
function intradayPct(candle: { open: number; close: number }): number {
  return candle.open > 0 ? ((candle.close - candle.open) / candle.open) * 100 : 0;
}

/**
 * Converts a candle's UTC instant into a timestamp that renders as the
 * IST wall-clock time (Asia/Kolkata) in whatever timezone the browser is in,
 * so the chart always shows Indian market times like Groww.
 */
function chartTime(isoDate: string): UTCTimestamp {
  const utcSec = Math.floor(new Date(isoDate).getTime() / 1000);
  return (utcSec + 5.5 * 3600) as UTCTimestamp;
}

/**
 * Formats times as Indian wall-clock in 12-hour format ("1:26 PM").
 * Candle timestamps carry IST wall-clock encoded as if UTC (+5h30m), and
 * lightweight-charts renders the axis with UTC getters, so formatting with
 * UTC getters yields IST in every browser timezone.
 */
function istTimeFormatter(time: Time): string {
  if (typeof time !== 'number') return String(time);
  const d = new Date(time * 1000);
  let h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default CandleChart;