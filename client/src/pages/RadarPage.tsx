import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { runScan, fetchOpportunities, fetchSignals, fetchLatestScan } from '../store/radarSlice';
import { fetchIndices, fetchAllQuotes, fetchBreadth } from '../store/marketSlice';
import { Card, Badge, Spinner, EmptyState, ProgressBar, PaginationBar, ErrorBox, Table } from '../components/ui';
import { formatCurrency, formatPct, formatDateTime, formatTimeAgo, signalBadgeClass, regimeBadgeClass } from '../lib/format';
import { Link } from 'react-router-dom';

function tone(signal: string): 'buy' | 'watch' | 'avoid' {
  if (signal.includes('BUY')) return 'buy';
  if (signal.includes('AVOID')) return 'avoid';
  return 'watch';
}

type SignalFilter = '' | 'BUY' | 'WATCH' | 'AVOID';

function FilterBar({
  signalFilter,
  onSignalFilter,
  search,
  onSearch,
}: {
  signalFilter: SignalFilter;
  onSignalFilter: (v: SignalFilter) => void;
  search: string;
  onSearch: (v: string) => void;
}) {
  const options: { value: SignalFilter; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'BUY', label: 'BUY' },
    { value: 'WATCH', label: 'WATCH' },
    { value: 'AVOID', label: 'AVOID' },
  ];
  return (
    <div className="market-toolbar">
      <div className="tabs">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={signalFilter === o.value ? 'tab tab-active' : 'tab'}
            onClick={() => onSignalFilter(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="search-box">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search symbol…"
          autoComplete="off"
        />
      </div>
    </div>
  );
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

  // Trending now is already fully loaded client-side (one scan response), so
  // its filter applies instantly with no extra requests. Saved Opportunities
  // and Recent Signals are server-paginated, so their filters go through the
  // API — the search box is debounced so typing doesn't fire a request per
  // keystroke.
  const [trendSignalFilter, setTrendSignalFilter] = useState<SignalFilter>('');
  const [trendSearch, setTrendSearch] = useState('');

  const [oppSignalFilter, setOppSignalFilter] = useState<SignalFilter>('');
  const [oppSearchInput, setOppSearchInput] = useState('');
  const [oppSearch, setOppSearch] = useState('');

  const [sigSignalFilter, setSigSignalFilter] = useState<SignalFilter>('');
  const [sigSearchInput, setSigSearchInput] = useState('');
  const [sigSearch, setSigSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setOppSearch(oppSearchInput);
      setOppPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [oppSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSigSearch(sigSearchInput);
      setSigPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [sigSearchInput]);

  useEffect(() => {
    dispatch(fetchOpportunities({ page: oppPage, limit: 10, signal: oppSignalFilter || undefined, symbol: oppSearch || undefined }));
  }, [dispatch, oppPage, oppSignalFilter, oppSearch, lastScannedAt]);

  useEffect(() => {
    dispatch(fetchSignals({ page: sigPage, limit: 100, signal: sigSignalFilter || undefined, symbol: sigSearch || undefined }));
  }, [dispatch, sigPage, sigSignalFilter, sigSearch, lastScannedAt]);

  // Live radar: SSE pushes a fresh scan the moment one completes server-side
  // (background scan now runs at most every 30s, market hours only), so the
  // interval polls below are only a fallback in case a push is missed — not
  // the primary update path. Previously these ran every 2s regardless of SSE,
  // which meant 3 full requests/second per open tab (one of them,
  // fetchAllQuotes, a full-universe DB query) — the main cause of the
  // request flood on this page.
  useEffect(() => {
    dispatch(runScan());
    dispatch(fetchIndices());
    dispatch(fetchAllQuotes());
    dispatch(fetchBreadth());
    const scanTimer = setInterval(() => dispatch(runScan()), 60000);
    const indicesTimer = setInterval(() => dispatch(fetchIndices()), 30000);
    const quotesTimer = setInterval(() => dispatch(fetchAllQuotes()), 60000);
    const breadthTimer = setInterval(() => dispatch(fetchBreadth()), 60000);
    return () => {
      clearInterval(scanTimer);
      clearInterval(indicesTimer);
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

  const gainers = [...allQuotes]
    .filter((q) => q.symbol && q.lastPrice != null && q.changePct != null && q.changePct > 0)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  const losers = [...allQuotes]
    .filter((q) => q.symbol && q.lastPrice != null && q.changePct != null && q.changePct < 0)
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));

  const trending = (scanResult?.opportunities ?? []).filter((o) => {
    if (trendSignalFilter && o.signal !== trendSignalFilter) return false;
    if (trendSearch && !o.symbol.toUpperCase().includes(trendSearch.toUpperCase())) return false;
    return true;
  });
  const outlookBySymbol = new Map(
    (signals?.data ?? []).map((signal) => [signal.symbol, signal.directionalOutlook]),
  );

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
          <p className="muted">Technical scan of the market data currently stored by TradeBuddy</p>
        </div>
        <div className="sg-header-right">
          <span className="sg-live-badge">
            <span className="sg-live-dot" />
            {lastScannedAt ? `auto scan updated ${formatTimeAgo(lastScannedAt)}` : 'starting scan'}
          </span>
        </div>
      </header>

      {error ? <ErrorBox message={error} onRetry={() => dispatch(runScan())} /> : null}

      {indices.length > 0 ? (
        <MarketMood indices={indices.map((i) => ({ symbol: i.symbol, level: i.level, changePct: i.changePct }))} breadth={breadth} regime={scanResult?.regime ?? 'NEUTRAL'} />
      ) : null}

      <div className="rd-movers-grid">
        <Card title="Top gainers">
          {gainSlice.length ? (
            <div className="rd-mover-list">
              {gainSlice.map((g, index) => (
                <Link key={g.symbol} to={`/radar/${g.symbol}`} className="rd-mover-row">
                  <span className="strong">#{(safeGainPage - 1) * MOVER_PAGE + index + 1} {g.symbol}</span>
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
              {losSlice.map((l, index) => (
                <Link key={l.symbol} to={`/radar/${l.symbol}`} className="rd-mover-row">
                  <span className="strong">#{(safeLosPage - 1) * MOVER_PAGE + index + 1} {l.symbol}</span>
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
        <FilterBar
          signalFilter={trendSignalFilter}
          onSignalFilter={(v) => {
            setTrendSignalFilter(v);
            setTrendPage(1);
          }}
          search={trendSearch}
          onSearch={(v) => {
            setTrendSearch(v);
            setTrendPage(1);
          }}
        />
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
                      <Badge className={signalBadgeClass(o.signal)}>{o.signal}</Badge>
                      {o.directionalOutlook ? (
                        <Badge className={regimeBadgeClass(o.directionalOutlook)}>Stock {o.directionalOutlook}</Badge>
                      ) : (
                        <Badge className="badge badge-muted">Stock UNKNOWN</Badge>
                      )}
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
        ) : scanResult ? (
          <EmptyState title="No matches" hint="Try clearing the filters above" />
        ) : (
          <EmptyState title="No scan run yet" hint="Click Run Scan to analyze the market" />
        )}
      </Card>

      <Card title="Current Scan Opportunities">
        <FilterBar
          signalFilter={oppSignalFilter}
          onSignalFilter={(v) => {
            setOppSignalFilter(v);
            setOppPage(1);
          }}
          search={oppSearchInput}
          onSearch={setOppSearchInput}
        />
        {loading ? (
          <Spinner />
        ) : opportunities && opportunities.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Action Signal', 'Stock Outlook', 'Conviction', 'Date']}>
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
                  <td>
                    {outlookBySymbol.get(o.symbol) ? (
                      <Badge className={regimeBadgeClass(outlookBySymbol.get(o.symbol) ?? 'NEUTRAL')}>
                        {outlookBySymbol.get(o.symbol)}
                      </Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{o.convictionScore}</td>
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

      <Card
        title="Current Technical Signals — 100 Nifty Stocks"
        action={signals ? <span className="muted small">{signals.meta.total} matching · {scanResult?.opportunities.length ?? 0} scanned</span> : undefined}
      >
        <FilterBar
          signalFilter={sigSignalFilter}
          onSignalFilter={(v) => {
            setSigSignalFilter(v);
            setSigPage(1);
          }}
          search={sigSearchInput}
          onSearch={setSigSearchInput}
        />
        {signals && signals.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'AI-Validated Action', 'Stock Outlook', 'Conviction', 'Timestamp']}>
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
                  <td>
                    {s.directionalOutlook ? (
                      <Badge className={regimeBadgeClass(s.directionalOutlook)}>{s.directionalOutlook}</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{s.convictionScore}</td>
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
