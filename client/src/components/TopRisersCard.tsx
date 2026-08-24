import { useState } from 'react';
import { Card } from '../components/ui';
import { formatCurrency } from '../lib/format';
import type { PredictedRiser } from '../lib/types';

function buildSheet(risers: PredictedRiser[]): string {
  const now = new Date().toLocaleString();
  const lines = [
    'TradeBuddy — Evening verification sheet',
    `Snapshot taken: ${now}`,
    '',
    'Tonight on Groww, for each stock:',
    '  ✅ Correct  -> closing price >= Expected close AND never crossed below Stop',
    '  ❌ Wrong    -> closing price below Stop (or below Expected close)',
    '',
    '#  Stock       Live ₹     Expected close ₹   Stop ₹     Result',
  ];
  risers.forEach((p, i) => {
    const sym = p.symbol.padEnd(11, ' ');
    const live = (p.price != null ? p.price.toFixed(2) : '—').padStart(10, ' ');
    const exp = p.expectedClose.toFixed(2).padStart(12, ' ');
    const stop = (p.stopLoss != null ? p.stopLoss.toFixed(2) : '—').padStart(9, ' ');
    lines.push(`${i + 1}. ${sym}${live}${exp}${stop}   [   ]`);
  });
  return lines.join('\n');
}

function TopRisersCard({ risers }: { risers: PredictedRiser[] }) {
  const [copied, setCopied] = useState(false);

  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(buildSheet(risers));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card title="5 stocks predicted to rise today">
      {risers.length === 0 ? (
        <p className="muted small">No stocks currently meet the “rise today” criteria (buy signal + uptrend).</p>
      ) : (
        <>
          <div className="risers-table">
            <div className="risers-head">
              <span>#</span>
              <span>Stock</span>
              <span>Live ₹</span>
              <span>Expected close ₹</span>
              <span>Verify tonight</span>
            </div>
            {risers.map((p, i) => (
              <div className="risers-row" key={p.symbol}>
                <span className="strong">{i + 1}</span>
                <span>
                  <span className="strong">{p.symbol}</span>
                  <span className="muted small"> · {p.finalSignal}</span>
                </span>
                <span>{p.price != null ? formatCurrency(p.price) : '—'}</span>
                <span className="strong text-positive">{formatCurrency(p.expectedClose)}</span>
                <span className="muted small">
                  close ≥ {formatCurrency(p.expectedClose)} → ✅
                  {p.stopLoss != null ? ` · stop ₹${p.stopLoss}` : ''}
                </span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
            <button type="button" className="btn" onClick={copySheet}>
              {copied ? 'Copied!' : 'Copy for evening check'}
            </button>
            <p className="muted small" style={{ margin: 0 }}>
              Compares each “Expected close” with the actual closing price on Groww tonight. Correct if it
              closed at/above expected (and didn’t hit the stop).
            </p>
          </div>
        </>
      )}
    </Card>
  );
}

export default TopRisersCard;
