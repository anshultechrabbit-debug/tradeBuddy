import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { DeepDive, MarketQuote } from '../lib/types';
import { Card, StatCard, Badge, Spinner, EmptyState, ProgressBar, ErrorBox } from '../components/ui';
import { formatCurrency, formatNumber, formatPct, formatTimeAgo, signalBadgeClass, regimeBadgeClass } from '../lib/format';
import { useFetch } from '../hooks/useFetch';
import { CandleChart } from '../components/CandleChart';

export function DeepDivePage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { data, loading, error, load } = useFetch<DeepDive>(() =>
    apiClient.get(`/radar/symbols/${symbol}/detail`).then((r) => r.data)
  );
  const [quote, setQuote] = useState<MarketQuote | null>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    async function fetchQuote() {
      try {
        const q = await apiClient.get<MarketQuote>(`/market/quote/${symbol}`);
        if (!cancelled) setQuote(q.data);
      } catch {
        // quote polling is best-effort
      }
    }
    fetchQuote();
    const timer = setInterval(() => {
      apiClient.get<MarketQuote>(`/market/quote/${symbol}`).then((r) => !cancelled && setQuote(r.data));
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol]);

  const livePrice = quote?.lastPrice ?? data?.lastPrice;
  const changePct = quote?.changePct;
  const up = changePct != null && changePct >= 0;
  const liveTone = changePct == null ? '' : up ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400';
  const updatedAt = quote?.sourceTimestamp ?? quote?.receivedAt ?? null;

  return (
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link to="/radar" className="text-xs text-blue-400 hover:text-blue-300 font-bold">
                ← Back to Radar
              </Link>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">{symbol}</h1>
              {data ? <Badge className={signalBadgeClass(data.signal)}>{data.signal}</Badge> : null}
            </div>
            {livePrice != null ? (
              <div className="mt-1 flex items-baseline gap-2 font-mono">
                <span className="text-2xl font-black text-white">{formatCurrency(livePrice)}</span>
                {changePct != null ? <span className={`text-sm font-bold ${liveTone}`}>({formatPct(changePct)})</span> : null}
              </div>
            ) : null}
          </div>
          {updatedAt ? (
            <span className="px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-mono font-semibold text-slate-300">
              Updated {formatTimeAgo(updatedAt)}
            </span>
          ) : null}
        </div>
      </section>

      {error ? <ErrorBox message={error} onRetry={load} /> : null}

      {loading ? (
        <Spinner label="Analyzing multi-factor technicals…" />
      ) : data ? (
        <>
          {/* ── CANDLE CHART ── */}
          {symbol ? (
            <Card title={`${symbol} — Candlestick Technical Analysis`}>
              <div className="h-[360px] w-full">
                <CandleChart symbol={symbol} livePrice={livePrice} lastUpdated={updatedAt} />
              </div>
            </Card>
          ) : null}

          {/* ── STATS GRID ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Realtime LTP" value={formatCurrency(livePrice)} />
            <StatCard
              label="Conviction Score"
              value={`${data.convictionScore}/100`}
              sub={<ProgressBar value={data.convictionScore} />}
            />
            <StatCard
              label="Market Regime"
              value={<Badge className={regimeBadgeClass(data.regime)}>{data.regime}</Badge>}
            />
            <StatCard label="RSI (14-period)" value={formatNumber(data.features.rsi14)} />
          </div>

          {/* ── FEATURES & SUB-SCORES BENTO ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Key Technical Features">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <FeatureBox label="SMA 20" value={formatCurrency(data.features.sma20)} />
                <FeatureBox label="SMA 50" value={formatCurrency(data.features.sma50)} />
                <FeatureBox label="SMA 200" value={formatCurrency(data.features.sma200)} />
                <FeatureBox label="EMA 20" value={formatCurrency(data.features.ema20)} />
                <FeatureBox label="ATR (14)" value={formatCurrency(data.features.atr14)} />
                <FeatureBox label="ROC (10D)" value={formatPct(data.features.roc10)} />
                <FeatureBox label="ROC (20D)" value={formatPct(data.features.roc20)} />
                <FeatureBox label="Z-Score" value={formatNumber(data.features.zscore)} />
                <FeatureBox label="Daily Volatility" value={formatPct(data.features.dailyVolatilityPct)} />
                <FeatureBox label="Annual Volatility" value={formatPct(data.features.annualizedVolatilityPct)} />
                <FeatureBox label="Volume Ratio" value={formatNumber(data.features.volumeRatio)} />
                <FeatureBox label="Breakout Target" value={data.features.breakout ? `${formatPct(data.features.breakoutPct)} above` : 'None'} />
              </div>
            </Card>

            <Card title="Factor Sub-Scores">
              <div className="space-y-3.5">
                <SubScoreRow label="Trend Direction" value={data.features.subscores.trend} />
                <SubScoreRow label="Price Momentum" value={data.features.subscores.momentum} />
                <SubScoreRow label="Volume Confirmation" value={data.features.subscores.volume} />
                <SubScoreRow label="Relative Strength (vs Nifty)" value={data.features.subscores.relativeStrength} />
                <SubScoreRow label="Volatility Index" value={data.features.subscores.volatility} />
                <SubScoreRow label="Market Breadth" value={data.features.subscores.breadth} />
              </div>
            </Card>
          </div>

          {/* ── NARRATIVE ANALYSIS & SIGNALS ── */}
          <Card title="TradePanda Quantitative Thesis">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Trend Strength</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{data.deepDive.trendStrength}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Momentum Status</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{data.deepDive.momentum}</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Volume Flow</span>
                  <div className="font-bold text-slate-900 dark:text-white mt-0.5">{data.deepDive.volumeConfirmation}</div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-white/[0.03] border border-blue-100 dark:border-[#1c2541] space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Strategy Note</div>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-light">{data.reason}</p>
              </div>

              {data.deepDive.technicalSignals.length > 0 && (
                <div className="pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Fired Signal Indicators</div>
                  <div className="flex flex-wrap gap-2">
                    {data.deepDive.technicalSignals.map((t) => (
                      <span key={t} className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <EmptyState title="No deep-dive data available for this symbol" />
      )}
    </div>
  );
}

function FeatureBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-0.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function SubScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-800 dark:text-slate-200">{label}</span>
        <span className="font-mono font-black text-slate-900 dark:text-white">{value}/100</span>
      </div>
      <ProgressBar value={value} />
    </div>
  );
}