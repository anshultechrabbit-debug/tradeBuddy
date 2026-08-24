import { Card } from '../components/ui';
import type { MarketPrediction, MarketPredictionTrack } from '../lib/types';

const DIR_LABEL: Record<string, string> = {
  RISE: 'Market will RISE today',
  FALL: 'Market will FALL today',
  FLAT: 'Market will stay FLAT today',
};
const DIR_TONE: Record<string, string> = {
  RISE: 'mp-rise',
  FALL: 'mp-fall',
  FLAT: 'mp-flat',
};
const OUTCOME_LABEL: Record<string, string> = {
  PENDING: 'not decided yet',
  CORRECT: 'on track ✓',
  WRONG: 'missed ✗',
};

function MarketPredictionCard({
  today,
  track,
}: {
  today: MarketPrediction;
  track: MarketPredictionTrack;
}) {
  const tone = DIR_TONE[today.direction] ?? 'mp-flat';
  const actual = today.actualChangePct;
  const actualText =
    actual == null ? '—' : `${actual >= 0 ? '+' : ''}${actual}% (actual so far)`;
  const marketPrice = today.actualNiftyLevel;
  const marketChange = today.actualChangePct;

  return (
    <Card title="Today's market prediction">
      <div className={`mp-card ${tone}`}>
        <div className="mp-head">
          <span className="mp-dir">{DIR_LABEL[today.direction] ?? today.direction}</span>
          <span className="mp-conf">confidence {today.confidence}/100</span>
        </div>
        {marketPrice != null ? (
          <div className="mp-price">
            <span className="muted small">Market price (Nifty 50):</span>{' '}
            <span className="strong">{`₹${Number(marketPrice).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}</span>
            {marketChange != null ? (
              <span className={marketChange >= 0 ? ' text-positive' : ' text-negative'}>
                {' '}
                {marketChange >= 0 ? '+' : ''}
                {marketChange}%
              </span>
            ) : null}
          </div>
        ) : null}
        <p className="mp-reason">{today.reason}</p>
        <div className="mp-actual">
          <span className="muted small">Actual (app feed): </span>
          <span className="strong">{actualText}</span>
          <span className={`mp-outcome ${today.outcome === 'CORRECT' ? 'text-positive' : today.outcome === 'WRONG' ? 'text-negative' : 'muted'}`}>
            {' '}
            {OUTCOME_LABEL[today.outcome] ?? today.outcome}
          </span>
        </div>
        <p className="mp-disclaimer muted small">
          Compare the actual % with Nifty on Groww / TradingView to double-check. This is an algorithmic
          read, not a guarantee.
        </p>
      </div>

      {track.decidedCount > 0 ? (
        <div className="mp-track">
          <div className="mp-track-head">
            <span className="strong">Track record</span>
            <span className="muted small">
              correct {track.correctCount}/{track.decidedCount} days · accuracy{' '}
              {track.accuracy != null ? `${track.accuracy}%` : '—'}
            </span>
          </div>
          <div className="mp-track-row">
            {track.records.slice(0, 10).map((r) => (
              <span
                key={r.tradeDate}
                className={`mp-pip ${
                  r.outcome === 'CORRECT' ? 'mp-pip-good' : r.outcome === 'WRONG' ? 'mp-pip-bad' : 'mp-pip-pending'
                }`}
                title={`${r.tradeDate}: ${r.direction} (${r.outcome})`}
              >
                {r.direction[0]}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export default MarketPredictionCard;
