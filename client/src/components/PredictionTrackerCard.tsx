import { Card } from '../components/ui';
import type { PredictionPerformance } from '../lib/types';

function PredictionTrackerCard({ performance }: { performance: PredictionPerformance }) {
  const overall = (performance.performance?.overall ?? {}) as Record<string, unknown>;
  const records = performance.predictions ?? [];
  const recent = [...records].reverse().slice(0, 8);

  return (
    <Card title="Prediction tracker & weekly check">
      <div className="tracker-stats">
        <span>Win rate: <b>{String(overall.winRate ?? '—')}%</b></span>
        <span>Partial: <b>{String(overall.partialRate ?? '—')}%</b></span>
        <span>Avg error: <b>{String(overall.avgPredictionError ?? '—')}%</b></span>
        <span>Avg return: <b>{String(overall.avgReturn ?? '—')}%</b></span>
        <span>False BUY: <b>{String(overall.falseBuyRate ?? '—')}%</b></span>
        <span>Tracked: <b>{String(overall.total ?? 0)}</b></span>
      </div>
      {recent.length === 0 ? (
        <p className="muted small">No predictions recorded yet. Use “Record” on a stock to start tracking.</p>
      ) : (
        <div className="risers-table">
          <div className="risers-head">
            <span>Date</span>
            <span>Stock</span>
            <span>Base ₹</span>
            <span>Close ₹</span>
            <span>Result</span>
          </div>
          {recent.map((r) => (
            <div className="risers-row" key={r.id}>
              <span className="muted small">{r.date}</span>
              <span className="strong">{r.symbol}</span>
              <span>{r.baseCase != null ? `₹${r.baseCase}` : '—'}</span>
              <span>{r.actualClose != null ? `₹${r.actualClose}` : '—'}</span>
              <span className={`tracker-result tracker-${String(r.result ?? 'OPEN').toLowerCase()}`}>
                {r.result ?? r.status}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>
        WIN = close ≥ base case · PARTIAL = inside range · LOSS = below range · STOPPED = stop hit.
        Optimised for risk-adjusted returns, not just win count.
      </p>
    </Card>
  );
}

export default PredictionTrackerCard;
