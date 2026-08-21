import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchIndices, fetchQuotes, fetchAllQuotes, fetchTopStocks, fetchLiveBySymbols } from '../store/marketSlice';
import { Spinner, ErrorBox, EmptyState } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, formatCompact, formatTimeAgo } from '../lib/format';

type Tab = 'nifty' | 'all';
type SortKey = 'symbol' | 'name' | 'lastPrice' | 'change' | 'changePct' | 'volume';

const INDEX_NAMES: Record<string, string> = {
  NIFTY: 'NIFTY 50',
  NIFTYBANK: 'NIFTY BANK',
  SENSEX: 'SENSEX',
  FINNIFTY: 'FINNIFTY',
};

function liveBadge(lastUpdated: number | null) {
  if (!lastUpdated) return <span className="live-dot" />;
  const seconds = Math.max(0, Math.round((Date.now() - lastUpdated) / 1000));
  const isStale = seconds > 30;
  return (
    <span className={isStale ? 'live-badge live-badge--stale' : 'live-badge'}>
      <span className="live-dot" />
      {isStale ? `STALE · ${seconds}s ago` : `LIVE · ${seconds}s ago`}
    </span>
  );
}

function TopMoverList({ title, items }: { title: string; items: { symbol: string; lastPrice: number | null; changePct: number | null }[] }) {
  if (!items.length) {
    return (
      <div className="topmover-card">
        <div className="topmover-title">{title}</div>
        <div className="muted small">No data right now</div>
      </div>
    );
  }
  return (
    <div className="topmover-card">
      <div className="topmover-title">{title}</div>
      {items.slice(0, 3).map((s) => (
        <Link key={s.symbol} to={`/radar/${s.symbol}`} className="topmover-row">
          <span className="strong">{s.symbol}</span>
          <span className="topmover-metrics">
            <span>{s.lastPrice != null ? formatCurrency(s.lastPrice) : '—'}</span>
            <span className={s.changePct != null && s.changePct >= 0 ? 'text-positive' : 'text-negative'}>
              {formatPct(s.changePct)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function SortHeader({ label, k, sort, onSort }: { label: string; k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void }) {
  return (
    <th className="sortable">
      <button type="button" className="sort-btn" onClick={() => onSort(k)}>
        {label}
        <span className="sort-arrow">{sort.key === k ? (sort.dir === 1 ? '▲' : '▼') : '·'}</span>
      </button>
    </th>
  );
}

export function MarketPage() {
  const dispatch = useAppDispatch();
  const { indices, quotes, allQuotes, liveDetail, top, error, lastUpdated } = useAppSelector((s) => s.market);
  const [tab, setTab] = useState<Tab>('nifty');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'changePct', dir: -1 });
  const visibleKeyRef = useRef<string | null>(null);
  const visibleSymbolsRef = useRef<string[]>([]);
  // In-flight flags to prevent concurrent poll requests from stacking.
  const indicesFetchingRef = useRef(false);
  const quotesFetchingRef = useRef(false);
  const topFetchingRef = useRef(false);
  const liveFetchingRef = useRef(false);

  useEffect(() => {
    dispatch(fetchIndices());
    dispatch(fetchQuotes(60));
    dispatch(fetchAllQuotes());
    dispatch(fetchTopStocks());

    // Poll at 8s — the server's background snapshot refreshes every 15s,
    // so 8s gives two client polls per server refresh cycle.
    const POLL_MS = 8000;

    const indicesTimer = setInterval(() => {
      if (indicesFetchingRef.current) return;
      indicesFetchingRef.current = true;
      dispatch(fetchIndices()).finally(() => { indicesFetchingRef.current = false; });
    }, POLL_MS);

    const quotesTimer = setInterval(() => {
      if (quotesFetchingRef.current) return;
      quotesFetchingRef.current = true;
      dispatch(fetchQuotes(60)).finally(() => { quotesFetchingRef.current = false; });
    }, POLL_MS);

    const topTimer = setInterval(() => {
      if (topFetchingRef.current) return;
      topFetchingRef.current = true;
      dispatch(fetchTopStocks()).finally(() => { topFetchingRef.current = false; });
    }, POLL_MS);

    const liveTimer = setInterval(() => {
      if (liveFetchingRef.current || !visibleSymbolsRef.current.length) return;
      liveFetchingRef.current = true;
      dispatch(fetchLiveBySymbols(visibleSymbolsRef.current)).finally(() => { liveFetchingRef.current = false; });
    }, POLL_MS);

    return () => {
      clearInterval(indicesTimer);
      clearInterval(quotesTimer);
      clearInterval(topTimer);
      clearInterval(liveTimer);
    };
  }, [dispatch]);

  const merged = useMemo(() => {
    if (!allQuotes.length) return quotes;
    const live = new Map(quotes.map((q) => [q.symbol, q]));
    return allQuotes.map((q) => live.get(q.symbol) ?? liveDetail[q.symbol] ?? q);
  }, [quotes, allQuotes, liveDetail]);

  const visible = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q ? merged : tab === 'nifty' ? quotes.slice(0, 50) : merged;
    const filtered = q
      ? base.filter((r) => r.symbol.toUpperCase().includes(q) || (r.name ?? '').toUpperCase().includes(q))
      : base;
    const sorted = [...filtered].sort((a, b) => {
      const { key, dir } = sort;
      let av: number | string;
      let bv: number | string;
      if (key === 'symbol') {
        av = a.symbol;
        bv = b.symbol;
      } else if (key === 'name') {
        av = (a.name ?? '').toLowerCase();
        bv = (b.name ?? '').toLowerCase();
      } else {
        av = a[key] ?? Number.NEGATIVE_INFINITY;
        bv = b[key] ?? Number.NEGATIVE_INFINITY;
      }
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return cmp * dir;
    });
    return sorted;
  }, [quotes, merged, allQuotes, tab, query, sort]);

  useEffect(() => {
    const symbols = [...new Set(visible.slice(0, 100).map((q) => q.symbol))];
    const key = symbols.join('|');
    if (key !== visibleKeyRef.current) {
      visibleKeyRef.current = key;
      visibleSymbolsRef.current = symbols;
      dispatch(fetchLiveBySymbols(symbols));
    }
  }, [visible, dispatch]);

  const movers = useMemo(() => {
    const byPct = (dir: 1 | -1) =>
      quotes
        .filter((q) => q.lastPrice != null && q.changePct != null)
        .sort((a, b) => ((a.changePct ?? 0) - (b.changePct ?? 0)) * dir)
        .slice(0, 3)
        .map((q) => ({ symbol: q.symbol, lastPrice: q.lastPrice, changePct: q.changePct }));
    const gainers = top?.gainers?.length ? top.gainers.map((g) => ({ symbol: g.symbol, lastPrice: g.lastPrice, changePct: g.changePct })) : byPct(-1);
    const losers = top?.losers?.length ? top.losers.map((g) => ({ symbol: g.symbol, lastPrice: g.lastPrice, changePct: g.changePct })) : byPct(1);
    const active = top?.activeByVolume?.length
      ? top.activeByVolume.map((g) => ({ symbol: g.symbol, lastPrice: g.lastPrice, changePct: g.changePct }))
      : quotes
          .filter((q) => q.volume != null)
          .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
          .slice(0, 3)
          .map((q) => ({ symbol: q.symbol, lastPrice: q.lastPrice, changePct: q.changePct }));
    return { gainers, losers, active };
  }, [quotes, top]);

  function onSort(k: SortKey) {
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: -1 }));
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Markets</h1>
          <p className="muted">Live NSE quotes — updates every few seconds from the NSE API</p>
        </div>
        {liveBadge(lastUpdated)}
      </header>

      {error ? <ErrorBox message={error} /> : null}

      <div className="ticker-strip">
        {indices.length === 0 ? (
          <Spinner />
        ) : (
          indices.slice(0, 3).map((idx) => {
            const up = idx.changePct >= 0;
            return (
              <div key={idx.symbol} className="ticker-card">
                <div className="ticker-name">{INDEX_NAMES[idx.symbol] ?? idx.symbol}</div>
                <div className={up ? 'ticker-value text-positive' : 'ticker-value text-negative'}>{formatNumber(idx.level)}</div>
                <div className={up ? 'text-positive small' : 'text-negative small'}>
                  {formatPct(idx.changePct)} <span className="muted">·</span> {formatCurrency(idx.change)}
                </div>
                {idx.source ? <div className="muted ticker-updated">Updated {formatTimeAgo(idx.source)}</div> : null}
              </div>
            );
          })
        )}
      </div>

      <div className="topmover-grid">
        <TopMoverList title="Top Gainers" items={movers.gainers} />
        <TopMoverList title="Top Losers" items={movers.losers} />
        <TopMoverList title="Most Active" items={movers.active} />
      </div>

      <div className="market-toolbar">
        <div className="tabs">
          <button type="button" className={tab === 'nifty' ? 'tab tab-active' : 'tab'} onClick={() => setTab('nifty')}>
            NIFTY 50 <span className="muted">Live</span>
          </button>
          <button type="button" className={tab === 'all' ? 'tab tab-active' : 'tab'} onClick={() => setTab('all')}>
            All Stocks <span className="muted">{allQuotes.length ? `(${allQuotes.length})` : ''}</span>
          </button>
        </div>
        <div className="search-box">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or company…"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {visible.length === 0 ? (
            <EmptyState title="No quotes yet" hint="Polling the NSE live API — check back in a moment" />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Symbol" k="symbol" sort={sort} onSort={onSort} />
                  <SortHeader label="Company" k="name" sort={sort} onSort={onSort} />
                  <SortHeader label="LTP" k="lastPrice" sort={sort} onSort={onSort} />
                  <SortHeader label="Change" k="change" sort={sort} onSort={onSort} />
                  <SortHeader label="Chg %" k="changePct" sort={sort} onSort={onSort} />
                  <SortHeader label="Volume" k="volume" sort={sort} onSort={onSort} />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 100).map((q) => {
                  const up = q.changePct != null && q.changePct >= 0;
                  const tone = q.changePct == null ? '' : up ? 'text-positive' : 'text-negative';
                  return (
                    <tr key={q.symbol}>
                      <td className="strong">
                        <Link to={`/radar/${q.symbol}`}>{q.symbol}</Link>
                      </td>
                      <td className="muted">{q.name ?? '—'}</td>
                      <td className="strong">{q.lastPrice != null ? formatCurrency(q.lastPrice) : '—'}</td>
                      <td className={tone}>{q.change != null ? formatCurrency(q.change) : '—'}</td>
                      <td className={tone}>{q.changePct != null ? formatPct(q.changePct) : '—'}</td>
                      <td className="muted">{q.volume != null ? formatCompact(q.volume) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {visible.length > 100 ? (
        <div className="muted small ta-right">Showing top 100 of {visible.length} results · search to narrow down</div>
      ) : null}
    </div>
  );
}

export default MarketPage;