import { FormEvent, useState, useEffect } from 'react';
import { apiClient, apiErrorMessage } from '../api/client';
import type { Recommendation } from '../lib/types';
import { Card, StatCard, Badge, Spinner, EmptyState, ErrorBox } from '../components/ui';
import { formatDateTime, signalBadgeClass } from '../lib/format';

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
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[11px] font-mono font-bold tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              MULTI-MODEL ROUTER
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Strategy Routing Engine
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Query algorithmic strategy decisions based on composite technical conviction and regime.
            </p>
          </div>
        </div>
      </section>

      {/* ── GET RECOMMENDATION FORM ── */}
      <Card title={<span className="flex items-center gap-2"><span>🔍</span> Query Strategy for Symbol</span>}>
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (e.g. RELIANCE, TCS)"
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 uppercase font-mono transition-colors"
          />
          <button
            type="submit"
            disabled={loading || !symbol.trim()}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? <Spinner /> : <span>Run Router</span>}
          </button>
        </form>
      </Card>

      {error ? <ErrorBox message={error} /> : null}

      {result ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Action Recommendation"
              value={<Badge className={signalBadgeClass(result.recommendation)}>{result.recommendation}</Badge>}
            />
            <StatCard label="Model Confidence" value={`${(result.confidence * 100).toFixed(0)}%`} />
            <StatCard label="Conviction Score" value={`${result.convictionScore}/100`} />
            <StatCard label="Engine Source" value={<span className="text-base font-mono uppercase">{result.source}</span>} />
          </div>

          <Card title="Strategy Decision Rationale">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-2">
              <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-light">{result.reason}</p>
              <div className="text-[10px] font-mono text-slate-400">Generated {formatDateTime(result.timestamp)}</div>
            </div>
          </Card>

          {result.supportingSignals.length > 0 ? (
            <Card title="Supporting Signals & Confluence">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {result.supportingSignals.map((s) => (
                  <div
                    key={s.symbol}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white">{s.symbol}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">Conviction {s.convictionScore}</div>
                    </div>
                    <div className="text-right">
                      <Badge className={signalBadgeClass(s.signal)}>{s.signal}</Badge>
                      <div className="text-[10px] text-slate-400 uppercase font-bold mt-1">{s.regime}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : (
        !loading && !error && <EmptyState title="Enter a stock symbol to evaluate strategy" />
      )}
    </div>
  );
}