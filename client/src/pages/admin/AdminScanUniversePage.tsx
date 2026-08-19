import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchScanUniverse, updateScanUniverse, deleteScanUniverse, syncUniverse } from '../../store/adminSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox, PaginationBar } from '../../components/ui';

export function AdminScanUniversePage() {
  const dispatch = useAppDispatch();
  const { scanUniverse, error } = useAppSelector((s) => s.admin);
  const [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    dispatch(fetchScanUniverse({ page, limit: 20 }));
  }, [dispatch, page]);

  async function handleSync() {
    setSyncing(true);
    try {
      await dispatch(syncUniverse());
      dispatch(fetchScanUniverse({ page, limit: 20 }));
    } finally {
      setSyncing(false);
    }
  }

  async function toggleEnabled(entry: { id: number; enabled: boolean }) {
    await dispatch(updateScanUniverse({ id: entry.id, payload: { enabled: !entry.enabled } }));
    dispatch(fetchScanUniverse({ page, limit: 20 }));
  }

  async function toggleExcluded(entry: { id: number; excluded: boolean }) {
    await dispatch(updateScanUniverse({ id: entry.id, payload: { excluded: !entry.excluded } }));
    dispatch(fetchScanUniverse({ page, limit: 20 }));
  }

  async function remove(id: number) {
    await dispatch(deleteScanUniverse(id));
    dispatch(fetchScanUniverse({ page, limit: 20 }));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Admin · Scan Universe</h1>
        <button className="btn btn-primary" onClick={handleSync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync real NSE universe'}
        </button>
      </header>

      {error ? <ErrorBox message={error} onRetry={() => dispatch(fetchScanUniverse({ page, limit: 20 }))} /> : null}

      <Card title={`Universe (${scanUniverse?.meta.total ?? 0})`}>
        {!scanUniverse ? (
          <Spinner />
        ) : scanUniverse.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Name', 'Sector', 'Type', 'Priority', 'Enabled', 'Excluded', '']}>
              {scanUniverse.data.map((entry) => (
                <tr key={entry.id}>
                  <td className="strong">{entry.symbol}</td>
                  <td>{entry.name ?? '—'}</td>
                  <td className="muted small">{entry.sector ?? '—'}</td>
                  <td className="muted small">{entry.instrumentType}</td>
                  <td>{entry.priority}</td>
                  <td>
                    <Badge className={entry.enabled ? 'badge badge-buy' : 'badge badge-muted'}>{entry.enabled ? 'ON' : 'OFF'}</Badge>
                  </td>
                  <td>
                    <Badge className={entry.excluded ? 'badge badge-avoid' : 'badge badge-muted'}>{entry.excluded ? 'EXCLUDED' : '—'}</Badge>
                  </td>
                  <td>
                    <div className="btn-row">
                      <button className="btn btn-outline btn-sm" onClick={() => toggleEnabled(entry)}>
                        {entry.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleExcluded(entry)}>
                        {entry.excluded ? 'Un-exclude' : 'Exclude'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => remove(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            <PaginationBar page={page} totalPages={scanUniverse.meta.totalPages} onPage={setPage} />
          </>
        ) : (
          <EmptyState title="Universe is empty" />
        )}
      </Card>
    </div>
  );
}