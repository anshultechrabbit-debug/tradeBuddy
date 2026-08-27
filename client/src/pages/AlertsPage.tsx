import { FormEvent, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  fetchAlerts,
  createAlert,
  updateAlert,
  deleteAlert,
  fetchEvents,
  fetchNotifications,
  evaluateAlerts,
} from '../store/alertsSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox, PaginationBar } from '../components/ui';
import { formatCurrency, formatDateTime } from '../lib/format';
import { apiErrorMessage } from '../api/client';

const ALERT_TYPES = [
  { value: 'price_above', label: 'Price Climbs Above (₹)' },
  { value: 'price_below', label: 'Price Falls Below (₹)' },
  { value: 'conviction_above', label: 'Conviction Score Above' },
  { value: 'pnl_above', label: 'P&L Exceeds (₹)' },
  { value: 'pnl_below', label: 'P&L Drops Below (₹)' },
];

const CHANNELS = ['IN_APP', 'PUSH', 'EMAIL'];

export function AlertsPage() {
  const dispatch = useAppDispatch();
  const { alerts, events, notifications, loading, error } = useAppSelector((s) => s.alerts);
  const [name, setName] = useState('');
  const [alertType, setAlertType] = useState('price_above');
  const [threshold, setThreshold] = useState('');
  const [symbol, setSymbol] = useState('');
  const [channels, setChannels] = useState<string[]>(['IN_APP']);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [eventPage, setEventPage] = useState(1);

  useEffect(() => {
    dispatch(fetchAlerts());
    dispatch(fetchEvents(eventPage));
    dispatch(fetchNotifications());
  }, [dispatch, eventPage]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const source = new EventSource(`/api/stream?channel=alerts&token=${encodeURIComponent(token)}`);
    source.addEventListener('message', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'alerts') {
          dispatch(fetchEvents(eventPage));
          dispatch(fetchNotifications());
          dispatch(fetchAlerts());
        }
      } catch {
        // ignore non-JSON frames
      }
    });
    return () => source.close();
  }, [dispatch, eventPage]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      await dispatch(
        createAlert({ name, alertType, threshold: parseFloat(threshold), symbol: symbol.toUpperCase() || undefined, channels })
      ).unwrap();
      setName('');
      setThreshold('');
      setSymbol('');
      await dispatch(fetchAlerts());
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(alert: { id: number; active: boolean }) {
    await dispatch(updateAlert({ id: alert.id, payload: { active: !alert.active } }));
    await dispatch(fetchAlerts());
  }

  async function removeAlert(id: number) {
    await dispatch(deleteAlert(id));
    await dispatch(fetchAlerts());
  }

  async function runEvaluate() {
    await dispatch(evaluateAlerts());
    await dispatch(fetchEvents());
    await dispatch(fetchNotifications());
  }

  function toggleChannel(ch: string) {
    setChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
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
              REAL-TIME TRIGGER ENGINE
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Price & Signal Alerts
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Set automated notifications for price targets, AI conviction score shifts, and portfolio P&L triggers.
            </p>
          </div>
          <button
            onClick={runEvaluate}
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold shadow-md transition-transform hover:scale-105 cursor-pointer flex items-center gap-2"
          >
            <span>⚡</span> Evaluate Now
          </button>
        </div>
      </section>

      {error || actionError ? <ErrorBox message={error ?? actionError} /> : null}

      {/* ── CREATE ALERT & MY ALERTS GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title={<span className="flex items-center gap-2"><span>🔔</span> Create New Alert</span>}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Alert Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="e.g. RELIANCE Breakout above 3000"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Condition Type
                </label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Threshold Value
                </label>
                <input
                  type="number"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                  placeholder="3000"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Target Stock Symbol (Optional)
              </label>
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="RELIANCE"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors uppercase font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Notification Channels
              </label>
              <div className="flex gap-2">
                {CHANNELS.map((ch) => {
                  const isSel = channels.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isSel
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/10'
                      }`}
                    >
                      {ch}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !name.trim() || !threshold}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {submitting ? <Spinner /> : <span>+ Activate Alert Rule</span>}
            </button>
          </form>
        </Card>

        <Card title={`Active Alert Rules (${alerts.length})`}>
          {loading ? (
            <Spinner />
          ) : alerts.length > 0 ? (
            <div className="space-y-3 max-h-[420px] overflow-y-auto">
              {alerts.map((a) => (
                <div
                  key={a.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="font-extrabold text-sm text-slate-900 dark:text-white">{a.name}</div>
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      <span>{a.alertType}</span> · <strong>{formatCurrency(a.threshold)}</strong>
                      {a.symbol ? <span className="ml-1 text-blue-600 dark:text-blue-400">({a.symbol})</span> : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      a.active ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-slate-200 dark:bg-white/10 text-slate-500'
                    }`}>
                      {a.active ? 'ACTIVE' : 'OFF'}
                    </span>
                    <button
                      onClick={() => toggleActive(a)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {a.active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => removeAlert(a.id)}
                      className="px-2.5 py-1 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No alert rules created yet" hint="Configure your first price or score trigger using the form." />
          )}
        </Card>
      </div>

      {/* ── TRIGGERED EVENTS & NOTIFICATIONS BENTO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Triggered Events History">
          {events && events.data.length > 0 ? (
            <>
              <Table headers={['Alert', 'Stock', 'Trigger Value', 'Type', 'Triggered At']}>
                {events.data.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{ev.alert?.name ?? `#${ev.alertId}`}</td>
                    <td className="px-4 py-3 font-mono font-extrabold text-blue-600 dark:text-blue-400">{ev.symbol ?? '—'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(ev.value)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{ev.alertType}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-400">{formatDateTime(ev.triggeredAt)}</td>
                  </tr>
                ))}
              </Table>
              <PaginationBar page={eventPage} totalPages={events.meta.totalPages} onPage={setEventPage} />
            </>
          ) : (
            <EmptyState title="No triggered events yet" hint="Events will appear here when price thresholds are hit." />
          )}
        </Card>

        <Card title="Notification Delivery Log">
          {notifications && notifications.data.length > 0 ? (
            <div className="space-y-3 max-h-[360px] overflow-y-auto">
              {notifications.data.map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] space-y-1"
                >
                  <div className="font-bold text-xs text-slate-900 dark:text-white">{n.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 font-light">{n.body}</div>
                  <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2 pt-1">
                    <span className="uppercase font-bold text-blue-500">{n.channel}</span>
                    <span>·</span>
                    <span>{formatDateTime(n.deliveredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No notifications logged" />
          )}
        </Card>
      </div>
    </div>
  );
}