import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSummary, fetchHoldings, fetchSectors, syncPortfolio } from '../store/portfolioSlice';
import { Card, StatCard, Table, ProgressBar, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, pnlClass } from '../lib/format';

export function PortfolioPage() {
  const dispatch = useAppDispatch();
  const { summary, holdings, sectors, loading, error } = useAppSelector((s) => s.portfolio);

  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchHoldings());
    dispatch(fetchSectors());
  }, [dispatch]);

  function handleSync() {
    dispatch(syncPortfolio('mock')).then(() => {
      dispatch(fetchSummary());
      dispatch(fetchHoldings());
      dispatch(fetchSectors());
    });
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Portfolio</h1>
        <button className="btn btn-outline" onClick={handleSync}>
          Sync from broker
        </button>
      </header>

      {error ? <ErrorBox message={error} /> : null}

      <div className="stat-grid">
        <StatCard label="Invested" value={formatCurrency(summary?.invested)} />
        <StatCard label="Current Value" value={formatCurrency(summary?.currentValue)} />
        <StatCard
          label="Total P&L"
          value={formatCurrency(summary?.totalPnl)}
          tone={summary && summary.totalPnl >= 0 ? 'text-positive' : 'text-negative'}
          sub={formatPct(summary?.pnlPct)}
        />
        <StatCard
          label="Diversification"
          value={summary ? `${summary.diversificationScore}/100` : '—'}
          sub={<ProgressBar value={summary?.diversificationScore ?? 0} />}
        />
      </div>

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

      <div className="grid-2">
        <Card title="Holdings" className="span-2">
          {loading ? (
            <Spinner />
          ) : holdings.length > 0 ? (
            <Table headers={['Symbol', 'Sector', 'Qty', 'Avg', 'LTP', 'Invested', 'Value', 'P&L', 'P&L %']}>
              {holdings.map((h) => (
                <tr key={h.id}>
                  <td className="strong">{h.symbol}</td>
                  <td className="muted small">{h.sector ?? '—'}</td>
                  <td>{formatNumber(h.quantity, 0)}</td>
                  <td>{formatCurrency(h.averagePrice)}</td>
                  <td>{formatCurrency(h.currentPrice)}</td>
                  <td>{formatCurrency(h.costValue)}</td>
                  <td>{formatCurrency(h.currentValue)}</td>
                  <td className={pnlClass(h.pnl)}>{formatCurrency(h.pnl)}</td>
                  <td className={pnlClass(h.pnlPct)}>{formatPct(h.pnlPct)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No holdings yet" hint="Connect the mock broker and sync" />
          )}
        </Card>

        <Card title="Sector Exposure">
          {sectors.length > 0 ? (
            <div className="sector-list">
              {sectors.map((s) => (
                <div key={s.sector} className="sector-row">
                  <div className="flex-1">
                    <span className="small">{s.sector}</span>
                    <ProgressBar value={s.weightPct} />
                  </div>
                  <div className="ta-right small">
                    <span className="strong">{s.weightPct.toFixed(1)}%</span>
                    <div className="muted">{formatCurrency(s.value)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No sector data" />
          )}
        </Card>
      </div>
    </div>
  );
}