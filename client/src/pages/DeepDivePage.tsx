import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import type { DeepDive } from '../lib/types';
import { Card, Badge, Spinner, EmptyState, ProgressBar, ErrorBox } from '../components/ui';
import { formatCurrency, formatNumber, formatPct, signalBadgeClass, regimeBadgeClass } from '../lib/format';
import { useFetch } from '../hooks/useFetch';

export function DeepDivePage() {
  const { symbol } = useParams<{ symbol: string }>();
  const { data, loading, error, load } = useFetch<DeepDive>(() =>
    apiClient.get(`/radar/symbols/${symbol}/detail`).then((r) => r.data)
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Deep Dive · {symbol}</h1>
        {data ? <Badge className={signalBadgeClass(data.signal)}>{data.signal}</Badge> : null}
      </header>

      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {loading ? (
        <Spinner label="Analyzing…" />
      ) : data ? (
        <>
          <div className="stat-grid">
            <Stat label="Last Price" value={formatCurrency(data.lastPrice)} />
            <Stat label="Conviction" value={<span>{data.convictionScore}/100</span>} sub={<ProgressBar value={data.convictionScore} />} />
            <Stat label="Regime" value={<Badge className={regimeBadgeClass(data.regime)}>{data.regime}</Badge>} />
            <Stat label="RSI(14)" value={formatNumber(data.features.rsi14)} />
          </div>

          <div className="grid-2">
            <Card title="Features">
              <div className="feature-grid">
                <Feature label="SMA 20" value={formatCurrency(data.features.sma20)} />
                <Feature label="SMA 50" value={formatCurrency(data.features.sma50)} />
                <Feature label="SMA 200" value={formatCurrency(data.features.sma200)} />
                <Feature label="EMA 20" value={formatCurrency(data.features.ema20)} />
                <Feature label="ATR(14)" value={formatCurrency(data.features.atr14)} />
                <Feature label="ROC(10)" value={formatPct(data.features.roc10)} />
                <Feature label="ROC(20)" value={formatPct(data.features.roc20)} />
                <Feature label="Z-Score" value={formatNumber(data.features.zscore)} />
                <Feature label="Daily Vol" value={formatPct(data.features.dailyVolatilityPct)} />
                <Feature label="An. Vol" value={formatPct(data.features.annualizedVolatilityPct)} />
                <Feature label="Vol Ratio" value={formatNumber(data.features.volumeRatio)} />
                <Feature label="20D Return" value={formatPct(data.features.ret20)} />
                <Feature label="Rel. Strength" value={formatNumber(data.features.relativeStrength)} />
                <Feature label="Breakout" value={data.features.breakout ? `${formatPct(data.features.breakoutPct)} above` : 'No'} />
              </div>
            </Card>

            <Card title="Sub-scores">
              <SubScore label="Trend" value={data.features.subscores.trend} />
              <SubScore label="Momentum" value={data.features.subscores.momentum} />
              <SubScore label="Volume" value={data.features.subscores.volume} />
              <SubScore label="Relative Strength" value={data.features.subscores.relativeStrength} />
              <SubScore label="Volatility" value={data.features.subscores.volatility} />
              <SubScore label="Breadth" value={data.features.subscores.breadth} />
            </Card>
          </div>

          <Card title="Analysis">
            <div className="analysis-list">
              <div><span className="muted">Trend:</span> <strong>{data.deepDive.trendStrength}</strong></div>
              <div><span className="muted">Momentum:</span> <strong>{data.deepDive.momentum}</strong></div>
              <div><span className="muted">Volume:</span> <strong>{data.deepDive.volumeConfirmation}</strong></div>
              <div><span className="muted">Volatility:</span> <strong>{data.deepDive.volatilityScore}</strong></div>
              <div><span className="muted">Breakout:</span> <strong>{data.deepDive.breakoutScore}</strong></div>
              <div><span className="muted">Relative strength:</span> <strong>{data.deepDive.relativeStrength}</strong></div>
            </div>
            <div className="reason-box">
              <div className="muted small">Reason</div>
              <p>{data.reason}</p>
            </div>
          </Card>

          {data.deepDive.technicalSignals.length > 0 ? (
            <Card title="Technical Signals">
              <div className="chip-row">
                {data.deepDive.technicalSignals.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState title="No data for this symbol" />
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function Feature({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="feature">
      <span className="muted small">{label}</span>
      <span className="strong">{value}</span>
    </div>
  );
}

function SubScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="subscore">
      <div className="flex-1">
        <span className="small">{label}</span>
        <ProgressBar value={value} />
      </div>
      <span className="strong small">{value}</span>
    </div>
  );
}