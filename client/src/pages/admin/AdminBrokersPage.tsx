import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchConnections, setConnectionStatus } from '../../store/adminSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox } from '../../components/ui';
import { formatDateTime } from '../../lib/format';

const STATUSES = ['CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR', 'REVOKED'];

function statusClass(status: string) {
  switch (status) {
    case 'CONNECTED':
      return 'badge badge-buy';
    case 'DISCONNECTED':
    case 'REVOKED':
      return 'badge badge-avoid';
    default:
      return 'badge badge-watch';
  }
}

export function AdminBrokersPage() {
  const dispatch = useAppDispatch();
  const { connections, error } = useAppSelector((s) => s.admin);

  useEffect(() => {
    dispatch(fetchConnections());
  }, [dispatch]);

  async function changeStatus(id: number, status: string) {
    await dispatch(setConnectionStatus({ id, status }));
    dispatch(fetchConnections());
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin · Broker Connections</h1>
      </header>

      {error ? <ErrorBox message={error} onRetry={() => dispatch(fetchConnections())} /> : null}

      <Card title="Connections">
        {!connections ? (
          <Spinner />
        ) : connections.length > 0 ? (
          <Table headers={['User', 'Broker', 'Status', 'Last Sync', 'Expires', 'Created', 'Set status']}>
            {connections.map((c) => (
              <tr key={c.id}>
                <td className="strong">
                  {c.user?.email}
                  <div className="muted small">{c.user?.fullName}</div>
                </td>
                <td>{c.broker}</td>
                <td>
                  <Badge className={statusClass(c.status)}>{c.status}</Badge>
                </td>
                <td className="muted small">{formatDateTime(c.lastSyncAt)}</td>
                <td className="muted small">{formatDateTime(c.expiryAt)}</td>
                <td className="muted small">{formatDateTime(c.createdAt)}</td>
                <td>
                  <select
                    className="btn-sm"
                    value={c.status}
                    onChange={(e) => changeStatus(c.id, e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="No broker connections" />
        )}
      </Card>
    </div>
  );
}