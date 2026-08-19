import { FormEvent, useState } from 'react';
import { apiClient, apiErrorMessage } from '../api/client';
import type { Recommendation } from '../lib/types';
import { Card, Badge, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatDateTime, signalBadgeClass } from '../lib/format';
import { useEffect } from 'react';

export function StrategyPage() {
  const [symbol, setSymbol] = useState('RELIANCE');
  const [result, setResult] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    recommend(symbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function recommend(sym: string) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.post<Recommendation>('/strategy/recommend', { symbol: sym.toUpperCase() });
      setResult(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    recommend(symbol);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Strategy Router</h1>
      </header>

      <Card title="Get recommendation">
        <form onSubmit={handleSubmit} className="form form-inline">
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Symbol (e.g. RELIANCE)" />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Spinner /> : 'Recommend'}
          </button>
        </form>
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      {result ? (
        <>
          <div className="stat-grid">
            <div className="card stat-card">
              <div className="stat-label">Recommendation</div>
              <div className="stat-value">
                <Badge className={signalBadgeClass(result.recommendation)}>{result.recommendation}</Badge>
              </div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">Confidence</div>
              <div className="stat-value">{(result.confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">Conviction Score</div>
              <div className="stat-value">{result.convictionScore}/100</div>
            </div>
            <div className="card stat-card">
              <div className="stat-label">Source</div>
              <div className="stat-value small">{result.source}</div>
            </div>
          </div>

          <Card title="Reason">
            <p>{result.reason}</p>
            <div className="muted small">Generated {formatDateTime(result.timestamp)}</div>
          </Card>

          {result.supportingSignals.length > 0 ? (
            <Card title="Supporting Signals">
              {result.supportingSignals.map((s) => (
                <div key={s.symbol} className="opportunity-row">
                  <div>
                    <span className="strong">{s.symbol}</span>
                    <span className="muted small"> · conviction {s.convictionScore}</span>
                  </div>
                  <div className="ta-right">
                    <Badge className={signalBadgeClass(s.signal)}>{s.signal}</Badge>
                    <div className="muted small">{s.regime}</div>
                  </div>
                </div>
              ))}
            </Card>
          ) : null}
        </>
      ) : (
        !loading && !error && <EmptyState title="Enter a symbol to get a recommendation" />
      )}
    </div>
  );
}