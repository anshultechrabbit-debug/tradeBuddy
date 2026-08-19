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
}: {
  symbol: string;
  livePrice?: number | null;
  lastUpdated?: string | null;
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

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#f1f3f2' },
        horzLines: { color: '#f1f3f2' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#9ca3af', labelBackgroundColor: '#171c26' },
        horzLine: { color: '#9ca3af', labelBackgroundColor: '#171c26' },
      },
      rightPriceScale: { borderColor: '#e9ebee' },
      timeScale: { borderColor: '#e9ebee', timeVisible: true, secondsVisible: false },
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

    return () => {
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

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-legend">
          <div className="strong">
            {effectiveLast ? formatCurrency(effectiveLast.close) : '—'}
            {effectiveLast ? (
              <span className={effectiveLast.close >= effectiveLast.open ? 'text-positive' : 'text-negative'}>
                {' '}
                {formatPctShort(effectiveLast.open > 0 ? ((effectiveLast.close - effectiveLast.open) / effectiveLast.open) * 100 : 0)}
              </span>
            ) : null}
          </div>
          <div className="muted small">
            {lastUpdated ? <>Updated {formatTimeAgo(lastUpdated)}</> : '—'}
            {effectiveLast ? <> · O {formatNumber(effectiveLast.open)} H {formatNumber(effectiveLast.high)} L {formatNumber(effectiveLast.low)}</> : null}
            {effectiveLast && !intraday ? <> · Vol {formatCompact(effectiveLast.volume)}</> : null}
          </div>
        </div>
        <div className="chart-controls">
          <div className="chart-ranges">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.key}
                type="button"
                className={timeframe === tf.key ? 'chart-range chart-range-active' : 'chart-range'}
                onClick={() => setTimeframe(tf.key)}
              >
                {tf.label}
              </button>
            ))}
          </div>
          {!intraday ? (
            <div className="chart-ranges">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={range === r ? 'chart-range chart-range-active' : 'chart-range'}
                  onClick={() => setRange(r)}
                >
                  {r === 120 ? 'MAX' : `${r}D`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="chart-status">
        {loading ? <span className="muted small">Loading…</span> : null}
        {error ? <span className="text-negative small">{error}</span> : null}
      </div>
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}

function formatPctShort(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
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