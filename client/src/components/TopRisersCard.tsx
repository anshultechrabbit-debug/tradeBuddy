import { Card } from '../components/ui';
import { formatCurrency } from '../lib/format';
import type { RiserCandidate, ActionableSetup } from '../lib/types';

function TopRisersCard({
  candidates,
  actionable,
}: {
  candidates: RiserCandidate[];
  actionable: ActionableSetup[];
}) {
  return (
    <Card title="TOP 5 CANDIDATES">
      {candidates.length === 0 ? (
        <p className="muted small">No candidate data available right now.</p>
      ) : (
        <>
          <div className="risers-table">
            <div className="risers-head">
              <span>#</span>
              <span>Stock</span>
              <span>Score</span>
              <span>Signal</span>
              <span>Trade</span>
            </div>
            {candidates.map((p, i) => (
              <div className="risers-row" key={p.symbol}>
                <span className="strong">{i + 1}</span>
                <span>
                  <span className="strong">{p.symbol}</span>{' '}
                  <span className="muted small">{p.companyName}</span>
                </span>
                <span>{p.score}</span>
                <span className={p.signal.includes('BUY') ? 'text-positive' : ''}>{p.signal}</span>
                <span className="muted small">{p.tradeStatus}</span>
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 14, marginBottom: 6 }}>ACTIONABLE BUY SETUPS</h4>
          {actionable.length === 0 ? (
            <p className="muted small">NO ACTIONABLE BUY SETUPS TODAY. (This is a valid outcome — quality over quantity.)</p>
          ) : (
            <div className="risers-table">
              <div className="risers-head">
                <span>Stock</span>
                <span>Entry ₹</span>
                <span>T1 ₹</span>
                <span>Stop ₹</span>
                <span>R:R</span>
              </div>
              {actionable.map((p) => (
                <div className="risers-row" key={p.symbol}>
                  <span className="strong">{p.symbol}</span>
                  <span>{p.entry ? `${formatCurrency(p.entry[0])}–${formatCurrency(p.entry[1])}` : '—'}</span>
                  <span className="text-positive">{p.target1 != null ? formatCurrency(p.target1) : '—'}</span>
                  <span className="text-negative">{p.stopLoss != null ? formatCurrency(p.stopLoss) : '—'}</span>
                  <span>{p.riskReward != null ? `${p.riskReward}:1` : '—'}</span>
                </div>
              ))}
            </div>
          )}
          <p className="muted small" style={{ marginTop: 8 }}>
            Candidates are ranked by signal score. Only names passing every tradeability gate (risk/reward ≥ 1:2,
            volume confirmation, liquidity, ≥3 agreeing signals) appear in Actionable Setups. Never forced to five.
          </p>
        </>
      )}
    </Card>
  );
}

export default TopRisersCard;
