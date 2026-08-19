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
import { formatCurrency, formatDateTime, pnlClass } from '../lib/format';
import { apiErrorMessage } from '../api/client';

const ALERT_TYPES = ['price_above', 'price_below', 'conviction_above', 'pnl_above', 'pnl_below'];
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

  useEffect(() => {
    dispatch(fetchAlerts());
    dispatch(fetchEvents());
    dispatch(fetchNotifications());
  }, [dispatch]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      await dispatch(
        createAlert({ name, alertType, threshold: parseFloat(threshold), symbol: symbol || undefined, channels })
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
    <div className="page">
      <header className="page-header">
        <h1>Alerts</h1>
        <button className="btn btn-outline" onClick={runEvaluate}>
          Evaluate now
        </button>
      </header>

      {error || actionError ? <ErrorBox message={error ?? actionError} /> : null}

      <div className="grid-2">
        <Card title="Create alert">
          <form onSubmit={handleCreate} className="form">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="RELIANCE breakout" />
            </label>
            <div className="form-row">
              <label className="field">
                <span>Type</span>
                <select value={alertType} onChange={(e) => setAlertType(e.target.value)}>
                  {ALERT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Threshold</span>
                <input type="number" step="any" value={threshold} onChange={(e) => setThreshold(e.target.value)} required />
              </label>
            </div>
            <label className="field">
              <span>Symbol (optional)</span>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE" />
            </label>
            <div className="field">
              <span>Channels</span>
              <div className="chip-row">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    className={`chip ${channels.includes(ch) ? 'chip-active' : ''}`}
                    onClick={() => toggleChannel(ch)}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Spinner /> : 'Create alert'}
            </button>
          </form>
        </Card>

        <Card title={`My Alerts (${alerts.length})`}>
          {loading ? (
            <Spinner />
          ) : alerts.length > 0 ? (
            <div className="alert-list">
              {alerts.map((a) => (
                <div key={a.id} className="alert-row">
                  <div className="flex-1">
                    <span className="strong">{a.name}</span>
                    <div className="muted small">
                      {a.alertType} · threshold {formatCurrency(a.threshold)}
                      {a.symbol ? ` · ${a.symbol}` : ''}
                    </div>
                  </div>
                  <div className="alert-actions">
                    <Badge className={a.active ? 'badge badge-buy' : 'badge badge-muted'}>{a.active ? 'ACTIVE' : 'OFF'}</Badge>
                    <button className="btn btn-outline btn-sm" onClick={() => toggleActive(a)}>
                      {a.active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => removeAlert(a.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No alerts yet" />
          )}
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Triggered Events">
          {events && events.data.length > 0 ? (
            <>
              <Table headers={['Alert', 'Symbol', 'Value', 'Type', 'Triggered']}>
                {events.data.map((ev) => (
                  <tr key={ev.id}>
                    <td className="strong">{ev.alert?.name ?? `#${ev.alertId}`}</td>
                    <td>{ev.symbol ?? '—'}</td>
                    <td className={pnlClass(ev.value ?? 0)}>{formatCurrency(ev.value)}</td>
                    <td className="muted small">{ev.alertType}</td>
                    <td className="muted small">{formatDateTime(ev.triggeredAt)}</td>
                  </tr>
                ))}
              </Table>
              <PaginationBar page={1} totalPages={events.meta.totalPages} onPage={() => {}} />
            </>
          ) : (
            <EmptyState title="No triggered events" />
          )}
        </Card>

        <Card title="Notifications">
          {notifications && notifications.data.length > 0 ? (
            <div className="notification-list">
              {notifications.data.map((n) => (
                <div key={n.id} className={`notification ${n.read ? 'notification-read' : ''}`}>
                  <div className="strong small">{n.title}</div>
                  <div className="muted small">{n.body}</div>
                  <div className="muted small">
                    {n.channel} · {n.provider} · {formatDateTime(n.deliveredAt)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No notifications" />
          )}
        </Card>
      </div>
    </div>
  );
}