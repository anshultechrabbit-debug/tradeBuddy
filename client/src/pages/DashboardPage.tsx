import { useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSummary } from '../store/portfolioSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchIndices, fetchBreadth, fetchTopStocks } from '../store/marketSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { analyzeMany } from '../store/aiSlice';
import { Card, StatCard, Badge, ProgressBar, Spinner, EmptyState } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, formatTimeAgo, signalBadgeClass, regimeBadgeClass } from '../lib/format';

function aiSignalClass(signal: string): string {
  if (signal.includes('BUY')) return 'badge badge-buy';
  if (signal.includes('AVOID')) return 'badge badge-avoid';
  return 'badge badge-watch';
}

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { summary } = useAppSelector((s) => s.portfolio);
  const { scanResult, scanning } = useAppSelector((s) => s.radar);
  const { indices, breadth, top: topMovers } = useAppSelector((s) => s.market);
  const { watchlist } = useAppSelector((s) => s.watchlist);
  const { picks, analyzing, lastUpdated } = useAppSelector((s) => s.ai);
  const user = useAppSelector((s) => s.auth.user);
  const refreshingRef = useRef(false);

  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchIndices());
    dispatch(fetchBreadth());
    dispatch(fetchWatchlist());
    dispatch(fetchLatestScan());
    dispatch(fetchTopStocks());
    const timer = setInterval(() => {
      dispatch(fetchSummary());
      dispatch(fetchIndices());
      dispatch(fetchWatchlist());
      dispatch(fetchLatestScan());
      dispatch(fetchTopStocks());
    }, 2000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const top = scanResult?.opportunities.slice(0, 3) ?? [];
  const aiTop = picks[0] ?? null;

  const runAiPicks = useCallback(() => {
    if (refreshingRef.current || analyzing) return;
    refreshingRef.current = true;
    const symbols: string[] = [];
    const push = (s: string) => {
      const u = s.trim().toUpperCase();
      if (u && /^[A-Z0-9&.-]{1,20}$/.test(u) && !symbols.includes(u)) symbols.push(u);
    };
    watchlist?.items.slice(0, 4).forEach((i) => push(i.symbol));
    topMovers?.gainers.slice(0, 4).forEach((m) => push(m.symbol));
    scanResult?.opportunities.slice(0, 4).forEach((o) => push(o.symbol));
    if (!symbols.length) ['RELIANCE', 'TATAPOWER', 'HDFCBANK', 'INFY'].forEach(push);
    dispatch(analyzeMany(symbols.slice(0, 8))).finally(() => {
      refreshingRef.current = false;
    });
  }, [watchlist, topMovers, scanResult, analyzing, dispatch]);

  // Auto-load suggestions once data is ready, then refresh every 3 minutes so
  // news + market moves keep the recommendation current.
  useEffect(() => {
    if (picks.length === 0 && !analyzing) runAiPicks();
  }, [runAiPicks, picks.length, analyzing]);

  useEffect(() => {
    const timer = setInterval(runAiPicks, 2 * 1000);
    return () => clearInterval(timer);
  }, [runAiPicks]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">Welcome back, {user?.fullName ?? user?.email}</p>
      </header>

      <div className="stat-grid">
        <StatCard label="Invested" value={formatCurrency(summary?.invested)} />
        <StatCard label="Current Value" value={formatCurrency(summary?.currentValue)} />
        <StatCard
          label="Total P&L"
          value={formatCurrency(summary?.totalPnl)}
          tone={summary && summary.totalPnl >= 0 ? 'text-positive' : 'text-negative'}
          sub={formatPct(summary?.pnlPct)}
        />
        <StatCard label="Diversification Score" value={summary ? `${summary.diversificationScore}/100` : '—'} sub={summary ? `${summary.holdingsCount} holdings` : undefined} />
      </div>

      <Card
        title={
          <span className="ai-dash-title">
            AI Suggestions
            {lastUpdated ? (
              <span className="ai-dash-live">
                <span className="sg-live-dot" /> updated {formatTimeAgo(lastUpdated)}
              </span>
            ) : null}
          </span>
        }
        action={
          analyzing ? (
            <Spinner />
          ) : (
            <>
              <Link to="/ai-picks" className="btn btn-outline btn-sm">
                AI Strategy
              </Link>
              <button type="button" className="btn btn-primary btn-sm" onClick={runAiPicks} style={{ marginLeft: 8 }}>
                Get Suggestions
              </button>
            </>
          )
        }
      >
        {aiTop ? (
          <Link to="/ai-picks" className="ai-top-card">
            <div className="ai-top-head">
              <span className="sg-top-badge">TOP PICK</span>
              <span className="strong">{aiTop.symbol}</span>
              <Badge className={aiSignalClass(aiTop.finalSignal)}>{aiTop.finalSignal}</Badge>
            </div>
            <div className="ai-dash-score">
              {aiTop.overallScore}
              <span className="small muted">/100</span>
            </div>
            <div className="small muted">
              {formatCurrency(aiTop.quote?.lastPrice)}
              {aiTop.quote?.changePct != null ? (
                <span className={aiTop.quote.changePct >= 0 ? 'text-positive' : 'text-negative'}>
                  {' '}({formatPct(aiTop.quote.changePct)}) · live
                </span>
              ) : null}
              <span> · {aiTop.confidence} confidence</span>
            </div>
            <div className="ai-dash-entry small">
              Entry {formatCurrency(aiTop.entry.zoneLow)}–{formatCurrency(aiTop.entry.zoneHigh)} · SL {formatCurrency(aiTop.entry.stopLoss)}
            </div>
            <div className="ai-dash-oneliner small">{aiTop.oneLiner}</div>
          </Link>
        ) : analyzing ? (
          <Spinner label="Running 7-factor AI analysis…" />
        ) : (
          <EmptyState title="No AI suggestions yet" hint="Click 'Get Suggestions' to score your watchlist + top opportunities with live data & news" />
        )}
      </Card>

      <div className="grid-2">
        <Card title="Market Indices">
          {indices.length === 0 ? (
            <Spinner />
          ) : (
            <div className="index-list">
              {indices.map((idx) => (
                <div key={idx.symbol} className="index-row">
                  <div>
                    <div className="strong">{idx.symbol}</div>
                    <div className="muted small">{idx.instrumentType}</div>
                  </div>
                  <div className="ta-right">
                    <div className="strong">{formatNumber(idx.level)}</div>
                    <div className={idx.changePct >= 0 ? 'text-positive small' : 'text-negative small'}>{formatPct(idx.changePct)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Market Breadth">
          {breadth ? (
            <div className="breadth-box">
              <div className="breadth-stats">
                <span className="text-positive">Advancing {breadth.advancing}</span>
                <span className="text-negative">Declining {breadth.declining}</span>
                <span>Unchanged {breadth.unchanged}</span>
              </div>
              <div className="breadth-bar">
                <div className="breadth-adv" style={{ width: `${(breadth.advancing / Math.max(1, breadth.total)) * 100}%` }} />
                <div className="breadth-dec" style={{ width: `${(breadth.declining / Math.max(1, breadth.total)) * 100}%` }} />
              </div>
              <div className="muted small">Above SMA50: {formatPct(breadth.breadthPctAboveSma50)} · Above SMA20: {formatPct(breadth.breadthPctAboveSma20)}</div>
            </div>
          ) : (
            <EmptyState title="No breadth data" />
          )}
        </Card>
      </div>

      <Card
        title="Top Opportunities"
        action={
          scanning ? (
            <Spinner />
          ) : (
            <Link to="/radar" className="btn btn-outline btn-sm">
              Open Radar
            </Link>
          )
        }
      >
        {scanResult ? (
          <>
            <div className="regime-line">
              Regime: <Badge className={regimeBadgeClass(scanResult.regime)}>{scanResult.regime}</Badge>
            </div>
            <div className="opportunity-list">
              {top.map((o) => (
                <div key={o.symbol} className="opportunity-row">
                  <div>
                    <span className="strong">{o.symbol}</span>
                    <span className="muted small"> · {formatCurrency(o.price)}</span>
                  </div>
                  <div className="ta-right">
                    <Badge className={signalBadgeClass(o.signal)}>{o.signal}</Badge>
                    <div className="small muted">Conviction {o.convictionScore}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyState title="No scan results yet" hint="Run a scan from the Radar page" />
        )}
      </Card>

      <Card
        title="Watchlist"
        action={
          <Link to="/watchlist" className="btn btn-outline btn-sm">
            Manage
          </Link>
        }
      >
        {watchlist && watchlist.items.length > 0 ? (
          <div className="watchlist-grid">
            {watchlist.items.slice(0, 8).map((item) => (
              <div key={item.symbol} className="watch-chip">
                <span className="strong">{item.symbol}</span>
                <span className={item.changePct >= 0 ? 'text-positive' : 'text-negative'}>{formatPct(item.changePct)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Watchlist is empty" hint="Add symbols from the Watchlist page" />
        )}
      </Card>

      {summary && summary.concentrationRisk.risks.length > 0 ? (
        <Card title="Concentration Risk">
          {summary.concentrationRisk.risks.map((r, i) => (
            <div key={i} className="risk-row">
              <div className="flex-1">
                <span className="strong">{r.symbol ?? r.sector}</span>
                <span className="muted small"> · {r.type}</span>
                <div className="muted small">{r.message}</div>
              </div>
              <div className="risk-weight">
                <ProgressBar value={r.weightPct} />
                <span className="small">{r.weightPct.toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}