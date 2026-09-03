import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { TradePandaChat } from '../components/TradePandaChat';
import { Badge, Card, EmptyState, ErrorBox, PaginationBar, Spinner } from '../components/ui';
import { formatCurrency, formatDateTime, formatPct, formatTimeAgo, regimeBadgeClass, signalBadgeClass } from '../lib/format';
import { fetchAllQuotes } from '../store/marketSlice';
import { fetchLatestScan, fetchOpportunities, fetchSignals, runScan } from '../store/radarSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

type SignalFilter = '' | 'BUY' | 'WATCH' | 'AVOID';
type OutlookFilter = '' | 'BULLISH' | 'NEUTRAL' | 'BEARISH';
type ExplorerView = 'opportunities' | 'signals';


const SIGNAL_OPTIONS: Array<{ value: SignalFilter; label: string }> = [
  { value: '', label: 'All Actions' },
  { value: 'BUY', label: 'Buy' },
  { value: 'WATCH', label: 'Watch' },
  { value: 'AVOID', label: 'Avoid' },
];

const OUTLOOK_OPTIONS: Array<{ value: OutlookFilter; label: string }> = [
  { value: '', label: 'Any Outlook' },
  { value: 'BULLISH', label: 'Bullish' },
  { value: 'NEUTRAL', label: 'Neutral' },
  { value: 'BEARISH', label: 'Bearish' },
];

function ConvictionRing({ value, size = 52 }: { value: number; size?: number }) {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r="16" fill="none" stroke="currentColor" className="text-slate-200 dark:text-[#1c2541]" strokeWidth="4" />
        <circle
          cx="21"
          cy="21"
          r="16"
          fill="none"
          stroke={safe >= 70 ? '#10b981' : safe >= 45 ? '#3b82f6' : '#f43f5e'}
          strokeWidth="4"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${safe} 100`}
        />
      </svg>
      <span className="absolute font-mono text-xs font-black text-slate-900 dark:text-white">{safe}</span>
    </div>
  );
}

function BreadthDonut({ advancing, total }: { advancing: number; total: number }) {
  const pct = total ? Math.round((advancing / total) * 100) : 0;
  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center" aria-label={`${pct} percent of stocks advancing`}>
      <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90">
        <circle cx="21" cy="21" r="16" fill="none" stroke="currentColor" className="text-slate-200 dark:text-white/10" strokeWidth="4" />
        <circle
          cx="21"
          cy="21"
          r="16"
          fill="none"
          stroke="#10b981"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${pct} 100`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-base font-black text-white">{pct}%</span>
        <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-emerald-400">ADV</span>
      </div>
    </div>
  );
}

function RadarFilterBar({
  signal,
  outlook,
  minConviction,
  search,
  onSignal,
  onOutlook,
  onMinConviction,
  onSearch,
}: {
  signal: SignalFilter;
  outlook: OutlookFilter;
  minConviction: number;
  search: string;
  onSignal: (value: SignalFilter) => void;
  onOutlook: (value: OutlookFilter) => void;
  onMinConviction: (value: number) => void;
  onSearch: (value: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-black/30 p-3.5">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Action</span>
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/40 p-1">
          {SIGNAL_OPTIONS.map((option) => {
            const isSel = signal === option.value;
            return (
              <button
                key={option.value || 'all'}
                type="button"
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  isSel
                    ? option.value === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : option.value === 'WATCH'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : option.value === 'AVOID'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                onClick={() => onSignal(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Outlook</span>
        <select
          value={outlook}
          onChange={(event) => onOutlook(event.target.value as OutlookFilter)}
          className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
        >
          {OUTLOOK_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-col gap-1">
        <span className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span>Min Score</span>
          <strong className="text-slate-900 dark:text-white">{minConviction === 0 ? 'Any' : `${minConviction}+`}</strong>
        </span>
        <input
          type="range"
          min="0"
          max="90"
          step="5"
          value={minConviction}
          className="w-full accent-blue-600"
          onChange={(event) => onMinConviction(Number(event.target.value))}
        />
      </div>

      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Filter Stock</span>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search symbol (e.g. RELIANCE)..."
          className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/40 px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 uppercase font-mono"
        />
      </div>
    </div>
  );
}

export function RadarPage() {
  const dispatch = useAppDispatch();
  const { scanResult, scanning, lastScannedAt, opportunities, signals, loading, signalsLoading, error } = useAppSelector((state) => state.radar);
  const { indices, allQuotes, breadth: liveBreadth } = useAppSelector((state) => state.market);
  // Layout already fetches/polls this from the server's one canonical,
  // holiday-aware market-status source — using it here (instead of the old
  // local weekday+clock check with no holiday calendar) means this page
  // agrees with every prediction shown on it about whether the market is
  // actually open right now.
  const marketOpen = useAppSelector((s) => s.market.status?.isOpen ?? false);

  const sliderRef = useRef<HTMLDivElement>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [streamPage, setStreamPage] = useState(1);
  const [streamSignal, setStreamSignal] = useState<SignalFilter>('');
  const [streamOutlook, setStreamOutlook] = useState<OutlookFilter>('');
  const [streamMinScore, setStreamMinScore] = useState(0);
  const [streamSearch, setStreamSearch] = useState('');

  const [explorerView, setExplorerView] = useState<ExplorerView>('opportunities');
  const [oppPage, setOppPage] = useState(1);
  const [sigPage, setSigPage] = useState(1);
  const [explorerSignal, setExplorerSignal] = useState<SignalFilter>('');
  const [explorerOutlook, setExplorerOutlook] = useState<OutlookFilter>('');
  const [explorerMinScore, setExplorerMinScore] = useState(0);
  const [explorerSearchInput, setExplorerSearchInput] = useState('');
  const [explorerSearch, setExplorerSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setExplorerSearch(explorerSearchInput.trim());
      setOppPage(1);
      setSigPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [explorerSearchInput]);

  useEffect(() => {
    const filters = {
      signal: explorerSignal || undefined,
      outlook: explorerOutlook || undefined,
      minConviction: explorerMinScore || undefined,
      symbol: explorerSearch || undefined,
    };
    dispatch(fetchOpportunities({ page: oppPage, limit: 10, ...filters }));
    dispatch(fetchSignals({ page: sigPage, limit: 20, ...filters }));
  }, [dispatch, oppPage, sigPage, explorerSignal, explorerOutlook, explorerMinScore, explorerSearch, lastScannedAt]);

  useEffect(() => {
    if (opportunities && oppPage > opportunities.meta.totalPages) setOppPage(opportunities.meta.totalPages);
  }, [opportunities, oppPage]);

  useEffect(() => {
    if (signals && sigPage > signals.meta.totalPages) setSigPage(signals.meta.totalPages);
  }, [signals, sigPage]);

  useEffect(() => {
    dispatch(fetchLatestScan());
    dispatch(fetchAllQuotes());
  }, [dispatch]);

  useEffect(() => {
    if (!marketOpen) return;
    const quotesTimer = setInterval(() => dispatch(fetchAllQuotes()), 60000);
    return () => clearInterval(quotesTimer);
  }, [dispatch, marketOpen]);


  const scanRows = scanResult?.opportunities ?? [];
  const breadth = liveBreadth ?? scanResult?.breadth ?? null;

  const actionCounts = useMemo(() => ({
    BUY: scanRows.filter((row) => String(row.signal || '').toUpperCase().includes('BUY')).length,
    WATCH: scanRows.filter((row) => String(row.signal || '').toUpperCase().includes('WATCH') || String(row.signal || '').toUpperCase().includes('HOLD')).length,
    AVOID: scanRows.filter((row) => String(row.signal || '').toUpperCase().includes('AVOID') || String(row.signal || '').toUpperCase().includes('SELL')).length,
  }), [scanRows]);

  const outlookCounts = useMemo(() => ({
    BULLISH: scanRows.filter((row) => (row.directionalOutlook || '').toUpperCase() === 'BULLISH').length,
    NEUTRAL: scanRows.filter((row) => (row.directionalOutlook || '').toUpperCase() === 'NEUTRAL').length,
    BEARISH: scanRows.filter((row) => (row.directionalOutlook || '').toUpperCase() === 'BEARISH').length,
  }), [scanRows]);

  const averageConviction = scanRows.length
    ? Math.round(scanRows.reduce((sum, row) => sum + row.convictionScore, 0) / scanRows.length)
    : 0;
  const highConviction = scanRows.filter((row) => row.convictionScore >= 70).length;
  const quotedStocks = allQuotes.filter((quote) => quote.lastPrice != null).length;

  const quoteBySymbol = useMemo(() => new Map(allQuotes.map((q) => [q.symbol, q])), [allQuotes]);

  const streamRows = useMemo(() => {
    let rows = [...scanRows];
    if (streamSignal) {
      const sigUpper = streamSignal.toUpperCase();
      rows = rows.filter((r) => {
        const s = String(r.signal || '').toUpperCase();
        if (sigUpper === 'BUY') return s.includes('BUY');
        if (sigUpper === 'AVOID') return s.includes('AVOID') || s.includes('SELL');
        if (sigUpper === 'WATCH') return s.includes('WATCH') || s.includes('HOLD') || s.includes('NEUTRAL');
        return s === sigUpper;
      });
    }
    if (streamOutlook) rows = rows.filter((r) => (r.directionalOutlook || '').toUpperCase() === streamOutlook.toUpperCase());
    if (streamMinScore > 0) rows = rows.filter((r) => r.convictionScore >= streamMinScore);
    const q = streamSearch.trim().toUpperCase();
    if (q) rows = rows.filter((r) => r.symbol.toUpperCase().includes(q));
    return rows;
  }, [scanRows, streamSignal, streamOutlook, streamMinScore, streamSearch]);


  const STREAM_PAGE_SIZE = 8;
  const streamPages = Math.max(1, Math.ceil(streamRows.length / STREAM_PAGE_SIZE));
  const safeStreamPage = Math.min(streamPage, streamPages);
  const visibleStream = useMemo(() => {
    const start = (safeStreamPage - 1) * STREAM_PAGE_SIZE;
    return streamRows.slice(start, start + STREAM_PAGE_SIZE);
  }, [streamRows, safeStreamPage]);

  const explorerFallbackRows = useMemo(() => {
    let rows = [...scanRows];
    if (explorerSignal) {
      const sigUpper = explorerSignal.toUpperCase();
      rows = rows.filter((r) => {
        const s = String(r.signal || '').toUpperCase();
        if (sigUpper === 'BUY') return s.includes('BUY');
        if (sigUpper === 'AVOID') return s.includes('AVOID') || s.includes('SELL');
        if (sigUpper === 'WATCH') return s.includes('WATCH') || s.includes('HOLD') || s.includes('NEUTRAL');
        return s === sigUpper;
      });
    }
    if (explorerOutlook) rows = rows.filter((r) => (r.directionalOutlook || '').toUpperCase() === explorerOutlook.toUpperCase());
    if (explorerMinScore > 0) rows = rows.filter((r) => r.convictionScore >= explorerMinScore);
    const q = explorerSearch.trim().toUpperCase();
    if (q) rows = rows.filter((r) => r.symbol.toUpperCase().includes(q));
    return rows;
  }, [scanRows, explorerSignal, explorerOutlook, explorerMinScore, explorerSearch]);

  const effectiveOpportunities = useMemo(() => {
    if (opportunities?.data && opportunities.data.length > 0) {
      return { data: opportunities.data, totalPages: opportunities.meta.totalPages };
    }
    const total = explorerFallbackRows.length;
    const totalPages = Math.max(1, Math.ceil(total / 10));
    const start = (oppPage - 1) * 10;
    const data = explorerFallbackRows.slice(start, start + 10).map((r, idx) => ({
      id: idx + 1,
      symbol: r.symbol,
      exchange: r.exchange || 'NSE',
      signal: r.signal,
      directionalOutlook: r.directionalOutlook || 'BULLISH',
      convictionScore: r.convictionScore,
      createdAt: new Date().toISOString(),
    }));
    return { data, totalPages };
  }, [opportunities, explorerFallbackRows, oppPage]);



  const gainers = useMemo(() => {
    return [...allQuotes].filter((q) => q.changePct != null).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 5);
  }, [allQuotes]);

  const losers = useMemo(() => {
    return [...allQuotes].filter((q) => q.changePct != null).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 5);
  }, [allQuotes]);

  const scrollSlider = (direction: number) => {
    if (!sliderRef.current) return;
    sliderRef.current.scrollBy({ left: direction * sliderRef.current.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="space-y-4">
      {/* ── TOP HERO BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-5 sm:p-6 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-blue-950/80 border border-blue-400/30 text-blue-300 text-[10.5px] font-mono font-bold tracking-wider mb-1.5">
              {marketOpen ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>NIFTY 100 MARKET INTELLIGENCE · LIVE</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>NIFTY 100 MARKET INTELLIGENCE · MARKET CLOSED (EOD)</span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white leading-snug">
              Opportunity Radar
            </h1>
            <p className="mt-0.5 max-w-xl text-xs text-slate-300 leading-relaxed font-light">
              {marketOpen
                ? 'Systematic screening of available Nifty 100 data, with clear trend context, risk filters and AI-validated actions.'
                : 'Showing latest verified EOD session data & multi-factor opportunity scans (NSE/BSE Closed).'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold ${
              marketOpen
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}>
              <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono font-semibold text-slate-300">
              {lastScannedAt ? `UPDATED ${formatTimeAgo(lastScannedAt).toUpperCase()}` : 'AWAITING SCAN'}
            </span>
            <button
              type="button"
              className="px-3.5 py-2 rounded-xl bg-white text-xs font-bold text-slate-900 shadow-md hover:bg-slate-100 transition-colors cursor-pointer"
              onClick={() => dispatch(runScan())}
              disabled={scanning}
            >
              {scanning ? 'Scanning market...' : '⚡ Scan market now'}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer"
              onClick={() => setChatOpen(true)}
            >
              Ask TradePanda 🐼
            </button>
          </div>
        </div>


        <div className="relative z-10 pt-4 flex flex-wrap items-center gap-5 sm:gap-7">
          <BreadthDonut advancing={breadth?.advancing ?? 0} total={breadth?.total ?? 0} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Market Trend</div>
            <div className="font-mono text-base font-black text-white mt-0.5">{scanResult?.regime ?? 'NEUTRAL'}</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data Coverage</div>
            <div className="font-mono text-base font-black text-white mt-0.5">{quotedStocks}/{allQuotes.length || 100} quoted</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Strong Signals</div>
            <div className="font-mono text-base font-black text-emerald-400 mt-0.5">{highConviction} at 70+</div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/10" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avg Conviction</div>
            <div className="font-mono text-base font-black text-blue-400 mt-0.5">{averageConviction}/100</div>
          </div>
        </div>
      </section>

      {/* ── BENCHMARK INDICES BAR ── */}
      {indices.length ? (
        <div className="flex items-center gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {indices.slice(0, 5).map((index) => (
            <div
              key={index.symbol}
              className={`flex min-w-[150px] shrink-0 flex-col gap-1 rounded-2xl border p-3 bg-white dark:bg-[#0b132b]/80 shadow-sm ${
                index.changePct >= 0
                  ? 'border-emerald-200 dark:border-emerald-500/20 text-slate-900 dark:text-white'
                  : 'border-rose-200 dark:border-rose-500/20 text-slate-900 dark:text-white'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{index.symbol}</span>
                <span className="text-[9px] font-mono text-slate-400">INDEX</span>
              </div>
              <strong className="text-sm font-black font-mono text-slate-900 dark:text-white">{index.level.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</strong>
              <span className={`text-[11px] font-mono font-bold ${index.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatPct(index.changePct)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {error ? <ErrorBox message={error} onRetry={() => dispatch(fetchLatestScan())} /> : null}

      {/* ── ACTION BREAKDOWN & MARKET MOVERS BENTO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recommended Actions Breakdown">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
                <div className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-400">BUY</div>
                <div className="font-mono text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{actionCounts.BUY}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                <div className="text-[10px] font-bold uppercase text-amber-800 dark:text-amber-400">WATCH</div>
                <div className="font-mono text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{actionCounts.WATCH}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30">
                <div className="text-[10px] font-bold uppercase text-rose-800 dark:text-rose-400">AVOID</div>
                <div className="font-mono text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">{actionCounts.AVOID}</div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] text-xs font-bold">
              <span className="text-emerald-600 dark:text-emerald-400">● {outlookCounts.BULLISH} Bullish</span>
              <span className="text-slate-500">● {outlookCounts.NEUTRAL} Neutral</span>
              <span className="text-rose-600 dark:text-rose-400">● {outlookCounts.BEARISH} Bearish</span>
            </div>
          </div>
        </Card>

        <Card title="Market Movers (Real-time)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/[0.03] p-3.5 space-y-2">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Top Gainers</span>
              <div className="space-y-1.5">
                {gainers.map((quote, index) => (
                  <Link
                    key={quote.symbol}
                    to={`/ai-picks?symbol=${quote.symbol}`}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-white/80 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">#{index + 1}</span>
                      <strong className="text-xs font-bold text-slate-900 dark:text-white">{quote.symbol}</strong>
                    </div>
                    <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{formatPct(quote.changePct)}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-rose-500/20 bg-rose-50/50 dark:bg-rose-500/[0.03] p-3.5 space-y-2">
              <span className="text-[10.5px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-400">Top Decliners</span>
              <div className="space-y-1.5">
                {losers.map((quote, index) => (
                  <Link
                    key={quote.symbol}
                    to={`/ai-picks?symbol=${quote.symbol}`}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-white/80 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-400">#{index + 1}</span>
                      <strong className="text-xs font-bold text-slate-900 dark:text-white">{quote.symbol}</strong>
                    </div>
                    <span className="font-mono text-xs font-extrabold text-rose-600 dark:text-rose-400">{formatPct(quote.changePct)}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── OPPORTUNITY SLIDER CARDS ── */}
      <Card
        title="Top Radar Ranked Opportunities"
        action={<span className="text-xs text-slate-500 font-mono">{streamRows.length} matching setups</span>}
      >
        <RadarFilterBar
          signal={streamSignal}
          outlook={streamOutlook}
          minConviction={streamMinScore}
          search={streamSearch}
          onSignal={(value) => { setStreamSignal(value); setStreamPage(1); }}
          onOutlook={(value) => { setStreamOutlook(value); setStreamPage(1); }}
          onMinConviction={(value) => { setStreamMinScore(value); setStreamPage(1); }}
          onSearch={(value) => { setStreamSearch(value); setStreamPage(1); }}
        />

        {scanning && !scanResult ? (
          <Spinner label="Scanning Nifty 100 signal matrix..." />
        ) : visibleStream.length ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
              <span>Showing {visibleStream.length} of {streamRows.length} setups</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollSlider(-1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  &larr; Prev
                </button>
                <button
                  type="button"
                  onClick={() => scrollSlider(1)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/10 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Next &rarr;
                </button>
              </div>
            </div>

            <div
              className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 pt-1"
              style={{ scrollbarWidth: 'none' }}
              ref={sliderRef}
            >
              {visibleStream.map((row, index) => (
                <Link
                  key={row.symbol}
                  to={`/ai-picks?symbol=${row.symbol}`}
                  className="flex w-[290px] shrink-0 snap-start flex-col gap-3 rounded-3xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/95 p-5 shadow-sm dark:shadow-xl dark:shadow-black/20 hover:border-blue-500/50 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-slate-400">#{(safeStreamPage - 1) * STREAM_PAGE_SIZE + index + 1}</span>
                      <div className="text-base font-black text-slate-900 dark:text-white">{row.symbol}</div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400 max-w-[150px]">{quoteBySymbol.get(row.symbol)?.name ?? 'NSE Equity'}</div>
                    </div>
                    <Badge className={signalBadgeClass(row.signal)}>{row.signal}</Badge>
                  </div>

                  <div className="flex items-center gap-3.5 pt-1">
                    <ConvictionRing value={row.convictionScore} />
                    <div className="flex flex-col gap-1">
                      <strong className="font-mono text-base font-black text-slate-900 dark:text-white">{formatCurrency(row.price)}</strong>
                      <Badge className={regimeBadgeClass(row.directionalOutlook ?? 'NEUTRAL')}>{row.directionalOutlook ?? 'Neutral'}</Badge>
                    </div>
                  </div>

                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Signal Rationale</div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-700 dark:text-slate-300 font-light">
                    {row.explanation.replace(/^AI Strategy:\s*(BUY|WATCH|AVOID)\s*\(score\s*\d+\)\s*[\u2014-]\s*/i, '')}
                  </p>

                  <div className="mt-auto pt-2 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    Analyze stock &rarr;
                  </div>
                </Link>
              ))}
            </div>

            <PaginationBar page={safeStreamPage} totalPages={streamPages} onPage={setStreamPage} />
          </div>
        ) : (
          <EmptyState title="No setups match this filter" hint="Adjust the minimum score or reset the action filter." />
        )}
      </Card>

      {/* ── ALL SIGNALS EXPLORER TABLE ── */}
      <Card
        title="Stock Signals & Multi-Factor Explorer"
        action={
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/30 p-1">
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${explorerView === 'opportunities' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              onClick={() => setExplorerView('opportunities')}
            >
              Ranked Setups
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${explorerView === 'signals' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
              onClick={() => setExplorerView('signals')}
            >
              Technical Signals
            </button>
          </div>
        }
      >
        <RadarFilterBar
          signal={explorerSignal}
          outlook={explorerOutlook}
          minConviction={explorerMinScore}
          search={explorerSearchInput}
          onSignal={(value) => { setExplorerSignal(value); setOppPage(1); setSigPage(1); }}
          onOutlook={(value) => { setExplorerOutlook(value); setOppPage(1); setSigPage(1); }}
          onMinConviction={(value) => { setExplorerMinScore(value); setOppPage(1); setSigPage(1); }}
          onSearch={setExplorerSearchInput}
        />

        {loading || signalsLoading ? (
          <Spinner label="Loading signal explorer..." />
        ) : explorerView === 'opportunities' && effectiveOpportunities.data.length ? (
          <>
            <div className="w-full rounded-xl border border-slate-200 dark:border-[#1c2541] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-100/90 dark:bg-[#070d1e]/80 text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="hidden sm:table-cell px-3 py-2.5">Rank</th>
                    <th className="px-3 py-2.5">Stock</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="hidden sm:table-cell px-3 py-2.5">Direction</th>
                    <th className="px-3 py-2.5">Signal Strength</th>
                    <th className="hidden md:table-cell px-3 py-2.5">Last Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
                  {effectiveOpportunities.data.map((row, index) => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="hidden sm:table-cell px-3 py-2.5 font-mono text-slate-500">#{(oppPage - 1) * 10 + index + 1}</td>
                      <td className="px-3 py-2.5">
                        <Link to={`/ai-picks?symbol=${row.symbol}`} className="font-extrabold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {row.symbol}
                          <span className="ml-1 text-[10px] text-slate-400">{row.exchange}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5"><Badge className={signalBadgeClass(row.signal)}>{row.signal}</Badge></td>
                      <td className="hidden sm:table-cell px-3 py-2.5"><Badge className={regimeBadgeClass(row.directionalOutlook ?? 'NEUTRAL')}>{row.directionalOutlook ?? 'Neutral'}</Badge></td>
                      <td className="px-3 py-2.5">
                        <div className="flex h-5 w-20 sm:w-24 items-center rounded-lg bg-slate-100 dark:bg-white/5 relative overflow-hidden border border-slate-200 dark:border-white/10">
                          <span className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-blue-400" style={{ width: `${row.convictionScore}%` }} />
                          <strong className="relative z-10 w-full text-center font-mono text-[10px] sm:text-[10.5px] font-black text-slate-900 dark:text-white">{row.convictionScore}/100</strong>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={oppPage} totalPages={effectiveOpportunities.totalPages} onPage={setOppPage} />
          </>
        ) : explorerView === 'signals' && signals?.data.length ? (

          <>
            <div className="w-full rounded-xl border border-slate-200 dark:border-[#1c2541] overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-100/90 dark:bg-[#070d1e]/80 text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5">Stock</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="hidden sm:table-cell px-3 py-2.5">Direction</th>
                    <th className="px-3 py-2.5">Strength</th>
                    <th className="hidden sm:table-cell px-3 py-2.5">Why this signal</th>
                    <th className="hidden md:table-cell px-3 py-2.5">Last Scanned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
                  {signals.data.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 py-2.5">
                        <Link to={`/ai-picks?symbol=${row.symbol}`} className="font-extrabold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                          {row.symbol}
                          <span className="ml-1 text-[10px] text-slate-400">{row.exchange}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2.5"><Badge className={signalBadgeClass(row.signal)}>{row.signal}</Badge></td>
                      <td className="hidden sm:table-cell px-3 py-2.5"><Badge className={regimeBadgeClass(row.directionalOutlook ?? 'NEUTRAL')}>{row.directionalOutlook ?? 'Neutral'}</Badge></td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900 dark:text-white">{row.convictionScore}</td>
                      <td className="hidden sm:table-cell px-3 py-2.5 max-w-xs truncate text-xs text-slate-700 dark:text-slate-300 font-light" title={row.reason}>{row.reason}</td>
                      <td className="hidden md:table-cell px-3 py-2.5 font-mono text-[11px] text-slate-500 dark:text-slate-400">{formatDateTime(row.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar page={sigPage} totalPages={signals.meta.totalPages} onPage={setSigPage} />
          </>
        ) : (
          <EmptyState title="No matching records found" />
        )}
      </Card>

      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
