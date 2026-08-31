import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { analyzeMany, analyzeSymbol, searchSymbols, suggestMarket } from '../store/aiSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchAllQuotes } from '../store/marketSlice';
import { Card, Spinner, EmptyState, ErrorBox, Badge } from '../components/ui';
import { formatCurrency, formatPct, formatTimeAgo } from '../lib/format';
import { CandleChart } from '../components/CandleChart';
import { isMarketOpen, getMarketStatus } from '../lib/marketHours';
import type { AiAnalysis } from '../lib/types';

function signalTone(signal: string): 'buy' | 'watch' | 'avoid' {
  if (signal.includes('BUY')) return 'buy';
  if (signal.includes('AVOID')) return 'avoid';
  return 'watch';
}

const FACTORS: { key: keyof AiAnalysis['factorScores']; label: string; icon: string }[] = [
  { key: 'technical', label: 'Price action', icon: '📈' },
  { key: 'news', label: 'News', icon: '📰' },
  { key: 'fundamentals', label: 'Company health', icon: '💰' },
  { key: 'valuation', label: 'Price vs value', icon: '💵' },
  { key: 'market', label: 'Market mood', icon: '📊' },
  { key: 'risk', label: 'Safety', icon: '🛡️' },
];

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
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-5 sm:p-6 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[10.5px] font-mono font-bold tracking-wider mb-1.5">
              {isMarketOpen() ? (
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
              {isMarketOpen()
                ? 'Algorithmic research on live Nifty data + news catalyst scoring — every factor explained.'
                : 'Showing latest verified EOD session data & quantitative factor analysis (NSE/BSE Closed).'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 ${isMarketOpen()
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
              : 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
              }`}>
              <span className={`w-2 h-2 rounded-full ${isMarketOpen() ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              {isMarketOpen() ? 'MARKET OPEN' : 'MARKET CLOSED'}
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
                  const isBuy = tone === 'buy' || active.finalSignal === 'BUY' || active.finalSignal === 'STRONG BUY';
                  const isAvoid = tone === 'avoid' || active.finalSignal === 'AVOID';
                  const curPrice = active.quote?.lastPrice ?? active.price ?? 0;
                  const bearVal = active.engine?.closingRange?.bear ?? active.morningBaseline?.bearCase;
                  const bullVal = active.engine?.closingRange?.bull ?? active.morningBaseline?.bullCase;
                  const baseVal = active.engine?.closingRange?.base ?? active.morningBaseline?.baseCase ?? active.expectedClose;

                  let displayTarget = baseVal;
                  let displayTargetPct = 0;
                  let targetLabel = 'Target';
                  let badgeBg = 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/40';
                  let badgeText = 'text-emerald-700 dark:text-emerald-400';
                  let valueColor = 'text-emerald-600 dark:text-emerald-400';

                  if (isBuy) {
                    displayTarget = bullVal ?? (curPrice > 0 ? curPrice * 1.025 : baseVal);
                    displayTargetPct = curPrice > 0 && displayTarget ? ((displayTarget - curPrice) / curPrice) * 100 : 2.5;
                    targetLabel = 'Upside Target';
                  } else if (isAvoid) {
                    displayTarget = bearVal ?? (curPrice > 0 ? curPrice * 0.975 : baseVal);
                    displayTargetPct = curPrice > 0 && displayTarget ? ((displayTarget - curPrice) / curPrice) * 100 : -2.5;
                    targetLabel = 'Risk Floor';
                    badgeBg = 'bg-rose-50/70 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/40';
                    badgeText = 'text-rose-700 dark:text-rose-400';
                    valueColor = 'text-rose-600 dark:text-rose-400';
                  } else {
                    displayTarget = baseVal ?? curPrice;
                    displayTargetPct = curPrice > 0 && displayTarget ? ((displayTarget - curPrice) / curPrice) * 100 : 0;
                    targetLabel = 'Base Target';
                    badgeBg = 'bg-blue-50/70 dark:bg-blue-950/25 border-blue-200 dark:border-blue-800/40';
                    badgeText = 'text-blue-700 dark:text-blue-400';
                    valueColor = 'text-blue-600 dark:text-blue-400';
                  }

                  if (isBuy) {
                    const targetHigh = bullVal ?? (curPrice > 0 ? curPrice * 1.025 : baseVal);
                    const targetLow = baseVal ?? (curPrice > 0 ? curPrice * 1.008 : targetHigh);
                    const gainPct = curPrice > 0 && targetHigh ? ((targetHigh - curPrice) / curPrice) * 100 : 1.5;

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
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Projected High Target</div>
                          <div className="font-mono text-xl font-black text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(targetHigh)}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-emerald-200/60 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400">Expected High Range:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatCurrency(targetLow)} — {formatCurrency(targetHigh)}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  if (isAvoid) {
                    const targetLow = bearVal ?? (curPrice > 0 ? curPrice * 0.975 : baseVal);
                    const targetHigh = baseVal ?? (curPrice > 0 ? curPrice * 0.992 : targetLow);
                    const lossPct = curPrice > 0 && targetLow ? ((targetLow - curPrice) / curPrice) * 100 : -2.5;

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
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400">Projected Low Target</div>
                          <div className="font-mono text-xl font-black text-rose-600 dark:text-rose-400">
                            {formatCurrency(targetLow)}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-rose-200/60 dark:border-white/10 flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-500 dark:text-slate-400">Expected Drop Range:</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {formatCurrency(targetLow)} — {formatCurrency(targetHigh)}
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

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/30 border border-amber-200/60 dark:border-white/10">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Resistance Ceiling</div>
                          <div className="font-mono text-sm font-black text-slate-900 dark:text-white">
                            {bullVal != null ? formatCurrency(bullVal) : '—'}
                          </div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-white/70 dark:bg-black/30 border border-amber-200/60 dark:border-white/10">
                          <div className="text-[10px] uppercase font-bold text-slate-400">Support Floor</div>
                          <div className="font-mono text-sm font-black text-slate-900 dark:text-white">
                            {bearVal != null ? formatCurrency(bearVal) : '—'}
                          </div>
                        </div>
                      </div>

                      <div className="pt-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                        Price is consolidating inside this channel. Wait for a breakout before taking action.
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

          {/* ── MORNING BASELINE FORECAST (LOCKED TARGET) ── */}
          {active.morningBaseline && (
            <div className="p-5 rounded-3xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">📌</span>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white">Morning Baseline Forecast (Locked Target)</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono ${active.morningBaseline.trajectoryStatus === 'ON_TRACK'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/50'
                  : active.morningBaseline.trajectoryStatus === 'INVALIDATED'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-800/50'
                    : active.morningBaseline.trajectoryStatus === 'PULLBACK'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-800/50'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-800/50'
                  }`}>
                  {active.morningBaseline.trajectoryStatus === 'ON_TRACK'
                    ? '🟢 ON TRACK'
                    : active.morningBaseline.trajectoryStatus === 'INVALIDATED'
                      ? '🔴 THESIS INVALIDATED'
                      : active.morningBaseline.trajectoryStatus === 'PULLBACK'
                        ? '🟡 PULLBACK'
                        : '🔵 NEUTRAL RANGE'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Morning Outlook</span>
                  <div className="font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                    {active.morningBaseline.directionalOutlook} (recorded at {formatCurrency(active.morningBaseline.predictionPrice)})
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Expected Closing Range</span>
                  <div className="font-mono font-bold text-xs text-slate-900 dark:text-white mt-0.5">
                    {active.morningBaseline.bearCase != null && active.morningBaseline.bullCase != null
                      ? `${formatCurrency(active.morningBaseline.bearCase)} – ${formatCurrency(active.morningBaseline.bullCase)}`
                      : 'n/a'}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-white dark:bg-black/30 border border-slate-200 dark:border-white/5">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Invalidation Level</span>
                  <div className="font-mono font-bold text-xs text-rose-500 dark:text-rose-400 mt-0.5">
                    {active.morningBaseline.invalidationPrice != null ? formatCurrency(active.morningBaseline.invalidationPrice) : 'n/a'}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 font-light leading-relaxed">
                {active.morningBaseline.trajectoryReason}. Official EOD evaluation at 15:30 IST is judged against this locked morning target.
              </p>
            </div>
          )}

          {/* ── ACTION PLAN & KEY FACTORS BENTO ── */}
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
                    <span className="font-bold text-xs text-slate-900 dark:text-white uppercase">{active.news.overall} sentiment</span>
                    <span className="text-[10px] text-slate-400 font-mono ml-1">({active.news.sentimentScore}/100)</span>
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