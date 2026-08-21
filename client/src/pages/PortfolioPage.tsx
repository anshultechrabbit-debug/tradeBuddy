import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchSummary,
  fetchHoldings,
  fetchSectors,
  syncPortfolio,
  fetchPortfolioReview,
  askPortfolioQuestion,
} from '../store/portfolioSlice';
import { Card, StatCard, Table, ProgressBar, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatCurrency, formatPct, formatNumber, pnlClass } from '../lib/format';

const ACTION_COLORS: Record<string, string> = {
  BUY_MORE: '#22c55e',
  HOLD: '#3b82f6',
  TRIM: '#f59e0b',
  SELL: '#ef4444',
};

const ACTION_LABELS: Record<string, string> = {
  BUY_MORE: '↑ Buy More',
  HOLD: '● Hold',
  TRIM: '↓ Trim',
  SELL: '✕ Sell',
};

export function PortfolioPage() {
  const dispatch = useAppDispatch();
  const { summary, holdings, sectors, loading, error, review, reviewLoading, reviewError, chatAnswer, chatLoading } =
    useAppSelector((s) => s.portfolio);

  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    dispatch(fetchSummary());
    dispatch(fetchHoldings());
    dispatch(fetchSectors());
    const timer = setInterval(() => {
      dispatch(fetchSummary());
      dispatch(fetchHoldings());
    }, 15000);
    return () => clearInterval(timer);
  }, [dispatch]);

  // Auto-load AI review once holdings are available — only once, don't loop on error
  useEffect(() => {
    if (holdings.length > 0 && !review && !reviewLoading && !reviewError) {
      dispatch(fetchPortfolioReview());
    }
  }, [holdings.length, review, reviewLoading, reviewError, dispatch]);

  function handleSync() {
    dispatch(syncPortfolio('mock')).then(() => {
      dispatch(fetchSummary());
      dispatch(fetchHoldings());
      dispatch(fetchSectors());
    });
  }

  function handleRefreshReview() {
    dispatch(fetchPortfolioReview());
  }

  function handleChat(e: React.FormEvent) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q) return;
    dispatch(askPortfolioQuestion(`Regarding my portfolio: ${q}`));
    setChatInput('');
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

      {/* ── AI ADVISOR SECTION ── */}
      <Card title="🤖 AI Portfolio Advisor">
        {reviewLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0' }}>
            <Spinner />
            <span className="muted">Analyzing your portfolio with live market data…</span>
          </div>
        ) : reviewError ? (
          <ErrorBox message={reviewError} />
        ) : review ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Overall score + narrative */}
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {review.portfolioScore != null && review.portfolioScore >= 0 && (
                <div
                  style={{
                    minWidth: 80,
                    textAlign: 'center',
                    background: 'var(--surface-2, rgba(255,255,255,0.05))',
                    borderRadius: 12,
                    padding: '12px 16px',
                  }}
                >
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color:
                        review.portfolioScore >= 70
                          ? '#22c55e'
                          : review.portfolioScore >= 40
                          ? '#f59e0b'
                          : '#ef4444',
                    }}
                  >
                    {review.portfolioScore}
                  </div>
                  <div className="muted small">Portfolio Score</div>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, lineHeight: 1.6 }}>{review.overallNarrative}</p>
                {review.rebalancing && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 14px',
                      background: 'rgba(59,130,246,0.08)',
                      borderRadius: 8,
                      borderLeft: '3px solid #3b82f6',
                      fontSize: 13,
                    }}
                  >
                    <strong>Rebalancing Tip:</strong> {review.rebalancing}
                  </div>
                )}
              </div>
            </div>

            {/* Per-holding signals */}
            {review.holdings.length > 0 && (
              <div>
                <div className="muted small" style={{ marginBottom: 8 }}>
                  Per-Stock Recommendations
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 10,
                  }}
                >
                  {review.holdings.map((h) => (
                    <div
                      key={h.symbol}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        background: 'var(--surface-2, rgba(255,255,255,0.04))',
                        borderLeft: `4px solid ${ACTION_COLORS[h.action] ?? '#6b7280'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="strong">{h.symbol}</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: ACTION_COLORS[h.action] ?? '#6b7280',
                            background: `${ACTION_COLORS[h.action] ?? '#6b7280'}18`,
                            padding: '2px 8px',
                            borderRadius: 99,
                          }}
                        >
                          {ACTION_LABELS[h.action] ?? h.action}
                        </span>
                      </div>
                      <p className="muted small" style={{ margin: 0, lineHeight: 1.4 }}>
                        {h.reason}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              className="btn btn-outline"
              style={{ alignSelf: 'flex-start', fontSize: 13 }}
              onClick={handleRefreshReview}
              disabled={reviewLoading}
            >
              ↻ Refresh Analysis
            </button>
          </div>
        ) : (
          <EmptyState title="No AI analysis yet" hint="Loading once holdings are available…" />
        )}

        {/* Chat section */}
        <div style={{ marginTop: 20, borderTop: '1px solid var(--border, rgba(255,255,255,0.1))', paddingTop: 16 }}>
          <div className="muted small" style={{ marginBottom: 8 }}>
            Ask a question about your portfolio
          </div>
          <form onSubmit={handleChat} style={{ display: 'flex', gap: 8 }}>
            <input
              id="portfolio-ai-chat-input"
              type="text"
              className="input"
              style={{ flex: 1 }}
              placeholder='e.g. "Should I add more banking stocks?" or "Which holding is riskiest?"'
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button id="portfolio-ai-chat-send" className="btn btn-primary" type="submit" disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? '…' : 'Ask'}
            </button>
          </form>
          {chatLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <Spinner />
              <span className="muted small">Thinking…</span>
            </div>
          )}
          {chatAnswer && !chatLoading && (
            <div
              style={{
                marginTop: 12,
                padding: '12px 16px',
                background: 'var(--surface-2, rgba(255,255,255,0.04))',
                borderRadius: 10,
                lineHeight: 1.6,
                fontSize: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {chatAnswer}
            </div>
          )}
        </div>
      </Card>

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