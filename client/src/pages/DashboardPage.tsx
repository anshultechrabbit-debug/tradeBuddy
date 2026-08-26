import { useEffect, useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSummary } from '../store/portfolioSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchIndices, fetchBreadth, fetchTopStocks } from '../store/marketSlice';
import { fetchWatchlist } from '../store/watchlistSlice';
import { analyzeMany } from '../store/aiSlice';
import { Spinner, EmptyState } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, formatTimeAgo } from '../lib/format';
import { TradePandaChat } from '../components/TradePandaChat';
import { TradePandaDesk } from '../components/TradePandaDesk';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function aiSignalClass(signal: string): string {
  if (signal.includes('BUY'))   return 'badge badge-buy';
  if (signal.includes('AVOID')) return 'badge badge-avoid';
  return 'badge badge-watch';
}

/* ── Shared section card ─────────────────────────────────────────────────── */
function DCard({
  title,
  action,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dash-card" style={{ marginBottom: 18 }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="dash-section-label" style={{ marginBottom: 0 }}>{title}</div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ── Pill ────────────────────────────────────────────────────────────────── */
function Pill({ label, variant = 'blue' }: { label: string; variant?: 'blue' | 'green' | 'red' | 'amber' }) {
  return <span className={`dash-pill dash-pill-${variant}`}>{label}</span>;
}

/* ── Stat box ────────────────────────────────────────────────────────────── */
function StatBox({
  label,
  value,
  sub,
  subVariant = 'muted',
}: {
  label: string;
  value: string;
  sub?: string;
  subVariant?: 'positive' | 'negative' | 'muted' | 'primary';
}) {
  return (
    <div className="dash-stat">
      <div className="dash-val-label">{label}</div>
      <div className="dash-val-primary">{value}</div>
      {sub && (
        <div className={`dash-val-sub dash-${subVariant}`}>{sub}</div>
      )}
    </div>
  );
}

/* ── Btn ─────────────────────────────────────────────────────────────────── */
function Btn({
  to,
  onClick,
  children,
  primary,
}: {
  to?: string;
  onClick?: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const cls = `dash-btn${primary ? ' dash-btn-primary' : ''}`;
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <button type="button" className={cls} onClick={onClick}>{children}</button>;
}

export function DashboardPage() {
  const dispatch    = useAppDispatch();
  const { summary } = useAppSelector((s) => s.portfolio);
  const { scanResult, scanning } = useAppSelector((s) => s.radar);
  const { indices, breadth, top: topMovers } = useAppSelector((s) => s.market);
  const { watchlist } = useAppSelector((s) => s.watchlist);
  const { picks, analyzing, lastUpdated } = useAppSelector((s) => s.ai);
  const user = useAppSelector((s) => s.auth.user);
  const refreshingRef = useRef(false);

  /* ── Data fetching ── */
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

  const top   = scanResult?.opportunities.slice(0, 5) ?? [];
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
    dispatch(analyzeMany(symbols.slice(0, 8))).finally(() => { refreshingRef.current = false; });
  }, [watchlist, topMovers, scanResult, analyzing, dispatch]);

  useEffect(() => {
    if (picks.length === 0 && !analyzing) runAiPicks();
  }, [runAiPicks, picks.length, analyzing]);

  useEffect(() => {
    const timer = setInterval(runAiPicks, 2 * 1000);
    return () => clearInterval(timer);
  }, [runAiPicks]);

  const [chatOpen, setChatOpen] = useState(false);
  const hasRisk    = summary && summary.concentrationRisk.risks.length > 0;
  const breadthPct = breadth ? Math.round((breadth.advancing / Math.max(1, breadth.total)) * 100) : 0;
  const isBullish  = breadth ? breadth.advancing > breadth.declining : null;

  return (
    <div className="dashboard-layout-grid">
      {/* ── LEFT MAIN COLUMN ── */}
      <div className="dashboard-main-col">
        {/* ── GREETING ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }} className="dash-muted">
            {getGreeting()}, {user?.fullName?.split(' ')[0] ?? 'Trader'}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, color: 'var(--text)', lineHeight: 1.1 }}>
            What should you trade today?
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Your AI has scanned{' '}
            <span className="dash-primary" style={{ fontWeight: 700 }}>312 stocks</span>,{' '}
            <span className="dash-primary" style={{ fontWeight: 700 }}>18 sectors</span>, and{' '}
            <span className="dash-primary" style={{ fontWeight: 700 }}>4,820 options</span> since market open.
            {scanResult?.regime && (
              <>
                {' · '}
                <span style={{ color: 'var(--amber)', fontWeight: 700 }}>Risk: {scanResult.regime}</span>
              </>
            )}
          </p>
        </div>

        {/* ── STAT CARDS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          <StatBox
            label="Portfolio Value"
            value={formatCurrency(summary?.currentValue) ?? '—'}
            sub={summary ? `↑ ${formatCurrency(summary.totalPnl)}` : undefined}
            subVariant="positive"
          />
          <StatBox
            label="Today's P&L"
            value={summary ? formatCurrency(summary.totalPnl) : '—'}
            sub={summary ? formatPct(summary.pnlPct) : undefined}
            subVariant={summary && summary.totalPnl >= 0 ? 'positive' : 'negative'}
          />
          <StatBox
            label="Open Positions"
            value={summary ? `${summary.holdingsCount}` : '—'}
            sub={summary ? `${summary.holdingsCount} in profit` : undefined}
            subVariant="primary"
          />
          <StatBox
            label="Risk Score"
            value={summary ? `${summary.diversificationScore} / 100` : '—'}
            sub={summary
              ? summary.diversificationScore >= 70
                ? 'Moderate'
                : summary.diversificationScore >= 50
                ? 'Elevated'
                : 'High Risk'
              : undefined}
            subVariant={summary
              ? summary.diversificationScore >= 70
                ? 'muted'
                : summary.diversificationScore >= 50
                ? 'muted'
                : 'negative'
              : 'muted'}
          />
        </div>

        {/* ── MARKET MOOD + TODAY'S STRATEGY ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 18 }}>
          {/* Market Mood */}
          <div className="dash-card">
            <div className="dash-section-label">Market Mood</div>
            {breadth ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div>
                    <div style={{
                      fontSize: 24,
                      fontWeight: 900,
                      fontStyle: 'italic',
                      lineHeight: 1,
                      color: isBullish === true ? 'var(--positive)' : isBullish === false ? 'var(--negative)' : 'var(--text-muted)',
                    }}>
                      {isBullish === true ? 'Bullish' : isBullish === false ? 'Bearish' : 'Sideways'}
                    </div>
                    <div className="dash-muted" style={{ fontSize: 11, marginTop: 3 }}>with caution</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="dash-section-label" style={{ marginBottom: 2 }}>CONFIDENCE</div>
                    <div className="dash-primary" style={{ fontSize: 24, fontWeight: 900 }}>{breadthPct}%</div>
                  </div>
                </div>

                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                  Broad participation from banking &amp; IT. Volatility compressing. Momentum favours intraday longs.
                </p>

                {/* Breadth Bar */}
                <div className="dash-mood-bar">
                  <div className="dash-mood-bar-adv" style={{ flex: breadth.advancing }} />
                  <div className="dash-mood-bar-unch" style={{ flex: breadth.unchanged }} />
                  <div className="dash-mood-bar-decl" style={{ flex: breadth.declining }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontFamily: 'monospace', fontWeight: 700 }} className="dash-muted">
                  <span>BEARISH</span>
                  <span>SIDEWAYS</span>
                  <span>BULLISH</span>
                </div>
              </>
            ) : (
              <EmptyState title="Loading breadth data…" />
            )}
          </div>

          {/* Today's Strategy */}
          <div className="dash-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="dash-section-label" style={{ marginBottom: 0 }}>Today's Strategy</div>
              <Pill label="HIGH CONVICTION" variant="green" />
            </div>
            {aiTop ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, marginBottom: 14 }}>
                  {aiTop.oneLiner ?? `${aiTop.symbol} — ${aiTop.finalSignal}`}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div className="dash-section-label" style={{ marginBottom: 2 }}>CONFIDENCE</div>
                    <div className="dash-primary" style={{ fontSize: 18, fontWeight: 900 }}>{aiTop.overallScore}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="dash-section-label" style={{ marginBottom: 2 }}>RISK</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--amber)' }}>{aiTop.confidence}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div className="dash-section-label" style={{ marginBottom: 2 }}>HORIZON</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-muted)' }}>Intraday</div>
                  </div>
                </div>

                <Link
                  to="/ai-picks"
                  className="dash-btn dash-btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '9px 0', fontSize: 12.5, borderRadius: 10 }}
                >
                  View Playbook →
                </Link>
              </>
            ) : analyzing ? (
              <Spinner label="TradePanda AI analyzing setups…" />
            ) : (
              <EmptyState title="No strategy yet" hint="Click 'Get AI Picks' below" />
            )}
          </div>
        </div>

        {/* ── TOP OPPORTUNITIES ── */}
        <DCard
          title="Top Opportunities"
          action={
            <>
              {scanning && <Spinner />}
              <Btn to="/radar">Open Radar ↗</Btn>
              <Btn primary onClick={runAiPicks}>
                {analyzing ? 'Analyzing…' : 'Get AI Picks'}
              </Btn>
            </>
          }
        >
          {scanResult ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                Ranked by conviction × edge
                {scanResult.regime && <Pill label={`Regime: ${scanResult.regime}`} />}
                {lastUpdated && <span style={{ marginLeft: 'auto' }}>Updated {formatTimeAgo(lastUpdated)}</span>}
              </div>

              {/* Table Header */}
              <div className="dash-opp-table-header">
                <div>STOCK</div>
                <div>PRICE</div>
                <div>SCORE</div>
                <div>CONF.</div>
                <div>RISK</div>
                <div>AI VIEW</div>
              </div>

              {top.map((o, idx) => {
                const aiPick = picks.find((p) => p.symbol === o.symbol);
                return (
                  <div
                    key={o.symbol}
                    className={`dash-opp-row${idx === 0 ? ' top-pick' : ''}`}
                  >
                    <div style={{ fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {idx === 0 && (
                        <span style={{ fontSize: 8, background: '#2563eb', color: 'white', borderRadius: 4, padding: '1px 5px', fontFamily: 'monospace', fontWeight: 800 }}>
                          TOP
                        </span>
                      )}
                      {o.symbol}
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{formatCurrency(o.price)}</div>
                    <div style={{ fontWeight: 900, color: 'var(--primary)', fontSize: 14 }}>{o.convictionScore}</div>
                    <div>
                      <Pill
                        label={aiPick?.confidence ?? 'Med'}
                        variant={aiPick?.confidence === 'High' ? 'green' : 'amber'}
                      />
                    </div>
                    <div className="dash-muted" style={{ fontSize: 11 }}>Moderate</div>
                    <div>
                      <Pill
                        label={o.signal}
                        variant={o.signal.includes('BUY') ? 'green' : o.signal.includes('AVOID') ? 'red' : 'blue'}
                      />
                    </div>
                  </div>
                );
              })}

              {top.length === 0 && <EmptyState title="No scan results yet" hint="Run a scan from the Radar page" />}
            </>
          ) : (
            <EmptyState title="No scan results yet" hint="Run a scan from the Radar page" />
          )}
        </DCard>

        {/* ── WATCHLIST + INDICES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 18 }}>
          {/* Watchlist */}
          <DCard title="Watchlist" action={<Btn to="/watchlist">Manage</Btn>}>
            {watchlist && watchlist.items.length > 0 ? (
              watchlist.items.slice(0, 6).map((item) => (
                <div key={item.symbol} className="dash-row">
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{item.symbol}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                      {formatCurrency(item.lastPrice)}
                    </span>
                    <span className={item.changePct >= 0 ? 'dash-pill dash-pill-green' : 'dash-pill dash-pill-red'}>
                      {formatPct(item.changePct)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="Watchlist is empty" hint="Add symbols from the Watchlist page" />
            )}
          </DCard>

          {/* Market Indices */}
          <DCard title="Market Indices" action={<Btn to="/market">View All</Btn>}>
            {indices.length === 0 ? (
              <Spinner />
            ) : (
              indices.slice(0, 6).map((idx) => (
                <div key={idx.symbol} className="dash-row">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{idx.symbol}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{idx.instrumentType}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, fontFamily: 'monospace', color: 'var(--text)' }}>
                      {formatNumber(idx.level)}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'monospace', color: idx.changePct >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                      {formatPct(idx.changePct)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </DCard>
        </div>

        {/* ── CONCENTRATION RISK ── */}
        {hasRisk && (
          <DCard title="Concentration Risk">
            {summary.concentrationRisk.risks.map((r, i) => (
              <div key={i} className="dash-risk-row">
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--negative)' }}>{r.symbol ?? r.sector}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.type} · {r.message}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, height: 5, borderRadius: 3, background: 'var(--bg-elev-2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${r.weightPct}%`, background: r.weightPct > 30 ? 'var(--negative)' : 'var(--amber)' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--negative)', fontFamily: 'monospace', minWidth: 36 }}>
                    {r.weightPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </DCard>
        )}
      </div>

      {/* ── RIGHT DEDICATED TRADEPANDA DESK COLUMN ── */}
      <div className="dashboard-side-col">
        <TradePandaDesk onExpand={() => setChatOpen(true)} />
      </div>

      {/* ── TRADEPANDA FULL-SCREEN CHAT MODAL ── */}
      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}