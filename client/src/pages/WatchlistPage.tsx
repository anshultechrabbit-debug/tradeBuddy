import { FormEvent, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../store/watchlistSlice';
import { fetchInstruments } from '../store/marketSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct } from '../lib/format';
import { apiErrorMessage } from '../api/client';
import { Link } from 'react-router-dom';

export function WatchlistPage() {
  const dispatch = useAppDispatch();
  const { watchlist, loading, error } = useAppSelector((s) => s.watchlist);
  const { instruments } = useAppSelector((s) => s.market);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    dispatch(fetchWatchlist());
  }, [dispatch]);

  useEffect(() => {
    if (query.trim().length >= 1) {
      const t = setTimeout(() => dispatch(fetchInstruments(query.trim())), 250);
      return () => clearTimeout(t);
    }
  }, [query, dispatch]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setAdding(true);
    setActionError(null);
    try {
      await dispatch(addToWatchlist(selected)).unwrap();
      await dispatch(fetchWatchlist());
      setSelected('');
      setQuery('');
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(symbol: string) {
    setActionError(null);
    try {
      await dispatch(removeFromWatchlist(symbol)).unwrap();
      await dispatch(fetchWatchlist());
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Watchlist</h1>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}

      <Card title="Add symbol">
        <form onSubmit={handleAdd} className="form form-inline">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbols (e.g. RELIANCE)"
            list="instrument-options"
          />
          <datalist id="instrument-options">
            {instruments.map((inst) => (
              <option key={inst.id} value={inst.symbol}>
                {inst.name}
              </option>
            ))}
          </datalist>
          <input value={selected} onChange={(e) => setSelected(e.target.value)} placeholder="Symbol to add" style={{ maxWidth: 180 }} />
          <button type="submit" className="btn btn-primary" disabled={adding || !selected}>
            {adding ? <Spinner /> : 'Add'}
          </button>
        </form>
      </Card>

      <Card title={`My Watchlist (${watchlist?.items.length ?? 0})`}>
        {loading ? (
          <Spinner />
        ) : watchlist && watchlist.items.length > 0 ? (
          <Table headers={['Symbol', 'Name', 'Sector', 'Price', 'Change', 'Source', '']}>
            {watchlist.items.map((item) => (
              <tr key={item.id}>
                <td className="strong">
                  <Link to={`/radar/${item.symbol}`}>{item.symbol}</Link>
                </td>
                <td>{item.name ?? '—'}</td>
                <td className="muted small">{item.sector ?? '—'}</td>
                <td>{formatCurrency(item.price)}</td>
                <td className={item.changePct >= 0 ? 'text-positive' : 'text-negative'}>{formatPct(item.changePct)}</td>
                <td>
                  <Badge className="badge badge-muted">{item.dataSource}</Badge>
                </td>
                <td>
                  <button className="btn btn-outline btn-sm" onClick={() => handleRemove(item.symbol)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="Watchlist is empty" hint="Search and add symbols above" />
        )}
      </Card>
    </div>
  );
}