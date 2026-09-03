import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchQuotes, fetchAllQuotes, fetchLiveBySymbols } from '../store/marketSlice';
import { TradePandaChat } from '../components/TradePandaChat';
import { Card, PaginationBar } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, formatCompact, formatTimeAgo } from '../lib/format';

type Tab = 'nifty' | 'all' | 'gainers' | 'volume';
type SortKey = 'symbol' | 'name' | 'lastPrice' | 'change' | 'changePct' | 'volume';

const INDEX_NAMES: Record<string, string> = {
  NIFTY: 'NIFTY 50',
  NIFTYBANK: 'NIFTY BANK',
  SENSEX: 'SENSEX',
  FINNIFTY: 'FINNIFTY',
};

const SECTOR_MAP: Record<string, { sector: string; icon: string }> = {
  RELIANCE: { sector: 'Energy', icon: '⛽' },
  TCS: { sector: 'IT', icon: '💻' },
  INFY: { sector: 'IT', icon: '💻' },
  WIPRO: { sector: 'IT', icon: '💻' },
  HCLTECH: { sector: 'IT', icon: '💻' },
  TECHM: { sector: 'IT', icon: '💻' },
  HDFCBANK: { sector: 'Banking', icon: '🏦' },
  ICICIBANK: { sector: 'Banking', icon: '🏦' },
  SBIN: { sector: 'Banking', icon: '🏦' },
  KOTAKBANK: { sector: 'Banking', icon: '🏦' },
  AXISBANK: { sector: 'Banking', icon: '🏦' },
  BAJFINANCE: { sector: 'Financials', icon: '💳' },
  MARUTI: { sector: 'Auto', icon: '🚗' },
  TATAMOTORS: { sector: 'Auto', icon: '🚗' },
  'M&M': { sector: 'Auto', icon: '🚗' },
  ITC: { sector: 'FMCG', icon: '🛒' },
  HINDUNILVR: { sector: 'FMCG', icon: '🛒' },
  HAL: { sector: 'Defence', icon: '🛡️' },
  BHEL: { sector: 'Capital Goods', icon: '⚙️' },
  DLF: { sector: 'Real Estate', icon: '🏢' },
  GODREJPROP: { sector: 'Real Estate', icon: '🏢' },
  POWERGRID: { sector: 'Power', icon: '⚡' },
  NTPC: { sector: 'Power', icon: '⚡' },
  TATAPOWER: { sector: 'Power', icon: '⚡' },
  HINDZINC: { sector: 'Metals', icon: '⛏️' },
  VEDL: { sector: 'Metals', icon: '⛏️' },
  TATASTEEL: { sector: 'Metals', icon: '⛏️' },
  IOC: { sector: 'Energy', icon: '⛽' },
  GAIL: { sector: 'Utilities', icon: '🔥' },
  SUNPHARMA: { sector: 'Pharma', icon: '💊' },
  CIPLA: { sector: 'Pharma', icon: '💊' },
  DIVISLAB: { sector: 'Pharma', icon: '💊' },
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

function SortHeader({
  label,
  k,
  sort,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`px-2.5 sm:px-4 py-3.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider transition-colors hover:text-blue-600 dark:hover:text-white cursor-pointer ${
          active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        <span>{label}</span>
        <span className="font-mono text-[10px]">{active ? (sort.dir === 1 ? '▲' : '▼') : '•'}</span>
      </button>
    </th>
  );
}

export function MarketPage() {
  const dispatch = useAppDispatch();
  const { indices, quotes, allQuotes, liveDetail, top, error, lastUpdated } = useAppSelector((s) => s.market);
  const [tab, setTab] = useState<Tab>('nifty');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'changePct', dir: -1 });
  const [page, setPage] = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [moverTab, setMoverTab] = useState<'gainers' | 'losers' | 'volume'>('gainers');
  const visibleKeyRef = useRef<string | null>(null);
  const visibleSymbolsRef = useRef<string[]>([]);

  const PAGE_SIZE = 15;

  useEffect(() => {
    dispatch(fetchQuotes(60));
    dispatch(fetchAllQuotes());
  }, [dispatch]);

  const merged = useMemo(() => {
    if (!allQuotes.length) return quotes;
    const live = new Map(quotes.map((q) => [q.symbol, q]));
    return allQuotes.map((q) => live.get(q.symbol) ?? liveDetail[q.symbol] ?? q);
  }, [quotes, allQuotes, liveDetail]);

  const visible = useMemo(() => {
    let list = merged;
    if (tab === 'nifty') {
      const liveSymbols = new Set(quotes.map((q) => q.symbol));
      list = list.filter((q) => liveSymbols.has(q.symbol));
    } else if (tab === 'gainers') {
      list = list.filter((q) => (q.changePct ?? 0) > 0);
    } else if (tab === 'volume') {
      list = [...list].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 30);
    }
    const q = query.trim().toUpperCase();
    if (q) {
      list = list.filter((item) => item.symbol.toUpperCase().includes(q) || (item.name && item.name.toUpperCase().includes(q)));
    }
    const { key, dir } = sort;
    return [...list].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return av.localeCompare(bv) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  }, [merged, quotes, tab, query, sort]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paginatedQuotes = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, page]);

  const pageSymbols = useMemo(() => paginatedQuotes.map((q) => q.symbol).filter(Boolean), [paginatedQuotes]);

  useEffect(() => {
    visibleSymbolsRef.current = pageSymbols;
    const key = pageSymbols.join(',');
    if (key !== visibleKeyRef.current && pageSymbols.length) {
      visibleKeyRef.current = key;
      dispatch(fetchLiveBySymbols(pageSymbols));
    }
  }, [pageSymbols, dispatch]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (visibleSymbolsRef.current.length) {
        dispatch(fetchLiveBySymbols(visibleSymbolsRef.current));
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const breadth = useMemo(() => {
    const withChange = merged.filter((q) => q.changePct != null);
    const advancing = withChange.filter((q) => (q.changePct ?? 0) > 0).length;
    const declining = withChange.filter((q) => (q.changePct ?? 0) < 0).length;
    const unchanged = withChange.filter((q) => (q.changePct ?? 0) === 0).length;
    const total = withChange.length;
    const advVol = withChange.reduce((acc, q) => ((q.changePct ?? 0) > 0 ? acc + (q.volume ?? 0) : acc), 0);
    const decVol = withChange.reduce((acc, q) => ((q.changePct ?? 0) < 0 ? acc + (q.volume ?? 0) : acc), 0);
    const advPct = total ? Math.round((advancing / total) * 100) : 0;
    return { advancing, declining, unchanged, total, advVol, decVol, advPct };
  }, [merged]);

  const movers = useMemo(() => {
    const valid = merged.filter((q) => q.changePct != null);
    const gainers = (top?.gainers && top.gainers.length ? top.gainers : [...valid].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))).slice(0, 5);
    const losers = (top?.losers && top.losers.length ? top.losers : [...valid].sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))).slice(0, 5);
    const active = (top?.mostActive && top.mostActive.length ? top.mostActive : [...merged].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))).slice(0, 5);
    return { gainers, losers, active };
  }, [merged, top]);

  // Sector Heatmap Calculation
  const sectorHeat = useMemo(() => {
    const map: Record<string, { totalPct: number; count: number; icon: string }> = {};
    merged.forEach((q) => {
      const meta = SECTOR_MAP[q.symbol] ?? { sector: 'Others', icon: '📊' };
      if (!map[meta.sector]) {
        map[meta.sector] = { totalPct: 0, count: 0, icon: meta.icon };
      }
      map[meta.sector].totalPct += (q.changePct || 0);
      map[meta.sector].count += 1;
    });

    return Object.entries(map).map(([name, data]) => ({
      name,
      icon: data.icon,
      avgPct: data.count > 0 ? data.totalPct / data.count : 0,
      count: data.count,
    })).sort((a, b) => b.avgPct - a.avgPct);
  }, [merged]);

  const onSort = (k: SortKey) => {
    setSort((prev) => (prev.key === k ? { key: k, dir: prev.dir === 1 ? -1 : 1 } : { key: k, dir: -1 }));
  };

  return (
    <div className="space-y-4">
      {/* ── 1. PROFESSIONAL TRADING FLOOR TERMINAL HEADER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] p-5 sm:p-6 text-white border border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10.5px] font-mono font-medium tracking-wider mb-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              NSE LIVE CASH MARKET · REAL-TIME STREAMING
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white flex items-center gap-3 leading-snug">
              Market Intelligence Terminal
            </h1>
            <p className="mt-0.5 text-xs text-slate-300 font-normal">
              Live quotes, benchmark indices, sector heat flow, and real-time advance-decline volume breadth.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lastUpdated ? (
              <span className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono font-semibold text-slate-300">
                Tick: {formatTimeAgo(lastUpdated).toUpperCase()}
              </span>
            ) : null}
            <Link
              to="/radar"
              className="px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-md hover:bg-slate-100 transition-all"
            >
              ⚡ Radar Lens
            </Link>
            <button
              onClick={() => setChatOpen(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-xs font-bold shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>🐼</span> Ask TradePanda AI
            </button>
          </div>
        </div>

        {/* ── 2. BENCHMARK INDICES TERMINAL CARDS WITH MINI RANGE BARS ── */}
        <div className="relative z-10 pt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {indices.map((idx) => {
            const up = (idx.changePct ?? 0) >= 0;
            return (
              <div
                key={idx.symbol}
                className="p-3 sm:p-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md transition-all hover:border-blue-400/40"
              >
                <div className="flex items-center justify-between text-[9px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  <span className="truncate">{INDEX_NAMES[idx.symbol] ?? idx.symbol}</span>
                  <span className="text-[8px] sm:text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-slate-300 shrink-0">NSE</span>
                </div>
                <div className="font-mono text-lg sm:text-2xl font-bold text-white truncate">
                  {idx.level != null ? formatNumber(idx.level) : '—'}
                </div>
                <div className="mt-1.5 flex items-center justify-between flex-wrap gap-1">
                  <span className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-md font-mono text-[10px] sm:text-xs font-bold ${
                    up ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {up ? '▲' : '▼'} {formatPct(idx.changePct)}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-mono text-slate-400">
                    {idx.change != null ? (idx.change > 0 ? `+${idx.change.toFixed(2)}` : idx.change.toFixed(2)) : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold">
          {error}
        </div>
      ) : null}

      {/* ── 3. SECTOR HEATMAP FLOW MATRIX ── */}
      <Card
        title="Live Sector Performance Matrix"
        action={<span className="text-xs font-mono text-slate-500">Real-time Sector Breadth</span>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 pt-1">
          {sectorHeat.map((sec) => {
            const isPos = sec.avgPct >= 0;
            return (
              <div
                key={sec.name}
                className={`p-3 rounded-2xl border text-center transition-all hover:scale-105 cursor-default ${
                  isPos
                    ? 'bg-emerald-50/60 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                    : 'bg-rose-50/60 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                }`}
              >
                <div className="text-lg mb-0.5">{sec.icon}</div>
                <div className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">{sec.name}</div>
                <div className={`font-mono text-xs font-black mt-1 ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {isPos ? '+' : ''}{sec.avgPct.toFixed(2)}%
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── 4. MARKET BREADTH & REALTIME MOVERS BENTO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Market Breadth Speedometer (6 Cols) */}
        <div className="lg:col-span-6 rounded-3xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-6 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
              Live Market Breadth &amp; Flow
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-mono font-bold">
              {breadth.advPct}% Advancing
            </span>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-emerald-600 dark:text-emerald-400">▲ {breadth.advancing} Advancing</span>
              <span className="text-slate-500 dark:text-slate-400">• {breadth.unchanged} Flat</span>
              <span className="text-rose-600 dark:text-rose-400">▼ {breadth.declining} Declining</span>
            </div>

            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-black/40 border border-slate-300 dark:border-white/5 flex">
              <div className="bg-emerald-500 transition-all duration-500 shadow-sm" style={{ flex: breadth.advancing || 1 }} />
              <div className="bg-slate-400 dark:bg-slate-600 transition-all duration-500" style={{ flex: breadth.unchanged || 0 }} />
              <div className="bg-rose-500 transition-all duration-500 shadow-sm" style={{ flex: breadth.declining || 1 }} />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Advancing Volume</span>
                <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm mt-0.5 block">{formatCompact(breadth.advVol)}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Declining Volume</span>
                <span className="font-black text-rose-600 dark:text-rose-400 text-sm mt-0.5 block">{formatCompact(breadth.decVol)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Movers Studio (6 Cols) */}
        <div className="lg:col-span-6 rounded-3xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-6 shadow-sm dark:shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
              Market Movers Studio
            </h3>

            {/* Movers Switcher */}
            <div className="flex items-center rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 p-1">
              <button
                type="button"
                onClick={() => setMoverTab('gainers')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  moverTab === 'gainers' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Gainers
              </button>
              <button
                type="button"
                onClick={() => setMoverTab('losers')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  moverTab === 'losers' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Losers
              </button>
              <button
                type="button"
                onClick={() => setMoverTab('volume')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  moverTab === 'volume' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Active
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {(moverTab === 'gainers' ? movers.gainers : moverTab === 'losers' ? movers.losers : movers.active).map((q, idx) => {
              const isPos = (q.changePct ?? 0) >= 0;
              return (
                <Link
                  key={q.symbol}
                  to={`/ai-picks?symbol=${q.symbol}`}
                  className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-white/[0.03] border border-transparent hover:border-slate-200 dark:hover:border-[#1c2541] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-400">#{idx + 1}</span>
                    <div>
                      <strong className="text-xs font-black text-slate-900 dark:text-white">{q.symbol}</strong>
                      <span className="text-[10px] text-slate-400 font-mono ml-2">{q.lastPrice != null ? formatCurrency(q.lastPrice) : ''}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <MiniSparkline isUp={isPos} />
                    <span className={`px-2 py-0.5 rounded-md font-mono text-xs font-extrabold ${
                      isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30'
                    }`}>
                      {formatPct(q.changePct)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 5. LIVE EQUITIES WATCH TERMINAL TABLE ── */}
      <Card
        title="Live Equities Watch Terminal"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-black/30 p-1">
              <button
                type="button"
                onClick={() => { setTab('nifty'); setPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  tab === 'nifty'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                NIFTY 50
              </button>
              <button
                type="button"
                onClick={() => { setTab('all'); setPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  tab === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Equities{allQuotes.length ? ` (${allQuotes.length})` : ''}
              </button>
              <button
                type="button"
                onClick={() => { setTab('gainers'); setPage(1); }}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  tab === 'gainers'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                🟢 Gainers
              </button>
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search symbol or company..."
              className="w-48 sm:w-60 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/40 px-3.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors uppercase font-mono"
            />
          </div>
        }
      >
        <div className="w-full rounded-2xl border border-slate-200 dark:border-[#1c2541] mt-2 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-[#070d1e]/80 text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <SortHeader label="Symbol" k="symbol" sort={sort} onSort={onSort} />
                <SortHeader label="Company Name" k="name" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                <SortHeader label="LTP" k="lastPrice" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Change" k="change" sort={sort} onSort={onSort} align="right" className="hidden lg:table-cell" />
                <SortHeader label="Trend" k="changePct" sort={sort} onSort={onSort} align="right" className="hidden sm:table-cell" />
                <SortHeader label="Chg %" k="changePct" sort={sort} onSort={onSort} align="right" />
                <SortHeader label="Volume" k="volume" sort={sort} onSort={onSort} align="right" className="hidden md:table-cell" />
                <th className="px-2.5 sm:px-4 py-3.5 text-right">Radar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
              {paginatedQuotes.map((q) => {
                const isPos = (q.changePct ?? 0) >= 0;
                const sectorMeta = SECTOR_MAP[q.symbol] ?? { sector: 'Equity', icon: '📈' };
                return (
                  <tr key={q.symbol} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-2.5 sm:px-4 py-3">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <span className="text-sm shrink-0">{sectorMeta.icon}</span>
                        <div className="truncate">
                          <Link to={`/ai-picks?symbol=${q.symbol}`} className="font-extrabold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                            {q.symbol}
                          </Link>
                          <span className="text-[9.5px] sm:text-[10px] text-slate-400 font-mono block truncate">{sectorMeta.sector}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                      {q.name || 'NSE Listed Equity'}
                    </td>
                    <td className="px-2.5 sm:px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {q.lastPrice != null ? formatCurrency(q.lastPrice) : '—'}
                    </td>
                    <td className={`hidden lg:table-cell px-4 py-3 text-right font-mono font-semibold ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {q.change != null ? (q.change > 0 ? `+${q.change.toFixed(2)}` : q.change.toFixed(2)) : '—'}
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right">
                      <div className="flex justify-end">
                        <MiniSparkline isUp={isPos} />
                      </div>
                    </td>
                    <td className="px-2.5 sm:px-4 py-3 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-md font-mono text-[10px] sm:text-[11px] font-extrabold ${
                        isPos ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30' : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30'
                      }`}>
                        {formatPct(q.changePct)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell px-4 py-3 text-right font-mono text-slate-500 dark:text-slate-400">
                      {q.volume != null ? formatCompact(q.volume) : '—'}
                    </td>
                    <td className="px-2 sm:px-4 py-3 text-right">
                      <Link
                        to={`/ai-picks?symbol=${q.symbol}`}
                        className="px-2 sm:px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-white/5 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white font-bold text-xs transition-colors"
                      >
                        AI
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4">
            <PaginationBar page={page} totalPages={totalPages} onPage={setPage} />
          </div>
        )}
      </Card>

      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
