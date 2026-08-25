import { useEffect, useState } from 'react';
import { apiClient, apiErrorMessage } from '../api/client';
import { Card, StatCard, Table, Spinner, ErrorBox } from './ui';
import { formatCurrency } from '../lib/format';

interface Prediction {
  id: string;
  symbol: string;
  date: string;
  predictionTimestamp?: string;
  predictionPrice: number | null;
  directionalOutlook: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null;
  directionalScore?: number | null;
  signal?: string | null;
  tradeStatus?: string | null;
  expectedMovePct?: number | null;
  baseCase?: number | null;
  target1?: number | null;
  target2?: number | null;
  invalidationPrice?: number | null;
  stopLoss?: number | null;
  marketRegime?: string | null;
  score?: number | null;
  evidenceQualityScore?: number | null;
  isFinalForDay?: boolean;
  status: 'OPEN' | 'CLOSED' | 'INVALID';

  // Evaluation fields
  actualClose?: number | null;
  actualHigh?: number | null;
  actualLow?: number | null;
  actualReturnPct?: number | null;
  actualDirection?: string | null;
  directionCorrect?: boolean | null;
  predictionResult?: string | null;
  closeErrorPct?: number | null;
  absoluteErrorPct?: number | null;
  closeErrorRs?: number | null;
  target1Hit?: boolean | null;
  target2Hit?: boolean | null;
  invalidationHit?: boolean | null;
  validationStatus?: string | null;
  evaluatedAt?: string | null;
}

interface RollingStat {
  window: number;
  sampleSize: number;
  sufficientSample: boolean;
  correct: number;
  wrong: number;
  directionAccuracyPct: number | null;
  directionAccuracyLabel: string;
  bullish: { total: number; correct: number; accuracyPct: number | null };
  bearish: { total: number; correct: number; accuracyPct: number | null };
  neutral: { total: number; correct: number; accuracyPct: number | null };
  executableTrades: { total: number; correct: number; accuracyPct: number | null; label: string };
  target1Hits: number;
  target2Hits: number;
  invalidationHits: number;
  avgAbsoluteErrorPct: number | null;
}

interface DailyStats {
  date: string;
  totalPredictions: number;
  evaluatedPredictions: number;
  correct: number;
  wrong: number;
  accuracyPct: number | null;
  bullishPredictions: number;
  bullishCorrect: number;
  bearishPredictions: number;
  bearishCorrect: number;
  neutralPredictions: number;
  neutralCorrect: number;
  target1Hits: number;
  target2Hits: number;
  invalidationHits: number;
  averageAbsoluteErrorPct: number | null;
}

interface StatsResponse {
  daily: DailyStats;
  rolling: {
    last10: RollingStat;
    last25: RollingStat;
    last50: RollingStat;
    last100: RollingStat;
    last250: RollingStat;
  };
  overall: RollingStat;
  warnings: string[];
  open: number;
  totalRecorded: number;
}

export function PredictionTrackerPanel() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [predsRes, statsRes] = await Promise.all([
        apiClient.get<{ predictions: Prediction[] }>('/ai/predictions'),
        apiClient.get<{ stats: StatsResponse }>('/ai/predictions/stats'),
      ]);
      setPredictions([...predsRes.data.predictions].reverse());
      setStats(statsRes.data.stats);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredPredictions = filterSymbol
    ? predictions.filter((p) => p.symbol.toUpperCase().includes(filterSymbol.toUpperCase()))
    : predictions;

  if (loading) return <Spinner label="Loading prediction verification data..." />;
  if (error) return <ErrorBox message={error} onRetry={fetchData} />;

  const daily = stats?.daily;
  const rolling = stats?.rolling;

  return (
    <div className="prediction-tracker-panel" style={{ marginTop: '2rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>🎯 Real-Time Prediction Verification & Close Tracker</h2>
          <p className="muted small">
            Every market-hours prediction is saved as an immutable snapshot. Evaluated daily at 15:30 IST against verified NSE closing OHLC data.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={fetchData}>
          ↻ Refresh Verification Data
        </button>
      </div>

      {stats?.warnings && stats.warnings.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {stats.warnings.map((warn, i) => (
            <div
              key={i}
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: warn.includes('MODEL WARNING') ? '#fef2f2' : '#fffbeb',
                color: warn.includes('MODEL WARNING') ? '#991b1b' : '#92400e',
                borderLeft: `4px solid ${warn.includes('MODEL WARNING') ? '#ef4444' : '#f59e0b'}`,
                borderRadius: '0.375rem',
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              ⚠️ {warn}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard
          label="Today's Verified Accuracy"
          value={daily?.accuracyPct != null ? `${daily.accuracyPct}%` : 'N/A'}
          sub={`${daily?.correct ?? 0} / ${daily?.evaluatedPredictions ?? 0} evaluated`}
          tone={daily?.accuracyPct != null && daily.accuracyPct >= 60 ? 'sg-good' : ''}
        />
        <StatCard
          label="Overall Directional Edge"
          value={
            stats?.overall.sufficientSample
              ? `${stats.overall.directionAccuracyPct}%`
              : 'Insufficient Data'
          }
          sub={stats?.overall.directionAccuracyLabel}
          tone={stats?.overall.sufficientSample && (stats?.overall.directionAccuracyPct ?? 0) >= 60 ? 'sg-good' : ''}
        />
        <StatCard
          label="Executable Trades Accuracy"
          value={
            stats?.overall.executableTrades.accuracyPct != null
              ? `${stats.overall.executableTrades.accuracyPct}%`
              : 'N/A'
          }
          sub={stats?.overall.executableTrades.label}
        />
        <StatCard
          label="Avg Price Forecast Error"
          value={daily?.averageAbsoluteErrorPct != null ? `±${daily.averageAbsoluteErrorPct}%` : 'N/A'}
          sub="Close price projection offset"
        />
      </div>

      {rolling && (
        <Card title="Rolling Performance Metrics (Verified Closes)" className="mb-6" style={{ marginBottom: '1.5rem' }}>
          <Table headers={['Window', 'Evaluated Sample', 'Direction Accuracy', 'Bullish Acc', 'Bearish Acc', 'Executable Trade Acc', 'Avg Close Error']}>
            {[rolling.last10, rolling.last25, rolling.last50, rolling.last100, rolling.last250].map((r) => (
              <tr key={r.window}>
                <td style={{ fontWeight: 600 }}>Last {r.window} Predictions</td>
                <td>{r.sampleSize} predictions</td>
                <td>
                  {r.sufficientSample ? (
                    <span style={{ color: (r.directionAccuracyPct ?? 0) >= 60 ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
                      {r.directionAccuracyPct}% ({r.correct}/{r.sampleSize})
                    </span>
                  ) : (
                    <span className="muted small">Insufficient sample size ({r.sampleSize}/30)</span>
                  )}
                </td>
                <td>
                  {r.bullish.total > 0 ? (
                    `${r.bullish.accuracyPct ?? 0}% (${r.bullish.correct}/${r.bullish.total})`
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.bearish.total > 0 ? (
                    `${r.bearish.accuracyPct ?? 0}% (${r.bearish.correct}/${r.bearish.total})`
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {r.executableTrades.total >= 30 ? (
                    `${r.executableTrades.accuracyPct}% (${r.executableTrades.correct}/${r.executableTrades.total})`
                  ) : r.executableTrades.total > 0 ? (
                    <span className="muted small">{r.executableTrades.correct}/{r.executableTrades.total} (sample &lt; 30)</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{r.avgAbsoluteErrorPct != null ? `±${r.avgAbsoluteErrorPct}%` : '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card
        title={`Saved Prediction Snapshots (${predictions.length})`}
        action={
          <input
            type="text"
            placeholder="Filter by symbol..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="input input-sm"
            style={{ width: '180px' }}
          />
        }
      >
        {filteredPredictions.length === 0 ? (
          <p className="muted small" style={{ padding: '1rem', textAlign: 'center' }}>
            No prediction snapshots recorded yet. Run an analysis on a stock during market hours to auto-record a snapshot.
          </p>
        ) : (
          <Table headers={['Date / Symbol', 'Outlook & Score', 'Pred Price', 'Expected Range', 'Actual Close', 'Direction Result', 'Close Error', 'Target 1', 'Invalidation']}>
            {filteredPredictions.map((p) => {
              const resultColor =
                p.predictionResult === 'CORRECT' || p.predictionResult === 'NEUTRAL_CORRECT'
                  ? '#10b981'
                  : p.predictionResult === 'WRONG' || p.predictionResult === 'NEUTRAL_WRONG'
                  ? '#ef4444'
                  : '#f59e0b';
              const resultText =
                p.predictionResult === 'CORRECT'
                  ? '✅ CORRECT'
                  : p.predictionResult === 'NEUTRAL_CORRECT'
                  ? '⚖️ NEUTRAL CORRECT'
                  : p.predictionResult === 'WRONG'
                  ? '❌ WRONG'
                  : p.predictionResult === 'NEUTRAL_WRONG'
                  ? '❌ NEUTRAL WRONG'
                  : p.predictionResult === 'DATA_INVALID'
                  ? '⚠️ INVALID DATA'
                  : '⏳ AWAITING CLOSE';

              return (
                <tr key={p.id}>
                  <td>
                    <div>
                      <strong style={{ fontSize: '0.95rem' }}>{p.symbol}</strong>
                      {p.isFinalForDay && <span style={{ marginLeft: '6px', fontSize: '0.7rem', padding: '2px 4px', backgroundColor: '#e0e7ff', color: '#3730a3', borderRadius: '4px' }}>FINAL</span>}
                    </div>
                    <div className="muted small">{p.date}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, color: p.directionalOutlook === 'BULLISH' ? '#10b981' : p.directionalOutlook === 'BEARISH' ? '#ef4444' : '#6b7280' }}>
                      {p.directionalOutlook ?? 'NEUTRAL'}
                    </div>
                    <div className="muted small">
                      {p.signal ?? 'N/A'} ({p.score ?? '—'}/100)
                    </div>
                  </td>
                  <td>{p.predictionPrice != null ? formatCurrency(p.predictionPrice) : '—'}</td>
                  <td>
                    {p.baseCase != null ? formatCurrency(p.baseCase) : '—'}
                    {p.expectedMovePct != null && (
                      <div className="muted small">
                        ({p.expectedMovePct >= 0 ? '+' : ''}
                        {p.expectedMovePct.toFixed(2)}%)
                      </div>
                    )}
                  </td>
                  <td>
                    {p.actualClose != null ? (
                      <div>
                        <strong>{formatCurrency(p.actualClose)}</strong>
                        {p.actualReturnPct != null && (
                          <div className="muted small" style={{ color: p.actualReturnPct >= 0 ? '#10b981' : '#ef4444' }}>
                            {p.actualReturnPct >= 0 ? '+' : ''}
                            {p.actualReturnPct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="muted small">Open</span>
                    )}
                  </td>
                  <td>
                    <span style={{ color: resultColor, fontWeight: 600 }}>{resultText}</span>
                  </td>
                  <td>
                    {p.absoluteErrorPct != null ? `±${p.absoluteErrorPct}%` : '—'}
                  </td>
                  <td>
                    {p.target1Hit === true ? (
                      <span style={{ color: '#10b981' }}>✅ Hit</span>
                    ) : p.target1Hit === false ? (
                      <span style={{ color: '#ef4444' }}>❌ Missed</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {p.invalidationHit === true ? (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>⚠️ Hit</span>
                    ) : p.invalidationHit === false ? (
                      <span style={{ color: '#10b981' }}>✅ Safe</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
