import { FormEvent, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchConsents, fetchRequests, createRequest, resolveRequest } from '../../store/adminSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { apiErrorMessage } from '../../api/client';

const TYPES = ['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION'];

function scopeBadge(scope: string) {
  return <Badge className="badge badge-muted">{scope}</Badge>;
}

export function AdminCompliancePage() {
  const dispatch = useAppDispatch();
  const { consents, requests, error } = useAppSelector((s) => s.admin);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState('ACCESS');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    dispatch(fetchConsents());
    dispatch(fetchRequests());
  }, [dispatch]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    try {
      await dispatch(createRequest({ userId: parseInt(userId, 10), type })).unwrap();
      setUserId('');
      dispatch(fetchRequests());
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  }

  async function handleResolve(id: number, status: string) {
    await dispatch(resolveRequest({ id, status }));
    dispatch(fetchRequests());
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin · Compliance & DPDP</h1>
      </header>

      {error || actionError ? <ErrorBox message={error ?? actionError} /> : null}

      <div className="grid-2">
        <Card title={`Consent Ledger (${consents?.length ?? 0})`}>
          {!consents ? (
            <Spinner />
          ) : consents.length > 0 ? (
            <Table headers={['User', 'Broker', 'Scope', 'Status', 'Granted', 'Revoked']}>
              {consents.map((c) => (
                <tr key={c.id}>
                  <td className="strong">{c.user?.email}</td>
                  <td>{c.broker}</td>
                  <td>{scopeBadge(c.scope)}</td>
                  <td>
                    <Badge className={c.status === 'ACTIVE' ? 'badge badge-buy' : 'badge badge-avoid'}>{c.status}</Badge>
                  </td>
                  <td className="muted small">{formatDateTime(c.createdAt)}</td>
                  <td className="muted small">{formatDateTime(c.revokedAt)}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No consents" />
          )}
        </Card>

        <Card title="Data Subject Requests">
          <form onSubmit={handleCreate} className="form form-inline">
            <input
              type="number"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="User ID"
              required
              style={{ maxWidth: 100 }}
            />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary">
              Submit
            </button>
          </form>

          {requests && requests.length > 0 ? (
            <Table headers={['User', 'Type', 'Status', 'Submitted', '']}>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td className="strong">{r.user?.email}</td>
                  <td>{r.type}</td>
                  <td>
                    <Badge className={r.status === 'COMPLETED' ? 'badge badge-buy' : r.status === 'REJECTED' ? 'badge badge-avoid' : 'badge badge-watch'}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="muted small">{formatDateTime(r.submittedAt)}</td>
                  <td>
                    {r.status === 'PENDING' ? (
                      <div className="btn-row">
                        <button className="btn btn-outline btn-sm" onClick={() => handleResolve(r.id, 'COMPLETED')}>
                          Complete
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleResolve(r.id, 'REJECTED')}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="muted small">{formatDateTime(r.resolvedAt)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No DSR requests" />
          )}
        </Card>
      </div>
    </div>
  );
}