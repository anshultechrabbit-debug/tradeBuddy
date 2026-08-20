import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { analyzeMany, analyzeSymbol, searchSymbols, suggestMarket } from '../store/aiSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchAllQuotes } from '../store/marketSlice';
import { Card, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatTimeAgo } from '../lib/format';
import { CandleChart } from '../components/CandleChart';
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
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const tone = signalTone(signal);
  const color = tone === 'buy' ? '#00a34d' : tone === 'avoid' ? '#e3452f' : '#f59e0b';
  return (
    <div className="sg-gauge">
      <svg viewBox="0 0 110 110" width="110" height="110">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#eef0f2" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <div className="sg-gauge-text">
        <span className="sg-gauge-value">{value}</span>
        <span className="sg-gauge-sub">/100</span>
      </div>
    </div>
  );
}

function FactorRow({ factor, score, reason }: { factor: (typeof FACTORS)[number]; score: number; reason: string }) {
  const tone = score >= 65 ? 'sg-good' : score <= 40 ? 'sg-bad' : '';
  return (
    <div className="sg-factor">
      <div className="sg-factor-top">
        <span className="sg-factor-label">
          {factor.icon} {factor.label}
        </span>
        <span className={`sg-factor-score ${tone}`}>{score}/100</span>
      </div>
      <div className="sg-factor-bar">
        <div className={`sg-factor-fill ${tone}`} style={{ width: `${score}%` }} />
      </div>
      <p className="sg-factor-reason">{reason || 'Reason unavailable.'}</p>
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

  useEffect(() => {
    dispatch(fetchWatchlist());
    dispatch(fetchLatestScan());
    dispatch(fetchAllQuotes());
    const timer = setInterval(() => dispatch(fetchAllQuotes()), 60000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const defaultSymbols = useMemo(() => {
    const symbols: string[] = [];
    const push = (s: string) => {
      const u = s.trim().toUpperCase();
      if (u && !symbols.includes(u)) symbols.push(u);
    };
    scanResult?.opportunities.slice(0, 10).forEach((o) => push(o.symbol));
    watchlist?.items.slice(0, 10).forEach((i) => push(i.symbol));
    // No watchlist or scan data? Fall back to today's top market movers so
    // the page still suggests stocks even when the user didn't search.
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

  // Real-time refresh: news and market shift constantly, so re-score every 2s.
  useEffect(() => {
    if (!picks.length || analyzing) return;
    const timer = setInterval(() => {
      dispatch(analyzeMany(picks.map((p) => p.symbol)));
    }, 2000);
    return () => clearInterval(timer);
  }, [picks, analyzing, dispatch]);

  // Debounced live symbol search (as you type).
  useEffect(() => {
    if (!symbolInput.trim()) {
      dispatch(searchSymbols(''));
      return;
    }
    const timer = setTimeout(() => dispatch(searchSymbols(symbolInput)), 250);
    return () => clearTimeout(timer);
  }, [symbolInput, dispatch]);

  const searchedPick = searched ? picks.find((p) => p.symbol === searched) ?? null : null;
  const active = searched ? searchedPick : picks.find((p) => p.symbol === selected) ?? picks[0] ?? null;

  const onAnalyze = (symbol?: string) => {
    const target = (symbol ?? symbolInput).trim().toUpperCase();
    if (!target) return;
    setSearched(target);
    dispatch(analyzeSymbol(target));
    setSelected(target);
    setSymbolInput('');
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearched(null);
    setSelected(null);
  };

  const onSelectSuggestion = (s: { symbol: string }) => onAnalyze(s.symbol);

  const onRefresh = () => {
    const targets = picks.length ? picks.map((p) => p.symbol) : defaultSymbols;
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
  const toneClass = tone === 'buy' ? 'sg-badge-buy' : tone === 'avoid' ? 'sg-badge-avoid' : 'sg-badge-watch';
  const changeUp = active?.quote?.changePct != null && active.quote.changePct >= 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>AI Picks</h1>
          <p className="muted">Algorithmic research on live market data + news — every score explained</p>
        </div>
        <div className="sg-header-right">
          <span className="sg-live-badge">
            <span className="sg-live-dot" />
            Auto-refresh · updated {lastUpdated ? formatTimeAgo(lastUpdated) : '—'}
          </span>
          <div className="sg-suggest-control">
            <span className="sg-suggest-label">Suggest from market:</span>
            <input
              className="sg-suggest-input"
              type="number"
              min={1}
              max={10}
              value={suggestCount}
              onChange={(e) => setSuggestCount(Number(e.target.value))}
              disabled={analyzing}
            />
            <button type="button" className="btn btn-primary" onClick={onSuggestMarket} disabled={analyzing}>
              Suggest
            </button>
          </div>
          <div className="sg-search-row">
            <div className="sg-search-wrap">
              <input
                className="ai-search-input"
                placeholder="Search a symbol, e.g. RELIANCE"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAnalyze();
                  else if (e.key === 'Escape') setShowSuggestions(false);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              />
              {showSuggestions && symbolInput.trim() && (
                <div className="sg-suggestions">
                  {searching && !suggestions.length ? <div className="sg-suggestion-hint">Searching…</div> : null}
                  {suggestions.length ? (
                    suggestions.map((s) => (
                      <button
                        key={s.symbol}
                        type="button"
                        className="sg-suggestion-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectSuggestion(s);
                        }}
                      >
                        <span className="strong">{s.symbol}</span>
                        <span className="muted small">{s.name ?? s.sector ?? 'NSE stock'}</span>
                      </button>
                    ))
                  ) : searching ? null : (
                    <div className="sg-suggestion-hint">No matches — press Enter to try anyway</div>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-primary" onClick={() => onAnalyze()} disabled={!symbolInput.trim()}>
              Analyze
            </button>
            <button type="button" className="btn btn-outline" onClick={onRefresh} disabled={analyzing}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {error ? <ErrorBox message={error} /> : null}

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
          <Spinner label="Running 7-factor AI analysis on live data…" />
        ) : (
          <EmptyState
            title="No AI analysis yet"
            hint={
              defaultSymbols.length
                ? 'Type a symbol above and hit Analyze'
                : 'Run a scan on the Radar page to find your top pick — or type a symbol above'
            }
          />
        )
      ) : active ? (
        <>
          {searched ? (
            <div className="sg-search-view-head">
              <span className="sg-live-badge">
                <span className="sg-live-dot" />
                Focusing on {searched} — live every 2s
              </span>
              <button type="button" className="btn btn-outline btn-sm" onClick={clearSearch}>
                ← Show all picks
              </button>
            </div>
          ) : (
            <div className="sg-stock-bar">
              {picks.map((p, i) => {
                const t = signalTone(p.finalSignal);
                const cls = t === 'buy' ? 'sg-badge-buy' : t === 'avoid' ? 'sg-badge-avoid' : 'sg-badge-watch';
                return (
                  <button
                    key={p.symbol}
                    type="button"
                    className={`sg-stock-chip${p.symbol === active.symbol ? ' active' : ''}`}
                    onClick={() => setSelected(p.symbol)}
                  >
                    <span className="sg-rank">{i + 1}</span>
                    {i === 0 ? <span className="sg-top-badge">TOP PICK</span> : null}
                    <span className="strong">{p.symbol}</span>
                    <span className={`sg-chip-badge ${cls}`}>{p.finalSignal}</span>
                    <span className="sg-chip-score">{p.overallScore}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="sg-hero">
            <div className="sg-hero-chart">
              <CandleChart symbol={active.symbol} livePrice={active.quote?.lastPrice} lastUpdated={active.dataTimestamp} />
            </div>
            <div className="sg-hero-panel">
              <div className="sg-symbol-row">
                <div>
                  <div className="sg-symbol">
                    <Link to={`/radar/${active.symbol}`}>{active.symbol}</Link>
                    {active.symbol === picks[0]?.symbol ? <span className="sg-top-badge sg-top-hero">TOP PICK</span> : null}
                  </div>
                  <div className="muted small">{active.companyName}</div>
                </div>
                <ScoreGauge value={active.overallScore} signal={active.finalSignal} />
              </div>

              <div className="sg-price-row">
                <div className="sg-price">{formatCurrency(active.quote?.lastPrice)}</div>
                {active.quote?.changePct != null ? (
                  <div className={changeUp ? 'sg-change text-positive' : 'sg-change text-negative'}>
                    {formatPct(active.quote.changePct)}
                  </div>
                ) : null}
              </div>

              <div className="sg-badges">
                <span className={`sg-badge-big ${toneClass}`}>{active.finalSignal}</span>
                <span className="sg-badge-small">{active.confidence} confidence</span>
                {active.flags.map((f) => (
                  <span key={f} className="sg-badge-warn">
                    {f}
                  </span>
                ))}
              </div>

              <p className="sg-oneliner">{active.oneLiner}</p>

              <div className="sg-action-box">
                <div className="sg-action-item">
                  <span className="sg-action-label">Entry zone</span>
                  <span className="strong">
                    {formatCurrency(active.entry.zoneLow)} – {formatCurrency(active.entry.zoneHigh)}
                  </span>
                </div>
                <div className="sg-action-item">
                  <span className="sg-action-label">Stop-loss</span>
                  <span className="strong text-negative">{formatCurrency(active.entry.stopLoss)}</span>
                </div>
                <div className="sg-action-item">
                  <span className="sg-action-label">Updated</span>
                  <span className="strong small">{formatTimeAgo(active.dataTimestamp)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2">
            <Card title="Why this signal? — factor breakdown">
              <div className="sg-factors">
                {FACTORS.map((f) => (
                  <FactorRow key={f.key} factor={f} score={active.factorScores[f.key]} reason={active.reasons[f.key]} />
                ))}
              </div>
            </Card>

            <div>
              <Card title="Action plan">
                <div className="sg-plan">
                  <div className="sg-plan-row">
                    <span className="muted small">Entry</span>
                    <span className="strong">
                      {formatCurrency(active.entry.zoneLow)} – {formatCurrency(active.entry.zoneHigh)}
                    </span>
                  </div>
                  <div className="sg-plan-row">
                    <span className="muted small">Stop-loss</span>
                    <span className="strong text-negative">{formatCurrency(active.entry.stopLoss)}</span>
                  </div>
                  <div className="sg-plan-row">
                    <span className="muted small">Support (buy zone floor)</span>
                    <span className="strong">{formatCurrency(active.technical.primarySupport)}</span>
                  </div>
                  <div className="sg-plan-row">
                    <span className="muted small">Resistance (sell ceiling)</span>
                    <span className="strong">{formatCurrency(active.technical.primaryResistance)}</span>
                  </div>
                  <div className="sg-plan-row">
                    <span className="muted small">Trend</span>
                    <span className="strong">{active.technical.trend}</span>
                  </div>
                  <div className="sg-plan-row">
                    <span className="muted small">Buying pressure</span>
                    <span className="strong">{active.technical.rsi?.toFixed(1) ?? '—'}/100</span>
                  </div>
                  <p className="sg-plan-reason muted small">{active.entry.note || active.entry.reason}</p>
                </div>
              </Card>

              <Card title="Key factors">
                <div className="sg-keyfactors">
                  {active.positiveFactors.map((f) => (
                    <div key={f} className="sg-kf sg-kf-good">
                      ▲ {f}
                    </div>
                  ))}
                  {active.negativeFactors.map((f) => (
                    <div key={f} className="sg-kf sg-kf-bad">
                      ▼ {f}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>

          <Card title="News">
            <div className="sg-news-head">
              <div>
                <span className="sg-news-sent">{active.news.overall} sentiment</span>
                <span className="muted small"> · score {active.news.sentimentScore}/100</span>
              </div>
              <div className="sg-news-counts">
                <span className="text-positive">{active.news.positive} positive</span>
                <span className="muted">{active.news.neutral} neutral</span>
                <span className="text-negative">{active.news.negative} negative</span>
              </div>
            </div>
            <div className="sg-catalysts">
              {active.news.positiveCatalysts.map((c) => (
                <span key={c} className="sg-cat sg-cat-good">
                  ▲ {c}
                </span>
              ))}
              {active.news.negativeCatalysts.map((c) => (
                <span key={c} className="sg-cat sg-cat-bad">
                  ▼ {c}
                </span>
              ))}
            </div>
            <div className="sg-news-list">
              {active.news.articles.slice(0, 6).map((a, i) => (
                <a key={i} href={a.link} target="_blank" rel="noreferrer" className="sg-news-item">
                  <span className={`sg-news-dot ${a.sentiment === 'positive' ? 'sg-dot-good' : a.sentiment === 'negative' ? 'sg-dot-bad' : 'sg-dot-neut'}`} />
                  <span className="flex-1">{a.title}</span>
                  <span className="muted small">{formatTimeAgo(a.publishedAt)}</span>
                </a>
              ))}
            </div>
            {!active.news.available ? (
              <p className="muted small">News feed unavailable — sentiment scored neutral.</p>
            ) : null}
          </Card>

          {searched ? (
            <div className="sg-back-footer">
              <button type="button" className="btn btn-outline" onClick={clearSearch}>
                ← Back to all picks
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}