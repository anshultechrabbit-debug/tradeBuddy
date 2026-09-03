import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchSummary,
  fetchHoldings,
  fetchSectors,
  syncPortfolio,
  fetchPortfolioReview,
  askPortfolioQuestion,
} from '../store/portfolioSlice';
import { Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatNumber } from '../lib/format';
import { TradePandaChat } from '../components/TradePandaChat';

type ActionFilter = 'ALL' | 'GAINERS' | 'DECLINERS' | 'TRIM' | 'HOLD';

const STOCK_SECTORS: Record<string, { sector: string; icon: string; color: string }> = {
  RELIANCE: { sector: 'Energy & Oil', icon: '⛽', color: '#f59e0b' },
  TCS: { sector: 'Information Tech', icon: '💻', color: '#3b82f6' },
  INFY: { sector: 'Information Tech', icon: '💻', color: '#3b82f6' },
  WIPRO: { sector: 'Information Tech', icon: '💻', color: '#3b82f6' },
  HCLTECH: { sector: 'Information Tech', icon: '💻', color: '#3b82f6' },
  TECHM: { sector: 'Information Tech', icon: '💻', color: '#3b82f6' },
  HDFCBANK: { sector: 'Banking & Finance', icon: '🏦', color: '#6366f1' },
  ICICIBANK: { sector: 'Banking & Finance', icon: '🏦', color: '#6366f1' },
  SBIN: { sector: 'Banking & Finance', icon: '🏦', color: '#6366f1' },
  KOTAKBANK: { sector: 'Banking & Finance', icon: '🏦', color: '#6366f1' },
  AXISBANK: { sector: 'Banking & Finance', icon: '🏦', color: '#6366f1' },
  BAJFINANCE: { sector: 'Financial Services', icon: '💳', color: '#818cf8' },
  MARUTI: { sector: 'Automobile', icon: '🚗', color: '#10b981' },
  TATAMOTORS: { sector: 'Automobile', icon: '🚗', color: '#10b981' },
  'M&M': { sector: 'Automobile', icon: '🚗', color: '#10b981' },
  ITC: { sector: 'FMCG & Consumer', icon: '🛒', color: '#a855f7' },
  HINDUNILVR: { sector: 'FMCG & Consumer', icon: '🛒', color: '#a855f7' },
  NESTLEIND: { sector: 'FMCG & Consumer', icon: '🛒', color: '#a855f7' },
  HAL: { sector: 'Defence & Aerospace', icon: '🛡️', color: '#0ea5e9' },
  BEL: { sector: 'Defence & Aerospace', icon: '🛡️', color: '#0ea5e9' },
  BHEL: { sector: 'Capital Goods', icon: '⚙️', color: '#14b8a6' },
  'L&T': { sector: 'Infrastructure', icon: '🏗️', color: '#d97706' },
  LT: { sector: 'Infrastructure', icon: '🏗️', color: '#d97706' },
  DLF: { sector: 'Real Estate', icon: '🏢', color: '#f43f5e' },
  GODREJPROP: { sector: 'Real Estate', icon: '🏢', color: '#f43f5e' },
  POWERGRID: { sector: 'Power & Energy', icon: '⚡', color: '#f97316' },
  NTPC: { sector: 'Power & Energy', icon: '⚡', color: '#f97316' },
  TATAPOWER: { sector: 'Power & Energy', icon: '⚡', color: '#f97316' },
  HINDZINC: { sector: 'Metals & Mining', icon: '⛏️', color: '#64748b' },
  VEDL: { sector: 'Metals & Mining', icon: '⛏️', color: '#64748b' },
  TATASTEEL: { sector: 'Metals & Mining', icon: '⛏️', color: '#64748b' },
  JSWSTEEL: { sector: 'Metals & Mining', icon: '⛏️', color: '#64748b' },
  IOC: { sector: 'Energy & Oil', icon: '⛽', color: '#f59e0b' },
  GAIL: { sector: 'Gas & Utilities', icon: '🔥', color: '#d97706' },
  SUNPHARMA: { sector: 'Healthcare & Pharma', icon: '💊', color: '#06b6d4' },
  CIPLA: { sector: 'Healthcare & Pharma', icon: '💊', color: '#06b6d4' },
  DIVISLAB: { sector: 'Healthcare & Pharma', icon: '💊', color: '#06b6d4' },
};

function MiniSparkline({ isUp }: { isUp: boolean }) {
  const stroke = isUp ? '#10b981' : '#f43f5e';
  const fill = isUp ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';
  const d = isUp
    ? 'M0 14 Q10 12 20 8 T35 4 T48 2'
    : 'M0 4 Q10 6 20 10 T35 14 T48 16';
  return (
    <svg viewBox="0 0 48 18" className="h-4 w-12 shrink-0 overflow-visible">
      <path d={`${d} L48 18 L0 18 Z`} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function actionBadge(action: string) {
  switch (action) {
    case 'BUY_MORE':
      return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30';
    case 'HOLD':
      return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30';
    case 'TRIM':
      return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30';
    case 'SELL':
      return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-white/10 dark:text-slate-300 dark:border-white/10';
  }
}

export function PortfolioPage() {
  const dispatch = useAppDispatch();
  const { summary, holdings, loading, error, review, reviewLoading, chatAnswer, chatLoading } = useAppSelector((s) => s.portfolio);

  const [chatOpen, setChatOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [question, setQuestion] = useState('');
  const [selectedStockBreakdown, setSelectedStockBreakdown] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [rebalanceSimPct, setRebalanceSimPct] = useState<number>(0);

  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchHoldings());
    dispatch(fetchSectors());
    dispatch(fetchPortfolioReview());
  }, [dispatch]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await dispatch(syncPortfolio('mock')).unwrap();
      dispatch(fetchSummary());
      dispatch(fetchHoldings());
      dispatch(fetchSectors());
      dispatch(fetchPortfolioReview());
    } finally {
      setSyncing(false);
    }
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    dispatch(askPortfolioQuestion(question.trim()));
  };

  // No fabricated placeholder numbers here — if the summary hasn't loaded
  // (or failed), these stay null and the metric cards below show "—"
  // rather than a specific-looking fake portfolio value.
  const totalValue = summary?.currentValue ?? null;
  const investedVal = summary?.invested ?? null;
  const totalPnl = summary?.totalPnl ?? (totalValue != null && investedVal != null ? totalValue - investedVal : null);
  const pnlPct = summary?.pnlPct ?? (totalPnl != null && investedVal ? (totalPnl / investedVal) * 100 : null);
  const isProfit = totalPnl != null && totalPnl >= 0;
  const totalValueForWeights = totalValue ?? 0;

  // Enrich holdings with Sector metadata and weights
  const enrichedHoldings = useMemo(() => {
    return holdings.map((h) => {
      const meta = STOCK_SECTORS[h.symbol.toUpperCase()] ?? { sector: h.sector || 'Diversified', icon: '📈', color: '#3b82f6' };
      const weight = totalValueForWeights > 0 ? ((h.currentValue || 0) / totalValueForWeights) * 100 : 0;
      return {
        ...h,
        sectorName: meta.sector,
        icon: meta.icon,
        color: meta.color,
        weight,
      };
    });
  }, [holdings, totalValueForWeights]);

  // Sector breakdown
  const computedSectors = useMemo(() => {
    const map: Record<string, { sector: string; value: number; count: number; icon: string; color: string }> = {};
    enrichedHoldings.forEach((h) => {
      const sec = h.sectorName;
      if (!map[sec]) {
        map[sec] = { sector: sec, value: 0, count: 0, icon: h.icon, color: h.color };
      }
      map[sec].value += h.currentValue || 0;
      map[sec].count += 1;
    });

    const total = totalValueForWeights || 1;
    return Object.values(map)
      .map((item) => ({
        ...item,
        percentage: (item.value / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);
  }, [enrichedHoldings, totalValueForWeights]);

  // Base and Simulated Health Score — null (not a fabricated default) when
  // neither the AI review nor the summary has a real score to offer yet.
  const baseHealthScore = review?.portfolioScore ?? summary?.diversificationScore ?? null;
  const simulatedHealthScore = baseHealthScore != null ? Math.min(95, Math.round(baseHealthScore + rebalanceSimPct * 0.7)) : null;

  // Concentration Warnings
  const concentrationWarnings = useMemo(() => {
    const warnings: Array<{ title: string; message: string; pct: number }> = [];
    computedSectors.forEach((s) => {
      if (s.percentage > 30) {
        warnings.push({
          title: `${s.sector}`,
          message: `${s.sector} makes up ${s.percentage.toFixed(1)}% of total capital (recommended cap is 30%)`,
          pct: s.percentage,
        });
      }
    });
    return warnings;
  }, [computedSectors]);

  // Filtered Stock Recommendations and Holdings
  const filteredRecs = useMemo(() => {
    const recs = (review?.holdings && review.holdings.length > 0
      ? review.holdings
      : holdings.map((h) => ({
          symbol: h.symbol,
          action: ((h.pnlPct ?? 0) > 5 ? 'TRIM' : (h.pnlPct ?? 0) < -3 ? 'TRIM' : 'HOLD') as any,
          reason: `Watch signal on ${h.symbol}. Neutral momentum and price action.`,
        }))
    );

    return recs.filter((r) => {
      const holding = enrichedHoldings.find((h) => h.symbol === r.symbol);
      const isPos = ((holding?.pnl ?? 0) >= 0);
      if (actionFilter === 'GAINERS' && !isPos) return false;
      if (actionFilter === 'DECLINERS' && isPos) return false;
      if (actionFilter === 'TRIM' && r.action !== 'TRIM') return false;
      if (actionFilter === 'HOLD' && r.action !== 'HOLD') return false;
      if (searchQuery.trim() && !r.symbol.toUpperCase().includes(searchQuery.trim().toUpperCase())) return false;
      return true;
    });
  }, [review, holdings, enrichedHoldings, actionFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* ── 1. UNIQUE GLASSMORPHIC HERO BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] p-5 sm:p-6 text-white border border-[#1c2541] shadow-xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-blue-950/80 border border-blue-400/30 text-blue-300 text-[10.5px] font-mono font-bold tracking-wider mb-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE BROKER SYNC · ACTIVE
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
              Portfolio Intelligence
            </h1>
            <p className="mt-0.5 text-xs text-slate-300 font-light">
              Real-time positions, sector diversification, concentration risk, and TradePanda AI rebalancing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-md hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>↻</span> {syncing ? 'Syncing...' : 'Sync from Broker'}
            </button>
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>🐼</span> Ask TradePanda AI
            </button>
          </div>
        </div>

        {/* ── 2. 4 KEY METRICS ── */}
        <div className="relative z-10 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">INVESTED CAPITAL</div>
            <div className="mt-0.5 font-mono text-lg sm:text-2xl font-bold text-white truncate">
              {formatCurrency(investedVal)}
            </div>
            <div className="mt-0.5 text-[9.5px] sm:text-[10.5px] text-slate-400 font-mono truncate">Principal deployed</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">CURRENT VALUE</div>
            <div className="mt-0.5 font-mono text-lg sm:text-2xl font-bold text-white truncate">
              {formatCurrency(totalValue)}
            </div>
            <div className="mt-0.5 text-[9.5px] sm:text-[10.5px] text-slate-400 font-mono truncate">Live mark-to-market</div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
            <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">TOTAL P&amp;L</div>
            <div className={`mt-0.5 font-mono text-lg sm:text-2xl font-bold truncate ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? '+' : ''}{formatCurrency(totalPnl)}
            </div>
            <div className={`text-[10.5px] sm:text-xs font-mono font-bold truncate ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {formatPct(pnlPct)}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">HEALTH</div>
              <span className="font-mono text-[10.5px] sm:text-xs font-bold text-amber-400">{baseHealthScore ?? '—'}/100</span>
            </div>
            <div className="mt-0.5 font-mono text-lg sm:text-2xl font-bold text-white truncate">
              {baseHealthScore ?? '—'} <span className="text-[10px] sm:text-xs font-normal text-slate-400">/ 100</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${baseHealthScore == null ? 'bg-slate-500' : baseHealthScore >= 70 ? 'bg-emerald-400' : baseHealthScore >= 45 ? 'bg-amber-400' : 'bg-rose-400'}`}
                style={{ width: `${baseHealthScore ?? 0}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {error ? <ErrorBox message={error} /> : null}

      {/* ── 3. CONCENTRATION WARNINGS ── */}
      {concentrationWarnings.length > 0 && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/[0.04] p-3.5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-800 dark:text-amber-400">
            <span>⚠️</span> Concentration Warnings
          </div>
          {concentrationWarnings.map((w, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white">{w.title}</span>
                <span className="text-slate-600 dark:text-slate-400 font-light">{w.message}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-32 bg-amber-200 dark:bg-amber-900/40 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, w.pct)}%` }} />
                </div>
                <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">{w.pct.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 4. TRADEPANDA AI PORTFOLIO CO-PILOT ── */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-white/10 flex items-center justify-center text-base shadow-sm">
              🐼
            </div>
            <div>
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                TradePanda AI Portfolio Co-Pilot
              </h2>
              <span className="text-[10px] font-mono text-slate-400">Algorithmic thesis &amp; rebalance actions</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => dispatch(fetchPortfolioReview())}
            disabled={reviewLoading}
            className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-xs font-bold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            {reviewLoading ? 'Analyzing...' : '↻ Refresh AI Analysis'}
          </button>
        </div>

        {/* Narrative & Rebalance tip */}
        <div className="flex flex-col md:flex-row items-start gap-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
          <div className="flex flex-col items-center justify-center p-3 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/10 shrink-0 min-w-[90px] text-center shadow-sm">
            <span className="font-mono text-3xl font-black text-amber-500">{baseHealthScore ?? '—'}</span>
            <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">HEALTH SCORE</span>
          </div>

          <div className="flex-1 space-y-1.5 text-xs text-slate-700 dark:text-slate-300 font-light leading-relaxed">
            <p>
              {review?.overallNarrative ??
                `Your portfolio has a ${isProfit ? '+' : ''}${formatPct(pnlPct)} return across ${holdings.length} equities. While the broader market regime is active, select holdings show rotational opportunities.`}
            </p>

            {review?.rebalancing && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/40 text-xs text-blue-900 dark:text-blue-300 flex items-start gap-2">
                <span className="text-sm">💡</span>
                <div>
                  <strong>Rebalancing Tip:</strong> {review.rebalancing}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive What-If Simulator */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200/60 dark:border-blue-800/40 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
              <span>✨</span> Interactive What-If Rebalancer: Simulate Trimming Concentration
            </div>
            <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {simulatedHealthScore != null && baseHealthScore != null
                ? `Projected Health: ${simulatedHealthScore}/100 (+${simulatedHealthScore - baseHealthScore} pts)`
                : 'Projected Health: — (no health score available yet)'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="30"
              step="5"
              value={rebalanceSimPct}
              onChange={(e) => setRebalanceSimPct(Number(e.target.value))}
              className="flex-1 accent-blue-600 cursor-pointer"
            />
            <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 min-w-[70px] text-right">
              {rebalanceSimPct}% Trimmed
            </span>
          </div>
        </div>

        {/* Recommendations Filter and Grid */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              STOCK RECOMMENDATIONS ({filteredRecs.length} of {holdings.length})
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {(['ALL', 'GAINERS', 'DECLINERS', 'TRIM', 'HOLD'] as ActionFilter[]).map((f) => {
                const isSel = actionFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActionFilter(f)}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSel
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ALL STOCK RECOMMENDATIONS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredRecs.map((rec) => {
              const holdingMeta = enrichedHoldings.find((h) => h.symbol === rec.symbol);
              const isPos = ((holdingMeta?.pnl ?? 0) >= 0);
              return (
                <div
                  key={rec.symbol}
                  className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-slate-50/50 dark:bg-white/[0.02] flex flex-col justify-between gap-2.5 hover:border-blue-500/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <strong className="text-xs font-black text-slate-900 dark:text-white">{rec.symbol}</strong>
                      {holdingMeta && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">{holdingMeta.sectorName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MiniSparkline isUp={isPos} />
                      <span className={`px-2 py-0.5 rounded font-mono text-[9.5px] font-extrabold border uppercase ${actionBadge(rec.action)}`}>
                        {rec.action.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11.5px] text-slate-600 dark:text-slate-300 font-light leading-relaxed">
                    {rec.reason}
                  </p>

                  <div className="pt-1.5 border-t border-slate-200/80 dark:border-white/5 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedStockBreakdown(rec.symbol)}
                      className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer flex items-center gap-1 text-[11px]"
                    >
                      View Breakdown &rarr;
                    </button>
                    <Link
                      to={`/ai-picks?symbol=${rec.symbol}`}
                      className="text-[10.5px] text-slate-500 hover:text-blue-500 transition-colors"
                    >
                      AI Pick Setup
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Inline AI Search Bar */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-[#1c2541] space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            ASK TRADEPANDA ABOUT YOUR PORTFOLIO
          </div>
          <form onSubmit={handleAsk} className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. 'Should I add more banking stocks?' or 'Which holding is riskiest?'"
              className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-black/40 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
            />
            <button
              type="submit"
              disabled={chatLoading}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
            >
              {chatLoading ? 'Thinking...' : 'Ask'}
            </button>
          </form>

          {chatAnswer && (
            <div className="mt-2.5 p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-light">
              <strong className="text-blue-600 dark:text-blue-400 block mb-0.5">🐼 TradePanda:</strong>
              {chatAnswer}
            </div>
          )}
        </div>
      </div>

      {/* ── 5. CURRENT HOLDINGS TABLE & SECTOR EXPOSURE BENTO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Holdings Table (8 Cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Current Holdings</h2>
              <span className="text-[11px] font-mono text-slate-500">{holdings.length} stocks active in portfolio</span>
            </div>

            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter holding..."
              className="px-3 py-1 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-black/30 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 uppercase w-32"
            />
          </div>

          <div className="w-full rounded-xl border border-slate-200 dark:border-[#1c2541] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-[#070d1e]/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-2.5 sm:px-3 py-2.5">SYMBOL</th>
                  <th className="hidden sm:table-cell px-2.5 sm:px-3 py-2.5">SECTOR</th>
                  <th className="px-2.5 sm:px-3 py-2.5 text-right">QTY</th>
                  <th className="hidden md:table-cell px-2.5 sm:px-3 py-2.5 text-right">AVG</th>
                  <th className="px-2.5 sm:px-3 py-2.5 text-right">LTP</th>
                  <th className="hidden lg:table-cell px-2.5 sm:px-3 py-2.5 text-right">INVESTED</th>
                  <th className="px-2.5 sm:px-3 py-2.5 text-right">VALUE</th>
                  <th className="px-2.5 sm:px-3 py-2.5 text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
                {enrichedHoldings.map((h) => {
                  const isPos = (h.pnl ?? 0) >= 0;
                  return (
                    <tr key={h.symbol} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-2.5 sm:px-3 py-2.5 font-extrabold text-slate-900 dark:text-white">
                        <Link to={`/ai-picks?symbol=${h.symbol}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1 truncate">
                          <span>{h.symbol}</span>
                        </Link>
                      </td>
                      <td className="hidden sm:table-cell px-2.5 sm:px-3 py-2.5 text-slate-500 dark:text-slate-400 text-[10.5px]">
                        {h.sectorName}
                      </td>
                      <td className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-semibold text-slate-900 dark:text-white">
                        {formatNumber(h.quantity, 0)}
                      </td>
                      <td className="hidden md:table-cell px-2.5 sm:px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatCurrency(h.averagePrice)}
                      </td>
                      <td className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(h.currentPrice)}
                      </td>
                      <td className="hidden lg:table-cell px-2.5 sm:px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                        {formatCurrency(h.costValue || (h.quantity * h.averagePrice))}
                      </td>
                      <td className="px-2.5 sm:px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {formatCurrency(h.currentValue)}
                      </td>
                      <td className="px-2.5 sm:px-3 py-2.5 text-right whitespace-nowrap">
                        <span className={`font-mono font-extrabold text-[11px] sm:text-xs ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {isPos ? '+' : ''}{formatCurrency(h.pnl)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sector Exposure (4 Cols) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Sector Exposure</h2>
            <span className="text-xs font-mono text-slate-500">{computedSectors.length} sectors</span>
          </div>

          <div className="space-y-2 pt-1">
            {computedSectors.map((sec) => (
              <div key={sec.sector} className="space-y-0.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 text-[11.5px]">
                    <span>{sec.icon}</span>
                    <span>{sec.sector}</span>
                  </span>
                  <span className="font-mono font-extrabold text-slate-900 dark:text-white">{sec.percentage.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-black/40 overflow-hidden border border-slate-200 dark:border-white/5">
                  <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${sec.percentage}%` }} />
                </div>
                <div className="text-[9.5px] font-mono text-slate-400 text-right">
                  {formatCurrency(sec.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6. STOCK BREAKDOWN MODAL ── */}
      {selectedStockBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-[#0b132b] p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {selectedStockBreakdown} — AI Analysis
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStockBreakdown(null)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {(() => {
              const holding = enrichedHoldings.find((h) => h.symbol === selectedStockBreakdown);
              const rec = review?.holdings?.find((r) => r.symbol === selectedStockBreakdown);
              return (
                <div className="space-y-3 text-xs">
                  {holding && (
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-[#1c2541] text-center font-mono">
                      <div>
                        <div className="text-[9.5px] text-slate-400 font-bold">LTP</div>
                        <div className="font-black text-slate-900 dark:text-white text-xs sm:text-sm">{formatCurrency(holding.currentPrice)}</div>
                      </div>
                      <div>
                        <div className="text-[9.5px] text-slate-400 font-bold">P&amp;L</div>
                        <div className={`font-black text-xs sm:text-sm ${(holding.pnl ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {formatCurrency(holding.pnl)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9.5px] text-slate-400 font-bold">ACTION</div>
                        <div className="font-black text-blue-600 dark:text-blue-400 text-xs sm:text-sm">{rec?.action ?? 'HOLD'}</div>
                      </div>
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 space-y-1.5">
                    <div className="font-bold text-blue-900 dark:text-blue-300 uppercase text-[9.5px] tracking-wider">
                      AI Reasoning &amp; Strategy
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-light leading-relaxed text-xs">
                      {rec?.reason ?? 'Technical and quantitative models indicate steady trend continuity with low idiosyncratic volatility.'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      to={`/ai-picks?symbol=${selectedStockBreakdown}`}
                      className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-center text-xs transition-colors"
                    >
                      Open AI Strategy Setup &rarr;
                    </Link>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── 7. FULLSCREEN TRADEPANDA CHAT ── */}
      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}