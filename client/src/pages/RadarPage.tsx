import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { runScan, fetchOpportunities, fetchSignals, fetchLatestScan } from '../store/radarSlice';
import { fetchIndices, fetchAllQuotes, fetchBreadth } from '../store/marketSlice';
import { Card, Badge, Spinner, EmptyState, ProgressBar, PaginationBar, ErrorBox, Table } from '../components/ui';
import { formatCurrency, formatPct, formatDateTime, formatTimeAgo, signalBadgeClass, regimeBadgeClass } from '../lib/format';
import { Link } from 'react-router-dom';

function plainSignal(signal: string): string {
  if (signal.includes('BUY ON DIP')) return 'Buy on Dip';
  if (signal.includes('STRONG BUY')) return 'Strong Buy';
  if (signal.includes('BUY')) return 'Buy';
  if (signal.includes('STRONG AVOID')) return 'Strong Avoid';
  if (signal.includes('AVOID')) return 'Avoid';
  return 'Watch';
}

function tone(signal: string): 'buy' | 'watch' | 'avoid' {
  if (signal.includes('BUY')) return 'buy';
  if (signal.includes('AVOID')) return 'avoid';
  return 'watch';
}

function MarketMood({ indices, breadth, regime }: { indices: { symbol: string; level: number; changePct: number }[]; breadth: { advancing: number; declining: number; total: number } | null; regime: string }) {
  return (
    <div className="rd-mood">
      <div className="rd-mood-head">
        <div className="rd-mood-title">
          <span className="rd-mood-dot" />
          Market mood today
          <Badge className={regimeBadgeClass(regime)}>{regime}</Badge>
        </div>
        {breadth ? (
          <span className="muted small">
            {breadth.advancing} advancing · {breadth.declining} declining of {breadth.total}
          </span>
        ) : null}
      </div>
      <div className="rd-index-row">
        {indices.map((ix) => (
          <div key={ix.symbol} className="rd-index-chip">
            <span className="muted small">{ix.symbol}</span>
            <span className="strong">{formatCurrency(ix.level)}</span>
            <span className={ix.changePct >= 0 ? 'text-positive small' : 'text-negative small'}>{formatPct(ix.changePct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadarPage() {
  const dispatch = useAppDispatch();
  const { scanResult, scanning, lastScannedAt, opportunities, signals, loading, error } = useAppSelector((s) => s.radar);
  const { indices, allQuotes, breadth } = useAppSelector((s) => s.market);
  const [oppPage, setOppPage] = useState(1);
  const [sigPage, setSigPage] = useState(1);
  const [gainPage, setGainPage] = useState(1);
  const [losPage, setLosPage] = useState(1);
  const [trendPage, setTrendPage] = useState(1);
  const MOVER_PAGE = 3;
  const TREND_PAGE = 20;

  useEffect(() => {
    dispatch(fetchOpportunities({ page: oppPage, limit: 10 }));
  }, [dispatch, oppPage]);

  useEffect(() => {
    dispatch(fetchSignals({ page: sigPage, limit: 10 }));
  }, [dispatch, sigPage]);

  // Live radar: SSE pushes a fresh scan the moment one completes server-side
  // (background scan now runs at most every 30s, market hours only), so the
  // interval polls below are only a fallback in case a push is missed — not
  // the primary update path. Previously these ran every 2s regardless of SSE,
  // which meant 3 full requests/second per open tab (one of them,
  // fetchAllQuotes, a full-universe DB query) — the main cause of the
  // request flood on this page.
  useEffect(() => {
    dispatch(fetchLatestScan());
    dispatch(fetchIndices());
    dispatch(fetchAllQuotes());
    dispatch(fetchBreadth());
    const timer = setInterval(() => {
      dispatch(fetchLatestScan());
      dispatch(fetchIndices());
    }, 30000);
    const quotesTimer = setInterval(() => dispatch(fetchAllQuotes()), 60000);
    const breadthTimer = setInterval(() => dispatch(fetchBreadth()), 60000);
    return () => {
      clearInterval(timer);
      clearInterval(quotesTimer);
      clearInterval(breadthTimer);
    };
  }, [dispatch]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const source = new EventSource(`/api/stream?channel=radar&token=${encodeURIComponent(token)}`);
    source.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'radar') dispatch(fetchLatestScan());
      } catch {
        // ignore non-JSON frames
      }
    });
    return () => source.close();
  }, [dispatch]);

  function handleScan() {
    dispatch(runScan());
  }

  const gainers = [...allQuotes]
    .filter((q) => q.symbol && q.lastPrice != null && q.changePct != null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const losers = [...allQuotes]
    .filter((q) => q.symbol && q.lastPrice != null && q.changePct != null)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));

  const trending = scanResult?.opportunities ?? [];

  const trendPages = Math.max(1, Math.ceil(trending.length / TREND_PAGE));
  const safeTrendPage = Math.min(trendPage, trendPages);
  const trendSlice = trending.slice((safeTrendPage - 1) * TREND_PAGE, safeTrendPage * TREND_PAGE);

  const gainPages = Math.max(1, Math.ceil(gainers.length / MOVER_PAGE));
  const safeGainPage = Math.min(gainPage, gainPages);
  const gainSlice = gainers.slice((safeGainPage - 1) * MOVER_PAGE, safeGainPage * MOVER_PAGE);

  const losPages = Math.max(1, Math.ceil(losers.length / MOVER_PAGE));
  const safeLosPage = Math.min(losPage, losPages);
  const losSlice = losers.slice((safeLosPage - 1) * MOVER_PAGE, safeLosPage * MOVER_PAGE);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Opportunity Radar</h1>
          <p className="muted">See what the market is doing right now — and which stocks are worth a look</p>
        </div>
        <div className="sg-header-right">
          <span className="sg-live-badge">
            <span className="sg-live-dot" />
            {lastScannedAt ? `scan updated ${formatTimeAgo(lastScannedAt)}` : 'live'}
          </span>
          <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
            {scanning ? <Spinner /> : 'Run Scan'}
          </button>
        </div>
      </header>

      {error ? <ErrorBox message={error} onRetry={handleScan} /> : null}

      {indices.length > 0 ? (
        <MarketMood indices={indices.map((i) => ({ symbol: i.symbol, level: i.level, changePct: i.changePct }))} breadth={breadth} regime={scanResult?.regime ?? 'NEUTRAL'} />
      ) : null}

      <div className="rd-movers-grid">
        <Card title="Top gainers">
          {gainSlice.length ? (
            <div className="rd-mover-list">
              {gainSlice.map((g) => (
                <Link key={g.symbol} to={`/radar/${g.symbol}`} className="rd-mover-row">
                  <span className="strong">{g.symbol}</span>
                  <span className="muted small">{formatCurrency(g.lastPrice)}</span>
                  <span className="text-positive small">{formatPct(g.changePct)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No quotes yet" />
          )}
          <PaginationBar page={safeGainPage} totalPages={gainPages} onPage={setGainPage} />
        </Card>
        <Card title="Top losers">
          {losSlice.length ? (
            <div className="rd-mover-list">
              {losSlice.map((l) => (
                <Link key={l.symbol} to={`/radar/${l.symbol}`} className="rd-mover-row">
                  <span className="strong">{l.symbol}</span>
                  <span className="muted small">{formatCurrency(l.lastPrice)}</span>
                  <span className="text-negative small">{formatPct(l.changePct)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No quotes yet" />
          )}
          <PaginationBar page={safeLosPage} totalPages={losPages} onPage={setLosPage} />
        </Card>
      </div>

      <Card
        title="Trending now"
        action={
          scanResult ? (
<span className="muted small">
            scan #{scanResult.scanId} · {trending.length} stocks
          </span>
        ) : undefined
        }
      >
        {scanning ? (
          <Spinner label="Scanning the market…" />
        ) : trendSlice.length ? (
          <>
            <div className="rd-trend-grid">
              {trendSlice.map((o) => {
                const t = tone(o.signal);
                return (
                  <Link key={o.symbol} to={`/radar/${o.symbol}`} className="rd-trend-card">
                    <div className="rd-trend-head">
                      <span className="strong">{o.symbol}</span>
                      <Badge className={signalBadgeClass(o.signal)}>{plainSignal(o.signal)}</Badge>
                    </div>
                    <div className="rd-trend-price">
                      <span className="strong">{formatCurrency(o.price)}</span>
                      <span className="muted small">· conviction</span>
                    </div>
                    <div className="conviction">
                      <ProgressBar value={o.convictionScore} />
                      <span className="small">{o.convictionScore}/100</span>
                    </div>
                    <p className="rd-trend-why">{o.explanation}</p>
                    <span className={`rd-trend-cta ${t}`}>Why this pick →</span>
                  </Link>
                );
              })}
            </div>
            <PaginationBar page={safeTrendPage} totalPages={trendPages} onPage={setTrendPage} />
          </>
        ) : (
          <EmptyState title="No scan run yet" hint="Click Run Scan to analyze the market" />
        )}
      </Card>

      <Card title="Saved Opportunities">
        {loading ? (
          <Spinner />
        ) : opportunities && opportunities.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Signal', 'Conviction', 'Regime', 'Date']}>
              {opportunities.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/radar/${o.symbol}`} className="strong">
                      {o.symbol}
                    </Link>
                  </td>
                  <td>
                    <Badge className={signalBadgeClass(o.signal)}>{plainSignal(o.signal)}</Badge>
                  </td>
                  <td>{o.convictionScore}</td>
                  <td>{o.regime}</td>
                  <td className="muted small">{formatDateTime(o.createdAt)}</td>
                </tr>
              ))}
            </Table>
            <PaginationBar page={oppPage} totalPages={opportunities.meta.totalPages} onPage={setOppPage} />
          </>
        ) : (
          <EmptyState title="No saved opportunities" />
        )}
      </Card>

      <Card title="Recent Signals">
        {signals && signals.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Signal', 'Conviction', 'Regime', 'Timestamp']}>
              {signals.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link to={`/radar/${s.symbol}`} className="strong">
                      {s.symbol}
                    </Link>
                  </td>
                  <td>
                    <Badge className={signalBadgeClass(s.signal)}>{plainSignal(s.signal)}</Badge>
                  </td>
                  <td>{s.convictionScore}</td>
                  <td>{s.regime}</td>
                  <td className="muted small">{formatDateTime(s.timestamp)}</td>
                </tr>
              ))}
            </Table>
            <PaginationBar page={sigPage} totalPages={signals.meta.totalPages} onPage={setSigPage} />
          </>
        ) : (
          <EmptyState title="No signals yet" />
        )}
      </Card>
    </div>
  );
}