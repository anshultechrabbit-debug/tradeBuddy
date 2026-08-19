import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { runScan, fetchOpportunities, fetchSignals } from '../store/radarSlice';
import { Card, Badge, Spinner, EmptyState, ProgressBar, PaginationBar, ErrorBox, Table } from '../components/ui';
import { formatCurrency, formatDateTime, signalBadgeClass, regimeBadgeClass } from '../lib/format';
import { Link } from 'react-router-dom';

export function RadarPage() {
  const dispatch = useAppDispatch();
  const { scanResult, scanning, opportunities, signals, loading, error } = useAppSelector((s) => s.radar);
  const [oppPage, setOppPage] = useState(1);
  const [sigPage, setSigPage] = useState(1);

  useEffect(() => {
    dispatch(fetchOpportunities({ page: oppPage, limit: 10 }));
  }, [dispatch, oppPage]);

  useEffect(() => {
    dispatch(fetchSignals({ page: sigPage, limit: 10 }));
  }, [dispatch, sigPage]);

  function handleScan() {
    dispatch(runScan(15));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Opportunity Radar</h1>
        <button className="btn btn-primary" onClick={handleScan} disabled={scanning}>
          {scanning ? <Spinner /> : 'Run Scan'}
        </button>
      </header>

      {error ? <ErrorBox message={error} onRetry={handleScan} /> : null}

      {scanResult ? (
        <div className="stat-grid">
          <StatCardSimple label="Regime" value={<Badge className={regimeBadgeClass(scanResult.regime)}>{scanResult.regime}</Badge>} />
          <StatCardSimple label="Opportunities" value={scanResult.opportunities.length} />
          <StatCardSimple label="Advancing" value={scanResult.breadth.advancing} />
          <StatCardSimple label="Declining" value={scanResult.breadth.declining} />
        </div>
      ) : null}

      <Card title="Latest Scan" action={scanResult ? <span className="muted small">Scan #{scanResult.scanId}</span> : undefined}>
        {scanning ? (
          <Spinner label="Scanning universe…" />
        ) : scanResult ? (
          <div className="opportunity-list">
            {scanResult.opportunities.map((o) => (
              <div key={o.symbol} className="opportunity-row">
                <div>
                  <span className="strong">{o.symbol}</span>
                  <span className="muted small"> · {formatCurrency(o.price)}</span>
                  <div className="muted small">{o.explanation}</div>
                </div>
                <div className="ta-right">
                  <Badge className={signalBadgeClass(o.signal)}>{o.signal}</Badge>
                  <div className="conviction">
                    <ProgressBar value={o.convictionScore} />
                    <span className="small">{o.convictionScore}</span>
                  </div>
                  <Link className="btn btn-outline btn-sm" to={`/radar/${o.symbol}`}>
                    Deep dive
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No scan run yet" hint="Click Run Scan to analyze the universe" />
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
                    <Badge className={signalBadgeClass(o.signal)}>{o.signal}</Badge>
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
                    <Badge className={signalBadgeClass(s.signal)}>{s.signal}</Badge>
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

function StatCardSimple({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}