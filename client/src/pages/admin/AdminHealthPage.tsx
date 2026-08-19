import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchHealth } from '../../store/adminSlice';
import { Card, Badge, Spinner, ErrorBox, StatCard } from '../../components/ui';

export function AdminHealthPage() {
  const dispatch = useAppDispatch();
  const { health, error } = useAppSelector((s) => s.admin);

  useEffect(() => {
    dispatch(fetchHealth());
  }, [dispatch]);

  if (error) return <ErrorBox message={error} onRetry={() => dispatch(fetchHealth())} />;
  if (!health) return <Spinner label="Loading health…" />;

  const up = (status: string) => (status === 'UP' ? 'badge badge-buy' : 'badge badge-avoid');

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin · System Health</h1>
        <button className="btn btn-outline" onClick={() => dispatch(fetchHealth())}>
          Refresh
        </button>
      </header>

      <div className="stat-grid">
        <StatCard label="Application" value={<Badge className={up(health.application.status)}>{health.application.status}</Badge>} sub={`env ${health.application.environment} · v${health.application.version}`} />
        <StatCard label="Database" value={<Badge className={up(health.database.status)}>{health.database.status}</Badge>} />
        <StatCard label="Market Data" value={<Badge className={up(health.marketData.status)}>{health.marketData.status}</Badge>} sub={`${health.marketData.provider} (${health.marketData.dataSource})`} />
        <StatCard label="Broker Provider" value={<Badge className={up(health.brokerProvider.status)}>{health.brokerProvider.status}</Badge>} sub={`${health.brokerProvider.provider} · ${health.brokerProvider.connections} connections`} />
      </div>

      <div className="grid-2">
        <Card title="Uptime">
          <div className="analysis-list">
            <div><span className="muted">Uptime:</span> <strong>{(health.application.uptimeSeconds / 3600).toFixed(2)} hours</strong></div>
            <div><span className="muted">Users:</span> <strong>{health.statistics.users}</strong></div>
            <div><span className="muted">Broker connections:</span> <strong>{health.statistics.brokerConnections}</strong></div>
            <div><span className="muted">Notification provider:</span> <strong>{health.notificationProvider.provider} ({health.notificationProvider.environment})</strong></div>
          </div>
        </Card>

        <Card title="Recent Errors">
          {health.errors.recent.length > 0 ? (
            <div className="notification-list">
              {health.errors.recent.map((e) => {
                const err = e as { id: number; level: string; component: string; message: string; createdAt: string };
                return (
                  <div key={err.id} className="notification">
                    <div className="strong small">{err.component}</div>
                    <div className="muted small">{err.message}</div>
                    <div className="muted small">{err.createdAt}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted">No recent errors.</div>
          )}
        </Card>
      </div>
    </div>
  );
}