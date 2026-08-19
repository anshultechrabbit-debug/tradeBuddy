import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchIndices, fetchBreadth, fetchQuotes } from '../store/marketSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatNumber } from '../lib/format';

export function MarketPage() {
  const dispatch = useAppDispatch();
  const { indices, breadth, quotes, loading, error } = useAppSelector((s) => s.market);

  useEffect(() => {
    dispatch(fetchIndices());
    dispatch(fetchBreadth());
    dispatch(fetchQuotes(150));
  }, [dispatch]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Market</h1>
        <p className="muted">Live quotes &amp; indices from external sources (nselib / jugaad / nse-archives)</p>
      </header>

      {error ? <ErrorBox message={error} /> : null}

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

      <Card title={`Market Quotes (${quotes.length})`}>
        {loading && quotes.length === 0 ? (
          <Spinner />
        ) : quotes.length > 0 ? (
          <Table headers={['Symbol', 'Name', 'Sector', 'LTP', 'Change', 'Change %', 'Volume', 'Source']}>
            {quotes.map((q) => (
              <tr key={q.symbol}>
                <td className="strong">
                  <Link to={`/radar/${q.symbol}`}>{q.symbol}</Link>
                </td>
                <td className="muted small">{q.name ?? '—'}</td>
                <td className="muted small">{q.sector ?? '—'}</td>
                <td>{q.lastPrice != null ? formatCurrency(q.lastPrice) : '—'}</td>
                <td className={q.change != null && q.change >= 0 ? 'text-positive' : 'text-negative'}>{q.change != null ? formatCurrency(q.change) : '—'}</td>
                <td className={q.changePct != null && q.changePct >= 0 ? 'text-positive' : 'text-negative'}>{q.changePct != null ? formatPct(q.changePct) : '—'}</td>
                <td className="muted small">{q.volume != null ? formatNumber(q.volume) : '—'}</td>
                <td>
                  <Badge className="badge badge-muted">{q.source ?? q.dataSource ?? '—'}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="No quotes yet" hint="Run a scan or refresh after the first backfill completes" />
        )}
      </Card>
    </div>
  );
}