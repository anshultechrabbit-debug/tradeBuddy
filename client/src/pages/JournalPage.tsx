import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchJournal, importJournal, updateNotes } from '../store/journalSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox, PaginationBar } from '../components/ui';
import { formatCurrency, formatDateTime, pnlClass, formatNumber } from '../lib/format';

export function JournalPage() {
  const dispatch = useAppDispatch();
  const { entries, importResult, loading, error } = useAppSelector((s) => s.journal);
  const [page, setPage] = useState(1);
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    dispatch(fetchJournal({ page, limit: 15 }));
  }, [dispatch, page]);

  async function handleImport() {
    await dispatch(importJournal('mock'));
    dispatch(fetchJournal({ page, limit: 15 }));
  }

  async function saveNotes(id: number) {
    await dispatch(updateNotes({ id, notes: notes[id] ?? null }));
    dispatch(fetchJournal({ page, limit: 15 }));
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Trade Journal</h1>
        <button className="btn btn-outline" onClick={handleImport}>
          Import from broker
        </button>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {importResult ? (
        <div className="notice">
          Imported {importResult.imported} new entries from {importResult.orders} orders ({importResult.trades} trades).
        </div>
      ) : null}

      <Card title={`Journal (${entries?.meta.total ?? 0})`}>
        {loading ? (
          <Spinner />
        ) : entries && entries.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Side', 'Qty', 'Price', 'Status', 'P&L', 'When', 'Notes']}>
              {entries.data.map((entry) => (
                <tr key={entry.id}>
                  <td className="strong">{entry.symbol}</td>
                  <td>
                    <Badge className={entry.side === 'BUY' ? 'badge badge-buy' : 'badge badge-avoid'}>{entry.side}</Badge>
                  </td>
                  <td>{formatNumber(entry.quantity, 0)}</td>
                  <td>{formatCurrency(entry.price)}</td>
                  <td className="muted small">{entry.status}</td>
                  <td className={pnlClass(entry.pnl)}>{formatCurrency(entry.pnl)}</td>
                  <td className="muted small">{formatDateTime(entry.timestamp)}</td>
                  <td>
                    <div className="inline-notes">
                      <input
                        value={notes[entry.id] ?? entry.notes ?? ''}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                        placeholder="Add note…"
                      />
                      <button className="btn btn-outline btn-sm" onClick={() => saveNotes(entry.id)}>
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
            {entries.meta.totalPages > 1 ? (
              <PaginationBar page={page} totalPages={entries.meta.totalPages} onPage={setPage} />
            ) : null}
          </>
        ) : (
          <EmptyState title="Journal is empty" hint="Import trades from your broker" />
        )}
      </Card>
    </div>
  );
}