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
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterSymbol, setFilterSymbol] = useState('');

  async function loadData() {
    try {
      setLoading(true);
      setError(null);
      const [predsRes, statsRes] = await Promise.all([
        apiClient.get<Prediction[]>('/evaluation/predictions'),
        apiClient.get<StatsResponse>('/evaluation/stats'),
      ]);
      setPredictions(predsRes.data);
      setStats(statsRes.data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function triggerEvaluation() {
    try {
      setEvaluating(true);
      setError(null);
      await apiClient.post('/evaluation/evaluate');
      await loadData();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setEvaluating(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return <Spinner label="Loading TradePanda validation engine…" />;
  }

  const daily = stats?.daily;
  const rolling = stats?.rolling;

  const filteredPredictions = filterSymbol
    ? predictions.filter((p) => p.symbol.toLowerCase().includes(filterSymbol.toLowerCase()))
    : predictions;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-3xl bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-[#1c2541]">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <span>🎯</span> Prediction Accuracy & Calibration
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Strict verification against official market closing prices at 15:30 IST.
          </p>
        </div>
        <button
          onClick={triggerEvaluation}
          disabled={evaluating}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          {evaluating ? 'Evaluating…' : '⚡ Run Evaluation'}
        </button>
      </div>

      {error ? <ErrorBox message={error} /> : null}

      {stats?.warnings && stats.warnings.length > 0 && (
        <div className="space-y-2">
          {stats.warnings.map((warn, i) => (
            <div
              key={i}
              className={`p-3.5 rounded-2xl border text-xs font-semibold ${
                warn.includes('MODEL WARNING')
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300'
              }`}
            >
              ⚠️ {warn}
            </div>
          ))}
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Today's Accuracy"
          value={daily?.accuracyPct != null ? `${daily.accuracyPct}%` : 'N/A'}
          sub={`${daily?.correct ?? 0} / ${daily?.evaluatedPredictions ?? 0} evaluated`}
          tone={daily?.accuracyPct != null && daily.accuracyPct >= 60 ? 'text-emerald-500 dark:text-emerald-400' : ''}
        />
        <StatCard
          label="Overall Directional Edge"
          value={
            stats?.overall.sufficientSample
              ? `${stats.overall.directionAccuracyPct}%`
              : 'Collecting Data'
          }
          sub={stats?.overall.directionAccuracyLabel}
          tone={stats?.overall.sufficientSample && (stats?.overall.directionAccuracyPct ?? 0) >= 60 ? 'text-emerald-500 dark:text-emerald-400' : ''}
        />
        <StatCard
          label="Executable Accuracy"
          value={
            stats?.overall.executableTrades.accuracyPct != null
              ? `${stats.overall.executableTrades.accuracyPct}%`
              : 'N/A'
          }
          sub={stats?.overall.executableTrades.label}
        />
        <StatCard
          label="Avg Price Error"
          value={daily?.averageAbsoluteErrorPct != null ? `±${daily.averageAbsoluteErrorPct}%` : 'N/A'}
          sub="Close projection offset"
        />
      </div>

      {/* Rolling Stats Table */}
      {rolling && (
        <Card title="Rolling Performance Metrics (Verified Market Closes)">
          <Table headers={['Window', 'Sample Size', 'Direction Accuracy', 'Bullish Accuracy', 'Bearish Accuracy', 'Trade Accuracy', 'Avg Error']}>
            {[rolling.last10, rolling.last25, rolling.last50, rolling.last100, rolling.last250].map((r) => (
              <tr key={r.window} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">Last {r.window} Predictions</td>
                <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400">{r.sampleSize} predictions</td>
                <td className="px-4 py-3">
                  {r.sufficientSample ? (
                    <span className={`font-mono font-bold ${(r.directionAccuracyPct ?? 0) >= 60 ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>
                      {r.directionAccuracyPct}% ({r.correct}/{r.sampleSize})
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs font-light">Insufficient sample ({r.sampleSize}/30)</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.bullish.total > 0 ? (
                    `${r.bullish.accuracyPct ?? 0}% (${r.bullish.correct}/${r.bullish.total})`
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.bearish.total > 0 ? (
                    `${r.bearish.accuracyPct ?? 0}% (${r.bearish.correct}/${r.bearish.total})`
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.executableTrades.total >= 30 ? (
                    `${r.executableTrades.accuracyPct}% (${r.executableTrades.correct}/${r.executableTrades.total})`
                  ) : r.executableTrades.total > 0 ? (
                    <span className="text-slate-400">{r.executableTrades.correct}/{r.executableTrades.total} (sample &lt; 30)</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                  {r.avgAbsoluteErrorPct != null ? `±${r.avgAbsoluteErrorPct}%` : '—'}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      {/* Snapshots Table */}
      <Card
        title={`Saved Prediction Snapshots (${predictions.length})`}
        action={
          <input
            type="text"
            placeholder="Filter symbol..."
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs font-mono outline-none w-40 uppercase"
          />
        }
      >
        {filteredPredictions.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            No prediction snapshots recorded yet. Run an analysis on a stock during market hours to auto-record a snapshot.
          </div>
        ) : (
          <Table headers={['Date / Symbol', 'Outlook & Score', 'Pred Price', 'Expected Range', 'Actual Close', 'Result', 'Close Error', 'Target 1', 'Invalidation']}>
            {filteredPredictions.map((p) => {
              const isCorrect = p.predictionResult === 'CORRECT' || p.predictionResult === 'NEUTRAL_CORRECT';
              const isWrong = p.predictionResult === 'WRONG' || p.predictionResult === 'NEUTRAL_WRONG';
              return (
                <tr key={p.id} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <strong className="font-extrabold text-slate-900 dark:text-white">{p.symbol}</strong>
                      {p.isFinalForDay && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">FINAL</span>}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{p.date}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className={`font-bold text-xs ${p.directionalOutlook === 'BULLISH' ? 'text-emerald-500' : p.directionalOutlook === 'BEARISH' ? 'text-rose-500' : 'text-slate-500'}`}>
                      {p.directionalOutlook ?? 'NEUTRAL'}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      {p.signal ?? 'N/A'} ({p.score ?? '—'}/100)
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">
                    {p.predictionPrice != null ? formatCurrency(p.predictionPrice) : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.baseCase != null ? formatCurrency(p.baseCase) : '—'}
                    {p.expectedMovePct != null && (
                      <div className="text-[10px] text-slate-400">
                        ({p.expectedMovePct >= 0 ? '+' : ''}{p.expectedMovePct.toFixed(2)}%)
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {p.actualClose != null ? (
                      <div>
                        <strong className="text-slate-900 dark:text-white">{formatCurrency(p.actualClose)}</strong>
                        {p.actualReturnPct != null && (
                          <div className={`text-[10px] font-bold ${p.actualReturnPct >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {p.actualReturnPct >= 0 ? '+' : ''}{p.actualReturnPct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Open</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      isCorrect ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : isWrong ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                    }`}>
                      {p.predictionResult ?? 'AWAITING'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {p.absoluteErrorPct != null ? `±${p.absoluteErrorPct}%` : '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.target1Hit === true ? (
                      <span className="text-emerald-500 font-bold">✓ Hit</span>
                    ) : p.target1Hit === false ? (
                      <span className="text-rose-500">✕ Missed</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.invalidationHit === true ? (
                      <span className="text-rose-500 font-bold">⚠️ Hit</span>
                    ) : p.invalidationHit === false ? (
                      <span className="text-emerald-500 font-bold">✓ Safe</span>
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
