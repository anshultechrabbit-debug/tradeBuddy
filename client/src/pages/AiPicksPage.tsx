import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { analyzeMany, analyzeSymbol, searchSymbols, suggestMarket } from '../store/aiSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchAllQuotes } from '../store/marketSlice';
import { Card, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatTimeAgo } from '../lib/format';
import { CandleChart } from '../components/CandleChart';
import type { AiAnalysis, IntradayPredictionVersion } from '../lib/types';

// Mirrors server/src/services/intradayPredictionTimeline.js's
// INTRADAY_CHECKPOINTS — the fixed schedule every intraday prediction is
// rechecked against. Kept here as a plain display list (not fetched) since
// these exact four times are already a fixed constant referenced throughout
// this app's own UI copy.
const INTRADAY_CHECKPOINTS: { key: 'OPEN' | 'MID_MORNING' | 'EARLY_AFTERNOON' | 'LATE_SESSION'; label: string; minutes: number }[] = [
  { key: 'OPEN', label: '09:20', minutes: 9 * 60 + 20 },
  { key: 'MID_MORNING', label: '11:30', minutes: 11 * 60 + 30 },
  { key: 'EARLY_AFTERNOON', label: '13:15', minutes: 13 * 60 + 15 },
  { key: 'LATE_SESSION', label: '14:30', minutes: 14 * 60 + 30 },
];

function istMinutesOfDay(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0) * 60
    + Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
}

function signalTone(signal: string): 'buy' | 'watch' | 'avoid' {
  if (signal.includes('BUY')) return 'buy';
  if (signal.includes('AVOID')) return 'avoid';
  return 'watch';
}

function formatIstTimestamp(value: string | null | undefined, includeDate = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    ...(includeDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(date) + ' IST';
}

const FACTORS: { key: keyof AiAnalysis['factorScores']; label: string; icon: string }[] = [
  { key: 'technical', label: 'Price action', icon: '📈' },
  { key: 'news', label: 'News', icon: '📰' },
  { key: 'fundamentals', label: 'Company health', icon: '💰' },
  { key: 'valuation', label: 'Price vs value', icon: '💵' },
  { key: 'market', label: 'Market mood', icon: '📊' },
  { key: 'risk', label: 'Safety', icon: '🛡️' },
];

const INTRADAY_TIMELINE_SLOTS = [
  { key: 'OPEN', label: '09:20 am IST' },
  { key: 'MID_MORNING', label: '11:30 am IST' },
  { key: 'EARLY_AFTERNOON', label: '01:15 pm IST' },
  { key: 'LATE_SESSION', label: '02:30 pm IST' },
] as const;

function ScoreGauge({ value, signal }: { value: number; signal: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const tone = signalTone(signal);
  const color = tone === 'buy' ? '#10b981' : tone === 'avoid' ? '#f43f5e' : '#f59e0b';
  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" className="stroke-slate-200 dark:stroke-[#1c2541]" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-xl font-black text-slate-900 dark:text-white leading-none">{value}</span>
        <span className="text-[10px] font-mono text-slate-400">/100</span>
      </div>
    </div>
  );
}

function FactorRow({ factor, score, reason }: { factor: (typeof FACTORS)[number]; score: number | null; reason: string }) {
  if (score == null) {
    return (
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300">{factor.icon} {factor.label}</span>
          <span className="text-[10px] font-mono font-bold text-slate-400">UNKNOWN</span>
        </div>
        <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden" />
        <p className="text-xs text-slate-500 font-light">{reason || 'Data unavailable — not scored.'}</p>
      </div>
    );
  }
  const isGood = score >= 65;
  const isBad = score <= 40;
  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold text-slate-900 dark:text-white">{factor.icon} {factor.label}</span>
        <span className={`font-mono text-xs font-black ${isGood ? 'text-emerald-600 dark:text-emerald-400' : isBad ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
          {score}/100
        </span>
      </div>
      <div className="h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isGood ? 'bg-emerald-500' : isBad ? 'bg-rose-500' : 'bg-amber-500'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400 font-light leading-relaxed">{reason || 'Reason unavailable.'}</p>
    </div>
  );
}

export function AiPicksPage() {
  const dispatch = useAppDispatch();
  const { picks, bySymbol, analyzing, error, lastUpdated, suggestions, searching } = useAppSelector((s) => s.ai);
  // Layout already fetches/polls this from the server's one canonical,
  // holiday-aware market-status source — read it here instead of the old
  // local weekday+clock check, which had no holiday calendar and could show
  // "MARKET OPEN" on an NSE holiday while every prediction on this same page
  // already knows the session is closed.
  const marketOpen = useAppSelector((s) => s.market.status?.isOpen ?? false);
  const { watchlist } = useAppSelector((s) => s.watchlist);
  const { scanResult } = useAppSelector((s) => s.radar);
  const { allQuotes } = useAppSelector((s) => s.market);
  const [symbolInput, setSymbolInput] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searched, setSearched] = useState<string | null>(null);
  const [suggestCount, setSuggestCount] = useState(5);
  const [showWhy, setShowWhy] = useState(false);
  const [timeframeKey, setTimeframeKey] = useState('INTRADAY');

  useEffect(() => {
    dispatch(fetchWatchlist());
    dispatch(fetchLatestScan());
    dispatch(fetchAllQuotes());
    const timer = setInterval(() => dispatch(fetchAllQuotes()), 30000);
    return () => clearInterval(timer);
  }, [dispatch]);



  const [searchParams] = useSearchParams();
  const urlSymbol = searchParams.get('symbol')?.trim().toUpperCase();

  const urlSymbolApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!urlSymbol || urlSymbolApplied.current === urlSymbol) return;
    urlSymbolApplied.current = urlSymbol;
    if (bySymbol[urlSymbol]) {
      setSelected(urlSymbol);
      setSearched(urlSymbol);
    } else {
      dispatch(analyzeSymbol(urlSymbol)).then(() => {
        setSelected(urlSymbol);
        setSearched(urlSymbol);
      });
    }
  }, [urlSymbol, bySymbol, dispatch]);

  const defaultSymbols = useMemo(() => {
    const symbols: string[] = [];
    const push = (s: string) => {
      const u = s.trim().toUpperCase();
      if (u && !symbols.includes(u)) symbols.push(u);
    };
    scanResult?.opportunities.slice(0, 10).forEach((o) => push(o.symbol));
    watchlist?.items.slice(0, 10).forEach((i) => push(i.symbol));
    if (!symbols.length) {
      const movers = [...allQuotes]
        .filter((q) => q.symbol && q.lastPrice != null && q.changePct != null)
        .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
        .slice(0, 8);
      movers.forEach((q) => push(q.symbol));
    }
    return symbols.slice(0, 10);
  }, [watchlist, scanResult, allQuotes]);

  const autoLoaded = useMemo(() => {
    const all = new Set<string>([...Object.keys(bySymbol), ...added]);
    return defaultSymbols.every((s) => all.has(s)) || picks.length > 0;
  }, [defaultSymbols, bySymbol, added, picks]);

  useEffect(() => {
    if (autoLoaded || analyzing) return;
    const missing = defaultSymbols.filter((s) => !bySymbol[s] && !added.includes(s));
    if (missing.length) {
      dispatch(analyzeMany(missing));
      setAdded((prev) => [...prev, ...missing]);
    }
  }, [autoLoaded, defaultSymbols, bySymbol, added, analyzing, dispatch]);

  useEffect(() => {
    if (!picks.length || analyzing) return;
    const timer = setInterval(() => {
      dispatch(analyzeMany(picks.slice(0, 10).map((p) => p.symbol)));
    }, 20000);
    return () => clearInterval(timer);
  }, [picks, analyzing, dispatch]);

  useEffect(() => {
    if (!showWhy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowWhy(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showWhy]);

  useEffect(() => {
    if (!symbolInput.trim()) {
      dispatch(searchSymbols(''));
      return;
    }
    const timer = setTimeout(() => dispatch(searchSymbols(symbolInput)), 250);
    return () => clearTimeout(timer);
  }, [symbolInput, dispatch]);

  const searchedPick = searched ? (bySymbol[searched] ?? picks.find((p) => p.symbol === searched) ?? null) : null;
  const active = searched ? searchedPick : (bySymbol[selected ?? ''] ?? picks.find((p) => p.symbol === selected) ?? picks[0] ?? null);
  const canonicalIntraday = active?.multiTimeframePredictions?.current ?? null;

  const onAnalyze = (symbol?: string) => {
    const target = (symbol ?? symbolInput).trim().toUpperCase();
    if (!target) return;
    setSearched(target);
    setSelected(target);
    dispatch(analyzeSymbol(target));
    setSymbolInput('');
    setShowSuggestions(false);
  };


  const clearSearch = () => {
    setSearched(null);
    setSelected(null);
  };

  const onSelectSuggestion = (s: { symbol: string }) => onAnalyze(s.symbol);

  const onRefresh = () => {
    const targets = (picks.length ? picks.map((p) => p.symbol) : defaultSymbols).slice(0, 10);
    if (!targets.length) return;
    setAdded((prev) => [...prev, ...targets]);
    dispatch(analyzeMany(targets));
  };

  const onSuggestMarket = () => {
    const n = Math.max(1, Math.min(10, Math.round(suggestCount) || 5));
    dispatch(suggestMarket(n));
    setSearched(null);
    setSelected(null);
  };

  const tone = active ? signalTone(active.finalSignal) : 'watch';
  const toneBadge = tone === 'buy' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : tone === 'avoid' ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400';
  const changeUp = active?.quote?.changePct != null && active.quote.changePct >= 0;

  return (
    <div className="space-y-4">
      {/* ── HEADER BANNER ── */}
      {/* overflow-hidden lives on this inner decorative layer, not the
          section itself — the search suggestions dropdown below renders
          past the section's bottom edge, and clipping it there was exactly
          why it never actually became visible even though it was rendering. */}
      <section className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-5 sm:p-6 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[10.5px] font-mono font-bold tracking-wider mb-1.5">
              {marketOpen ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>QUANTILOT 7-FACTOR ENGINE · LIVE</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>QUANTILOT 7-FACTOR ENGINE · MARKET CLOSED (EOD)</span>
                </>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[32px] font-bold tracking-tight text-white leading-snug">
              AI Strategy Picks
            </h1>
            <p className="mt-0.5 text-xs text-slate-300">
              {marketOpen
                ? 'Algorithmic research on live Nifty data + news catalyst scoring — every factor explained.'
                : 'Showing latest verified EOD session data & quantitative factor analysis (NSE/BSE Closed).'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 ${marketOpen
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
              }`}>
              <span className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {marketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-mono font-semibold text-slate-300">
              Updated {lastUpdated ? formatTimeAgo(lastUpdated) : 'EOD'}
            </span>
            <button
              onClick={onRefresh}
              disabled={analyzing}
              className="px-3.5 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-md hover:bg-slate-100 transition-colors cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>
        </div>


        {/* Search & Suggest Controls */}
        <div className="relative z-20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder="Search symbol (e.g. RELIANCE, TCS)..."
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onAnalyze();
                else if (e.key === 'Escape') setShowSuggestions(false);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full px-4 py-2.5 rounded-2xl border border-white/20 bg-black/40 text-xs sm:text-sm text-white placeholder-slate-400 outline-none focus:border-blue-400 font-mono"
            />
            {showSuggestions && symbolInput.trim() && (
              <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-slate-900 border border-[#1c2541] shadow-2xl p-2 z-50">
                {searching && !suggestions.length ? <div className="p-2 text-xs text-slate-400">Searching…</div> : null}
                {suggestions.map((s) => (
                  <button
                    key={s.symbol}
                    type="button"
                    className="w-full p-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-left cursor-pointer"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelectSuggestion(s);
                    }}
                  >
                    <span className="font-bold text-white text-xs">{s.symbol}</span>
                    <span className="text-[10px] text-slate-400">{s.name ?? s.sector ?? 'NSE stock'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-300 font-medium whitespace-nowrap">Suggest Top:</span>
            <input
              type="number"
              min={1}
              max={10}
              value={suggestCount}
              onChange={(e) => setSuggestCount(Number(e.target.value))}
              disabled={analyzing}
              className="w-16 px-2.5 py-1.5 rounded-xl border border-white/20 bg-black/40 text-xs font-mono font-bold text-white text-center outline-none"
            />
            <button
              onClick={onSuggestMarket}
              disabled={analyzing}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-xs shadow-md cursor-pointer"
            >
              Run
            </button>
          </div>
        </div>
      </section>

      {error ? <ErrorBox message={error} /> : null}

      {/* ── SYMBOL SELECTOR CHIPS ── */}
      {picks.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
          {searched && (
            <button
              type="button"
              onClick={clearSearch}
              className="px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors shrink-0 cursor-pointer"
            >
              ← All Picks
            </button>
          )}
          {picks.map((p, i) => {
            const isSel = p.symbol === active?.symbol;
            const t = signalTone(p.finalSignal);
            const badgeCls = t === 'buy' ? 'text-emerald-500 dark:text-emerald-400' : t === 'avoid' ? 'text-rose-500 dark:text-rose-400' : 'text-amber-500 dark:text-amber-400';
            return (
              <button
                key={p.symbol}
                type="button"
                onClick={() => {
                  setSearched(null);
                  setSelected(p.symbol);
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border transition-all shrink-0 cursor-pointer ${isSel
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                  : 'bg-white dark:bg-[#0b132b]/80 border-slate-200 dark:border-[#1c2541] hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
              >
                <span className="text-[10px] font-mono font-bold text-slate-400">#{i + 1}</span>
                <span className="font-black text-xs text-slate-900 dark:text-white">{p.symbol}</span>
                <span className={`text-[10px] font-bold font-mono ${badgeCls}`}>{p.finalSignal}</span>
                <span className="font-mono text-xs font-extrabold text-slate-700 dark:text-slate-300">{p.overallScore}</span>
              </button>
            );
          })}
        </div>
      )}

      {searched && !active ? (
        analyzing ? (
          <Spinner label={`Analyzing ${searched} on live data…`} />
        ) : (
          <EmptyState
            title={`No result for ${searched} yet`}
            hint="The live feed may be busy right now — wait a moment, press Refresh, or pick from the suggestions."
          />
        )
      ) : picks.length === 0 ? (
        analyzing ? (
          <Spinner label="Running 7-factor AI analysis on live market data…" />
        ) : (
          <EmptyState
            title="No AI analysis loaded yet"
            hint="Type a stock ticker symbol above and press Analyze, or run Suggest from Market."
          />
        )
      ) : active ? (
        <div className="space-y-6">
          {/* ── HERO STOCK OVERVIEW BENTO ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card title={`${active.symbol} — Interactive Price Action & Chart`}>
                <div className="h-[360px] w-full">
                  <CandleChart
                    symbol={active.symbol}
                    livePrice={active.quote?.lastPrice}
                    lastUpdated={active.dataTimestamp}
                    dayChangePct={active.quote?.changePct}
                  />
                </div>
              </Card>
            </div>

            <div>
              <Card>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <Link to={`/ai-picks?symbol=${active.symbol}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {active.symbol}
                      </Link>
                      {active.symbol === picks[0]?.symbol && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black bg-blue-600 text-white font-mono">
                          TOP PICK
                        </span>
                      )}
                    </h2>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{active.companyName}</div>
                  </div>
                  <ScoreGauge value={active.overallScore} signal={active.finalSignal} />
                </div>

                <div className="mt-4 flex items-baseline gap-3">
                  <span className="font-mono text-3xl font-black text-slate-900 dark:text-white">
                    {formatCurrency(active.quote?.lastPrice)}
                  </span>
                  {active.quote?.changePct != null && (
                    <span className={`font-mono text-sm font-bold ${changeUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatPct(active.quote.changePct)}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1 rounded-xl border text-xs font-bold font-mono ${toneBadge}`}>
                    {active.finalSignal}
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {active.confidence} confidence
                  </span>
                  {active.flags?.map((f) => (
                    <span key={f} className="px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold font-mono">
                      ⚠️ {f}
                    </span>
                  ))}
                </div>

                <p className="mt-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-light">
                  {active.oneLiner}
                </p>

                {active.intradayPrediction && (
                  <div className="mt-4 rounded-2xl border border-blue-300/70 dark:border-blue-500/30 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          {active.intradayPrediction.current ? '● Current Intraday Prediction' : '● Final Intraday Prediction — Market Closed'}
                        </div>
                        <div className="mt-1 font-mono text-lg font-black text-slate-900 dark:text-white">
                          {canonicalIntraday?.signal ?? active.finalSignal}
                          {' — '}
                          {formatCurrency(canonicalIntraday?.expectedPrice ?? active.engine?.closingRange?.base)}
                        </div>
                        {(canonicalIntraday?.generatedAt ?? active.engine?.generatedAt) && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Generated {formatIstTimestamp(canonicalIntraday?.generatedAt ?? active.engine!.generatedAt, true)}
                            {' · Data checked '}
                            {formatIstTimestamp(canonicalIntraday?.lastUpdatedAt ?? active.engine!.generatedAt, true)}
                          </div>
                        )}
                      </div>
                      <div className="text-right text-[10px] text-slate-500 dark:text-slate-400">
                        <div className="font-bold uppercase">Next scheduled check</div>
                        <div className="font-mono font-black text-blue-600 dark:text-blue-400">{active.intradayPrediction.nextPredictionLabel}</div>
                      </div>
                    </div>

                    {(() => {
                      const cur = canonicalIntraday;
                      if (!cur) return null;
                      // The header above shows latestObservation's predictedClose
                      // when a fresher one exists (a same-version refresh, not a
                      // new checkpoint) — read expectedReturnPct/confidence from
                      // that SAME observation, not the version's older fields, so
                      // this stat grid can never show a percentage that no longer
                      // matches the predictedClose in the header right above it.
                      const expectedReturnPct = cur.expectedReturnPct;
                      const confidence = cur.confidence;
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="p-2 rounded-lg bg-white/70 dark:bg-black/20">
                            <div className="text-[9px] uppercase font-bold text-slate-400">Score</div>
                            <div className="font-mono text-xs font-black text-slate-900 dark:text-white">{cur.score ?? '—'}/100</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 dark:bg-black/20">
                            <div className="text-[9px] uppercase font-bold text-slate-400">Confidence</div>
                            <div className="font-mono text-xs font-black text-slate-900 dark:text-white">{confidence ?? '—'}/100</div>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 dark:bg-black/20">
                            <div className="text-[9px] uppercase font-bold text-slate-400">Expected Return</div>
                            <div className="font-mono text-xs font-black text-slate-900 dark:text-white">
                              {expectedReturnPct != null ? `${expectedReturnPct > 0 ? '+' : ''}${expectedReturnPct.toFixed(2)}%` : '—'}
                            </div>
                          </div>
                          <div className="p-2 rounded-lg bg-white/70 dark:bg-black/20">
                            <div className="text-[9px] uppercase font-bold text-slate-400">Risk/Reward</div>
                            <div className="font-mono text-xs font-black text-slate-900 dark:text-white">{cur.riskReward != null ? `${cur.riskReward.toFixed(1)}x` : '—'}</div>
                          </div>
                          {(cur.confirmationConditions?.length || cur.invalidationConditions?.length) && (
                            <div className="col-span-2 sm:col-span-4 space-y-1 pt-1">
                              {cur.confirmationConditions?.length ? (
                                <div className="text-[10px] text-emerald-700 dark:text-emerald-400">
                                  <span className="font-bold">Confirms if: </span>{cur.confirmationConditions.filter((item) => item.passed === true).map((item) => item.name).join('; ') || 'No confirmation gate currently passes'}
                                </div>
                              ) : null}
                              {cur.invalidationConditions?.length ? (
                                <div className="text-[10px] text-rose-600 dark:text-rose-400">
                                  <span className="font-bold">Invalidated if: </span>{cur.invalidationConditions.join('; ')}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {(() => {
                      // Always show all 4 scheduled checkpoints, not just
                      // whichever ones happened to produce a recorded row —
                      // a quiet day (or a checkpoint the background job
                      // hasn't reached yet) should read as "not checked yet",
                      // not silently vanish from the table.
                      const timeline = active.intradayPrediction!.timeline;
                      const cur = active.intradayPrediction!.current ?? active.intradayPrediction!.latest;
                      // Not every row carries an exact checkpoint tag — the
                      // FIRST prediction of the day is created whenever
                      // anyone/anything first checks the stock, which can
                      // land well after 09:20-09:25's tagging window (e.g.
                      // 10:44am), leaving checkpoint: null even though it's
                      // clearly "the 09:20-era prediction" for display
                      // purposes. Untagged rows fall back to the latest
                      // checkpoint slot at or before their own generatedAt
                      // time, so a real prediction never gets shown as
                      // PENDING just because of when it happened to fire.
                      const assignedCheckpoint = (v: IntradayPredictionVersion): string | null => {
                        if (v.checkpoint) return v.checkpoint;
                        const mins = istMinutesOfDay(v.generatedAt);
                        let assigned: string | null = null;
                        for (const cp of INTRADAY_CHECKPOINTS) {
                          if (mins >= cp.minutes) assigned = cp.key;
                        }
                        return assigned;
                      };
                      const allRows = [...timeline];
                      if (cur && !allRows.some((v) => v.id === cur.id)) allRows.push(cur);
                      allRows.sort((a, b) => new Date(a.generatedAt).getTime() - new Date(b.generatedAt).getTime());
                      const byCheckpoint = new Map<string, IntradayPredictionVersion>();
                      const offSchedule: IntradayPredictionVersion[] = [];
                      for (const v of allRows) {
                        const key = assignedCheckpoint(v);
                        if (key) byCheckpoint.set(key, v); // later rows in the same window win
                        else offSchedule.push(v);
                      }
                      const scheduleRows = INTRADAY_CHECKPOINTS.map((cp) => ({ cp, version: byCheckpoint.get(cp.key) ?? null }));

                      const renderVersionRow = (key: string, timeLabel: string, version: IntradayPredictionVersion) => {
                        // A non-material market refresh updates the current observation without
                        // creating another historical version. Keep old rows immutable, but make
                        // the CURRENT row agree with the headline's latest checked estimate.
                        const observation = version.isCurrent ? version.latestObservation : null;
                        const displayedClose = observation?.predictedClose ?? version.predictedClose;
                        const displayedRange = observation?.targetZone ?? version.targetZone;
                        return (
                          <div
                            key={key}
                            title={version.isCurrent && observation ? `Prediction version created ${formatIstTimestamp(version.generatedAt, true)}; last checked ${formatIstTimestamp(observation.checkedAt, true)}` : `Prediction generated ${formatIstTimestamp(version.generatedAt, true)}`}
                            className="grid grid-cols-[80px_72px_1fr_68px] items-center gap-2 rounded-lg bg-white/70 dark:bg-black/20 px-2 py-1.5 text-[10px]"
                          >
                            <span className="font-mono text-slate-500">{timeLabel}</span>
                            <span className="font-mono font-black text-slate-800 dark:text-slate-200">
                              {displayedClose != null ? `₹${displayedClose.toFixed(2)}` : '—'}
                            </span>
                            <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                              {displayedRange?.[0] != null && displayedRange?.[1] != null
                                ? `₹${displayedRange[0].toFixed(2)} – ₹${displayedRange[1].toFixed(2)}`
                                : 'Range unavailable'}
                            </span>
                            {/* A checkpoint slot that isn't the latest one always reads EXPIRED —
                                its window has passed and a newer checkpoint has superseded it.
                                "UPDATED" (the raw per-version history status) reads confusingly
                                here, as if that PAST row were the one just refreshed. INVALIDATED
                                is kept as its own label since it carries real information (a BUY
                                call broke), not just "time passed". */}
                            <span className={`font-bold text-right ${version.isCurrent ? 'text-blue-600 dark:text-blue-400' : version.status === 'INVALIDATED' ? 'text-rose-600' : 'text-slate-400'}`}>
                              {version.isCurrent ? 'CURRENT' : version.status === 'INVALIDATED' ? 'INVALIDATED' : 'EXPIRED'}
                            </span>
                          </div>
                        );
                      };

                      return (
                        <div>
                          <div className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
                            {active.intradayPrediction!.current ? 'Today’s Prediction Timeline' : 'Today’s Final Prediction Timeline'}
                          </div>
                          <div className="grid grid-cols-[80px_72px_1fr_68px] gap-2 px-2 text-[8px] font-bold uppercase tracking-wider text-slate-400">
                            <span>Time</span><span>Prediction</span><span>Expected range</span><span className="text-right">Status</span>
                          </div>
                          <div className="space-y-1">
                            {scheduleRows.map(({ cp, version }) => version
                              ? renderVersionRow(cp.key, cp.label, version)
                              : (
                                <div
                                  key={cp.key}
                                  title="No prediction has been recorded for this checkpoint yet"
                                  className="grid grid-cols-[80px_72px_1fr_68px] items-center gap-2 rounded-lg bg-slate-100/70 dark:bg-white/[0.03] px-2 py-1.5 text-[10px] opacity-70"
                                >
                                  <span className="font-mono text-slate-400">{cp.label}</span>
                                  <span className="font-mono text-slate-400">—</span>
                                  <span className="font-mono text-slate-400">Not checked yet</span>
                                  <span className="font-bold text-right text-slate-400">PENDING</span>
                                </div>
                              ))}
                            {offSchedule.map((version) => renderVersionRow(version.id, formatIstTimestamp(version.generatedAt), version))}
                          </div>
                          {cur?.reasonForChange?.length ? (
                            <div className="mt-2 text-[10px] text-slate-600 dark:text-slate-300">
                              <span className="font-bold">Why it changed: </span>
                              {cur.reasonForChange.join('; ')}
                            </div>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Plain language note */}
                {active.simpleNote && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[10px] tracking-wider block mb-1">
                      In Plain Language
                    </span>
                    {active.simpleNote}
                  </div>
                )}

                {/* Expected Trading Range & Target */}
                {(() => {
                  // Trading action and price direction are different concepts.
                  // An AVOID can be caused by valuation/data/risk gates while
                  // the same-session price outlook is still NEUTRAL or BULLISH.
                  // Never turn every AVOID into a fabricated "going lower" call.
                  // Read the direction from the SAME frozen snapshot as the
                  // numbers below it (active.engine?.directionalOutlook keeps
                  // recomputing live — post-market it can disagree with the
                  // recorded prediction this card's own numbers come from,
                  // which would show e.g. a green "Going Higher" card around
                  // a number that's actually inside the neutral band).
                  const canonicalSnapshot = active.intradayPrediction?.current ?? active.intradayPrediction?.latest;
                  const outlook = canonicalSnapshot?.expectedDirection ?? active.engine?.directionalOutlook ?? 'NEUTRAL';
                  const isBuy = outlook === 'BULLISH';
                  const isAvoid = outlook === 'BEARISH';
                  // "Current Price" is a live, continuously-updating concept;
                  // the prediction's own move % must NOT be recomputed from
                  // it client-side — that mixes a live price against a
                  // predicted close that was generated against an earlier
                  // snapshot, silently drifting from the server's own
                  // canonical expectedPct as soon as the quote ticks. Always
                  // display the one number the server already computed.
                  const curPrice = active.quote?.lastPrice ?? active.engine?.predictionReferencePrice ?? 0;
                  // Read the SAME recorded/frozen intraday snapshot the
                  // "Latest Prediction" card and Prediction Timeline below
                  // use (active.multiTimeframePredictions.current is built
                  // from that same snapshot server-side). engine.closingRange
                  // keeps recomputing live on every request — its projection
                  // formula behaves differently once the market closes — so
                  // reading it directly here showed a different "predicted
                  // close" than the rest of this same prediction on the page.
                  // Only fall back to the live engine when no snapshot exists
                  // yet (e.g. the very first check of a new session).
                  const mtfCurrent = active.multiTimeframePredictions?.current;
                  const baseVal = mtfCurrent?.expectedPrice ?? active.expectedClose ?? active.engine?.closingRange?.base ?? null;
                  const expectedPct = mtfCurrent?.expectedReturnPct ?? active.expectedPct ?? active.engine?.closingRange?.expectedMovePct ?? null;
                  const bearVal = mtfCurrent?.expectedPriceZone?.[0] ?? active.engine?.closingRange?.bear;
                  const bullVal = mtfCurrent?.expectedPriceZone?.[1] ?? active.engine?.closingRange?.bull;

                  if (isBuy) {
                    const predictedClose = baseVal;
                    const rangeLow = bearVal ?? (curPrice > 0 && predictedClose != null ? curPrice * 0.985 : predictedClose);
                    const rangeHigh = bullVal ?? (curPrice > 0 && predictedClose != null ? curPrice * 1.025 : predictedClose);
                    const gainPct = expectedPct ?? 0;

                    return (
                      <div className="mt-3 p-3.5 rounded-2xl border border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/25 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black uppercase text-[10px] tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                            <span>▲</span> Predicted Move: Going Higher
                          </span>
                          <span className="font-mono text-[11px] font-black text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-md bg-white dark:bg-black/40 border border-emerald-500/30">
                            +{gainPct.toFixed(2)}% Upside
                          </span>
                        </div>

                        <div className="pt-0.5">
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Predicted Closing Price</div>
                          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(predictedClose)}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-emerald-200/60 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400">Uncertainty Range:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatCurrency(rangeLow)} — {formatCurrency(rangeHigh)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (isAvoid) {
                    const predictedClose = baseVal ?? curPrice;
                    const rangeLow = bearVal ?? (curPrice > 0 ? curPrice * 0.975 : predictedClose);
                    const rangeHigh = bullVal ?? (curPrice > 0 ? curPrice * 1.005 : predictedClose);
                    const lossPct = curPrice > 0 && predictedClose ? ((predictedClose - curPrice) / curPrice) * 100 : 0;

                    return (
                      <div className="mt-3 p-3.5 rounded-2xl border border-rose-500/30 bg-rose-50/70 dark:bg-rose-950/25 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-black uppercase text-[10px] tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                            <span>▼</span> Predicted Move: Going Lower
                          </span>
                          <span className="font-mono text-[11px] font-black text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-md bg-white dark:bg-black/40 border border-rose-500/30">
                            {lossPct.toFixed(2)}% Downside
                          </span>
                        </div>

                        <div className="pt-0.5">
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Predicted Closing Price</div>
                          <div className="font-mono text-xl font-black text-rose-600 dark:text-rose-400">
                            {formatCurrency(predictedClose)}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-rose-200/60 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400">Uncertainty Range:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatCurrency(rangeLow)} — {formatCurrency(rangeHigh)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Neutral / Sideways
                  return (
                    <div className="mt-3 p-3.5 rounded-2xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/25 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black uppercase text-[10px] tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <span>↔</span> Predicted Move: Sideways (No Breakout)
                        </span>
                        <span className="font-mono text-[11px] font-black text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md bg-white dark:bg-black/40 border border-amber-500/30">
                          Wait & Watch
                        </span>
                      </div>

                      <div className="pt-0.5">
                        <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Predicted Closing Price</div>
                        <div className="font-mono text-xl font-black text-amber-600 dark:text-amber-400">
                          {baseVal != null ? formatCurrency(baseVal) : '—'}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/30 border border-amber-200/60 dark:border-white/10">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Support Floor</div>
                          <div className="font-mono text-sm font-black text-slate-900 dark:text-white">
                            {bearVal != null ? formatCurrency(bearVal) : '—'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/30 border border-amber-200/60 dark:border-white/10">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Resistance Ceiling</div>
                          <div className="font-mono text-sm font-black text-slate-900 dark:text-white">
                            {bullVal != null ? formatCurrency(bullVal) : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        Price is consolidating inside this channel — the predicted close above is the model's best single estimate; support/resistance are the outer bounds it's unlikely to break.
                      </div>
                    </div>
                  );
                })()}







                {/* Engine prediction */}
                {active.prediction && (
                  <div className="mt-3 p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                    <span className="font-bold text-purple-600 dark:text-purple-400 uppercase text-[10px] tracking-wider block mb-1">
                      🔮 Algorithmic Prediction
                    </span>
                    {active.prediction}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-slate-200/80 dark:border-[#1c2541]">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Entry Zone</div>
                    <div className="font-mono text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                      {formatCurrency(active.entry.zoneLow)} – {formatCurrency(active.entry.zoneHigh)}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Stop Loss</div>
                    <div className="font-mono text-xs font-bold text-rose-500 dark:text-rose-400 mt-0.5">
                      {formatCurrency(active.entry.stopLoss)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowWhy(true)}
                  className="mt-4 w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🧠 Full Factor Breakdown</span>
                  <span>→</span>
                </button>
              </Card>
            </div>
          </div>

          {/* ── ACTION PLAN & KEY FACTORS BENTO ── */}
          {active.multiTimeframePredictions?.horizons?.length ? (() => {
            const horizons = active.multiTimeframePredictions!.horizons;
            const view = horizons.find((item) => item.key === timeframeKey) ?? horizons[0];
            const passed = view.confirmationConditions.filter((item) => item.passed).length;
            return (
              <Card title="Multi-Timeframe Predictions — Separate Models">
                <div className="flex flex-wrap gap-2 mb-4">
                  {horizons.map((item) => (
                    <button type="button" key={item.key} onClick={() => setTimeframeKey(item.key)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${view.key === item.key ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 dark:border-[#1c2541] text-slate-600 dark:text-slate-300 hover:border-blue-400'}`}>
                      {item.timeframe}
                    </button>
                  ))}
                </div>
                {view.summary && (
                  <div className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                    {view.summary}
                  </div>
                )}
                {view.description && (
                  <div className="mb-4 p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/30 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[10px] tracking-wider block mb-1">
                      What does "{view.timeframe}" mean?
                    </span>
                    {view.description}
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-[#1c2541] p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Signal</div>
                    <div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{view.signal}</div>
                    <div className="text-[10px] text-slate-500">{view.horizon}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-[#1c2541] p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Score / Evidence</div>
                    <div className="mt-1 font-mono text-sm font-black">{view.score ?? '—'}/100 · {view.confidence ?? '—'}/100</div>
                    <div className="text-[10px] text-slate-500">{passed}/{view.confirmationConditions.length} confirmations</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-[#1c2541] p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Expected price</div>
                    <div className="mt-1 font-mono text-sm font-black">{formatCurrency(view.expectedPrice)}</div>
                    <div className={`text-[10px] font-bold ${(view.expectedReturnPct ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatPct(view.expectedReturnPct)} expected return</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-[#1c2541] p-3">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Zone / Risk-reward</div>
                    <div className="mt-1 font-mono text-xs font-black">{view.expectedPriceZone ? `${formatCurrency(view.expectedPriceZone[0])} – ${formatCurrency(view.expectedPriceZone[1])}` : 'Unavailable'}</div>
                    <div className="text-[10px] text-slate-500">R/R {view.riskReward?.toFixed(2) ?? '—'}</div>
                  </div>
                </div>
                {view.key === 'INTRADAY' && (
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-950/20 p-3">
                    <div><div className="text-[9px] font-bold uppercase text-slate-400">Raw forecast</div><div className="font-mono text-xs font-black">{formatCurrency(view.rawExpectedPrice)}</div></div>
                    <div><div className="text-[9px] font-bold uppercase text-slate-400">Raw move</div><div className="font-mono text-xs font-black">{formatPct(view.rawExpectedReturnPct)}</div></div>
                    <div><div className="text-[9px] font-bold uppercase text-slate-400">Validated direction</div><div className="text-xs font-black">{view.validatedDirection ?? 'NEUTRAL'}</div></div>
                    <div><div className="text-[9px] font-bold uppercase text-slate-400">Forecast quality</div><div className="text-xs font-black">{view.forecastQuality?.replaceAll('_', ' ') ?? 'UNVALIDATED'}</div></div>
                    <div><div className="text-[9px] font-bold uppercase text-slate-400">Trade decision</div><div className="text-xs font-black">{view.signal}</div></div>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div><div className="font-black uppercase text-emerald-600 mb-2">Supporting factors</div><div className="space-y-1 text-slate-600 dark:text-slate-300">{view.supportingFactors.length ? view.supportingFactors.map((item) => <div key={item}>✓ {item}</div>) : <div>No verified supporting factor</div>}</div></div>
                  <div>
                    <div className="font-black uppercase text-blue-600 mb-2">Confirmations</div>
                    <div className="space-y-1 text-slate-600 dark:text-slate-300">
                      {view.confirmationConditions.map((item) => {
                        // `available === false` is a genuinely missing input
                        // (UNAVAILABLE). A boolean pass/fail gate has no 0-100
                        // score at all — that's a different, valid state, not
                        // "unavailable" — so only show UNAVAILABLE for the
                        // former, never merely because `score` is absent.
                        const icon = item.passed === true ? '✓' : item.available === false ? '—' : item.passed === false ? '✗' : '○';
                        const suffix = item.available === false ? ' UNAVAILABLE' : item.score != null ? ` ${item.score}/100` : '';
                        return <div key={item.name}>{icon} {item.name}{suffix}</div>;
                      })}
                    </div>
                  </div>
                  <div><div className="font-black uppercase text-rose-600 mb-2">Invalidation / missing gates</div><div className="space-y-1 text-slate-600 dark:text-slate-300">{view.invalidationConditions.map((item) => <div key={item}>• {item}</div>)}</div></div>
                </div>
                <div className="mt-4 border-t border-slate-200 dark:border-[#1c2541] pt-3 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
                  <span>Generated {formatIstTimestamp(view.generatedAt, true)} · Updated {formatIstTimestamp(view.lastUpdatedAt, true)}</span>
                  <span>{view.thresholdStatus}</span>
                </div>
                {(view.updateFrequency || view.nextUpdateLabel) && (
                  <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[10px] text-blue-600 dark:text-blue-400">
                    <span>{view.updateFrequency}</span>
                    <span className="font-bold">{view.nextUpdateLabel}</span>
                  </div>
                )}
                <p className="mt-2 text-[10px] text-amber-700 dark:text-amber-300">{view.disclaimer}</p>
              </Card>
            );
          })() : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Detailed Action Plan">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Entry Range</span>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {formatCurrency(active.entry.zoneLow)} – {formatCurrency(active.entry.zoneHigh)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Stop-Loss (Hard Exit)</span>
                  <span className="font-mono font-bold text-xs text-rose-500 dark:text-rose-400">
                    {formatCurrency(active.entry.stopLoss)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Primary Support (Floor)</span>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {formatCurrency(active.technical.primarySupport)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Primary Resistance (Ceiling)</span>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {formatCurrency(active.technical.primaryResistance)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Trend & Buying Pressure</span>
                  <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">
                    {active.technical.trend} · RSI {active.technical.rsi?.toFixed(1) ?? '—'}/100
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-light pt-1">
                  {active.entry.note || active.entry.reason}
                </p>
              </div>
            </Card>

            <Card title="Confluence Factors">
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  ▲ Bullish Drivers & Catalysts
                </div>
                <div className="flex flex-wrap gap-2">
                  {active.positiveFactors?.map((f) => (
                    <span key={f} className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                      ▲ {f}
                    </span>
                  ))}
                </div>

                <div className="pt-2 text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  ▼ Bearish Risks & Friction
                </div>
                <div className="flex flex-wrap gap-2">
                  {active.negativeFactors?.map((f) => (
                    <span key={f} className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs font-medium">
                      ▼ {f}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* ── 7-FACTOR MODEL & NEWS BENTO ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="7-Factor Model Quant Scores">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FACTORS.map((f) => (
                  <FactorRow key={f.key} factor={f} score={active.factorScores[f.key]} reason={active.reasons[f.key]} />
                ))}
              </div>
            </Card>

            <Card title="Live News & Market Catalysts">
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541]">
                  <div>
                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase">
                      {active.news.sentimentScore != null ? `${active.news.overall} sentiment` : 'No recent news'}
                    </span>
                    {active.news.sentimentScore != null && (
                      <span className="text-[10px] text-slate-400 font-mono ml-1">({active.news.sentimentScore}/100)</span>
                    )}
                  </div>
                  <div className="flex gap-2 text-xs font-bold font-mono">
                    <span className="text-emerald-600 dark:text-emerald-400">+{active.news.positive}</span>
                    <span className="text-slate-400">{active.news.neutral}</span>
                    <span className="text-rose-600 dark:text-rose-400">-{active.news.negative}</span>
                  </div>
                </div>

                {/* News Catalysts Tags */}
                {(active.news.positiveCatalysts?.length > 0 || active.news.negativeCatalysts?.length > 0) && (
                  <div className="flex flex-wrap gap-2">
                    {active.news.positiveCatalysts?.map((c) => (
                      <span key={c} className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                        ▲ {c}
                      </span>
                    ))}
                    {active.news.negativeCatalysts?.map((c) => (
                      <span key={c} className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
                        ▼ {c}
                      </span>
                    ))}
                  </div>
                )}

                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {active.news.articles.slice(0, 6).map((a, i) => (
                    <a
                      key={i}
                      href={a.link}
                      target="_blank"
                      rel="noreferrer"
                      className="p-3 rounded-xl bg-slate-50/70 dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 hover:border-blue-500 flex items-start gap-3 transition-colors block"
                    >
                      <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${a.sentiment === 'positive' ? 'bg-emerald-500' : a.sentiment === 'negative' ? 'bg-rose-500' : 'bg-slate-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-200 leading-snug truncate">{a.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{formatTimeAgo(a.publishedAt)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {/* ── WHY MODAL ── */}
      {showWhy && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4" onClick={() => setShowWhy(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0b132b] border border-slate-200 dark:border-[#1c2541] shadow-2xl p-6 sm:p-8 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1c2541] pb-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Factor Breakdown: {active.symbol}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Deep mathematical and fundamental rationale behind the signal</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWhy(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/10 text-xs font-bold text-slate-800 dark:text-white cursor-pointer"
              >
                ✕ Close
              </button>
            </div>

            {active.engineWhy && (
              <div className="space-y-4">
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 font-light leading-relaxed">
                  {active.engineWhy.summary}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30">
                    <h4 className="font-black text-xs text-emerald-800 dark:text-emerald-300 uppercase tracking-wider mb-2">Why You Might Invest</h4>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside font-light">
                      {active.engineWhy.investReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/30">
                    <h4 className="font-black text-xs text-rose-800 dark:text-rose-300 uppercase tracking-wider mb-2">Why It Could Go To A Loss</h4>
                    <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside font-light">
                      {active.engineWhy.lossReasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {FACTORS.map((f) => (
                <FactorRow key={f.key} factor={f} score={active.factorScores[f.key]} reason={active.reasons[f.key]} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
