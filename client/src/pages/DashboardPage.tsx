import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSummary } from '../store/portfolioSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchIndices, fetchBreadth } from '../store/marketSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { Card, StatCard, Badge, ProgressBar, Spinner, EmptyState } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, signalBadgeClass, regimeBadgeClass } from '../lib/format';

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { summary } = useAppSelector((s) => s.portfolio);
  const { scanResult, scanning } = useAppSelector((s) => s.radar);
  const { indices, breadth } = useAppSelector((s) => s.market);
  const { watchlist } = useAppSelector((s) => s.watchlist);
  const user = useAppSelector((s) => s.auth.user);

  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchIndices());
    dispatch(fetchBreadth());
    dispatch(fetchWatchlist());
    dispatch(fetchLatestScan());
    const timer = setInterval(() => {
      dispatch(fetchSummary());
      dispatch(fetchIndices());
      dispatch(fetchWatchlist());
      dispatch(fetchLatestScan());
    }, 2000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const top = scanResult?.opportunities.slice(0, 5) ?? [];

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