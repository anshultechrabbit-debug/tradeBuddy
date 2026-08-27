import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../store/watchlistSlice';
import { fetchInstruments } from '../store/marketSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct } from '../lib/format';
import { apiErrorMessage } from '../api/client';

export function WatchlistPage() {
  const dispatch = useAppDispatch();
  const { watchlist, loading, error } = useAppSelector((s) => s.watchlist);
  const { instruments } = useAppSelector((s) => s.market);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (query.trim().length >= 1) {
      const t = setTimeout(() => dispatch(fetchInstruments(query.trim())), 250);
      return () => clearTimeout(t);
    }
  }, [query, dispatch]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const symbolToAdd = (selected || query).trim().toUpperCase();
    if (!symbolToAdd) return;
    setAdding(true);
    setActionError(null);
    try {
      await dispatch(addToWatchlist(symbolToAdd)).unwrap();
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
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 sm:p-8 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[11px] font-mono font-bold tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE TICKER STREAM
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Target Watchlist
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Track priority equities with automated price alerts, regime context, and direct TradePanda radar integration.
            </p>
          </div>
          <div className="px-4 py-2 rounded-2xl bg-white/10 border border-white/15 text-center">
            <div className="font-mono text-2xl font-black text-white">{watchlist?.items.length ?? 0}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Monitored Assets</div>
          </div>
        </div>
      </section>

      {error ? <ErrorBox message={error} /> : null}
      {actionError ? <ErrorBox message={actionError} /> : null}

      {/* ── ADD SYMBOL CARD ── */}
      <Card title={<span className="flex items-center gap-2"><span>➕</span> Add Ticker to Watchlist</span>}>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(e.target.value.toUpperCase());
              }}
              placeholder="Search symbol (e.g. RELIANCE, INFY, HDFCBANK)"
              list="instrument-options"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors uppercase font-mono"
            />
            <datalist id="instrument-options">
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.symbol}>
                  {inst.name}
                </option>
              ))}
            </datalist>
          </div>
          <button
            type="submit"
            disabled={adding || (!selected && !query.trim())}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0"
          >
            {adding ? <Spinner /> : <span>Add Symbol</span>}
          </button>
        </form>
      </Card>

      {/* ── WATCHLIST TABLE CARD ── */}
      <Card title={`Active Watchlist (${watchlist?.items.length ?? 0})`}>
        {loading ? (
          <Spinner />
        ) : watchlist && watchlist.items.length > 0 ? (
          <div className="w-full rounded-xl border border-slate-200 dark:border-[#1c2541] overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-100/90 dark:bg-[#070d1e]/80 text-[10px] sm:text-[10.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="px-3 sm:px-4 py-3">Symbol</th>
                  <th className="hidden md:table-cell px-4 py-3">Company Name</th>
                  <th className="hidden sm:table-cell px-4 py-3">Sector</th>
                  <th className="px-3 sm:px-4 py-3 text-right">Live Price</th>
                  <th className="px-3 sm:px-4 py-3 text-right">24h Change</th>
                  <th className="hidden lg:table-cell px-4 py-3">Data Feed</th>
                  <th className="px-3 sm:px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
                {watchlist.items.map((item) => {
                  const isNeg = item.changePct < 0;
                  return (
                    <tr key={item.id} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                      <td className="px-3 sm:px-4 py-3 font-extrabold text-slate-900 dark:text-white">
                        <Link
                          to={`/ai-picks?symbol=${item.symbol}`}
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1.5"
                        >
                          <span>{item.symbol}</span>
                          <span className="text-[10px] text-slate-400">↗</span>
                        </Link>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">{item.name ?? '—'}</td>
                      <td className="hidden sm:table-cell px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{item.sector ?? '—'}</td>
                      <td className="px-3 sm:px-4 py-3 font-mono font-bold text-slate-900 dark:text-white text-right whitespace-nowrap">
                        {formatCurrency(item.price)}
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                          isNeg ? 'bg-rose-500/10 text-rose-500 dark:text-rose-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {formatPct(item.changePct)}
                        </span>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                          {item.dataSource}
                        </span>
                      </td>
                      <td className="px-3 sm:px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemove(item.symbol)}
                          className="px-2 py-0.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          ✕ Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Watchlist is currently empty" hint="Search and add stock symbols using the bar above." />
        )}
      </Card>
    </div>
  );
}