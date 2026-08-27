import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchJournal, importJournal, updateNotes } from '../store/journalSlice';
import { Card, Table, Badge, Spinner, EmptyState, ErrorBox, PaginationBar } from '../components/ui';
import { formatCurrency, formatDateTime, formatNumber } from '../lib/format';

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
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[11px] font-mono font-bold tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              EXECUTION LOG
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Trade Execution Journal
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Audit past trade fills, analyze real-world performance, and attach strategy review notes.
            </p>
          </div>
          <button
            onClick={handleImport}
            className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold shadow-md transition-transform hover:scale-105 cursor-pointer flex items-center gap-2"
          >
            <span>📥</span> Import from Broker
          </button>
        </div>
      </section>

      {error ? <ErrorBox message={error} /> : null}

      {importResult ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <span>✓</span>
          <span>
            Imported {importResult.imported} new entries from {importResult.orders} orders ({importResult.trades} trades).
          </span>
        </div>
      ) : null}

      {/* ── JOURNAL TABLE CARD ── */}
      <Card title={`Logged Executions (${entries?.meta.total ?? 0})`}>
        {loading ? (
          <Spinner />
        ) : entries && entries.data.length > 0 ? (
          <>
            <Table headers={['Symbol', 'Side', 'Quantity', 'Fill Price', 'Status', 'Realized P&L', 'Executed At', 'Trade Notes']}>
              {entries.data.map((entry) => {
                const isBuy = entry.side === 'BUY';
                const isNeg = (entry.pnl ?? 0) < 0;
                return (
                  <tr key={entry.id} className="hover:bg-slate-100/50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 font-extrabold text-slate-900 dark:text-white">{entry.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded text-[10.5px] font-bold font-mono ${
                        isBuy ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      }`}>
                        {entry.side}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{formatNumber(entry.quantity, 0)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-white">{formatCurrency(entry.price)}</td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono uppercase text-slate-500 dark:text-slate-400">{entry.status}</span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-bold ${isNeg ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
                      {entry.pnl != null ? formatCurrency(entry.pnl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-slate-500 dark:text-slate-400">{formatDateTime(entry.timestamp)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          value={notes[entry.id] ?? entry.notes ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [entry.id]: e.target.value }))}
                          placeholder="Add trade rationale…"
                          className="px-3 py-1 rounded-lg border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors w-44"
                        />
                        <button
                          onClick={() => saveNotes(entry.id)}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
            {entries.meta.totalPages > 1 ? (
              <PaginationBar page={page} totalPages={entries.meta.totalPages} onPage={setPage} />
            ) : null}
          </>
        ) : (
          <EmptyState title="Trade Journal is empty" hint="Import orders from your mock or live broker to start tracking." />
        )}
      </Card>
    </div>
  );
}