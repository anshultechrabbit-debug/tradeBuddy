import type { CSSProperties, ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-6 text-slate-500 dark:text-slate-400">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-electric-500/20 border-t-electric-500" aria-label="loading" />
      {label ? <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-[#1c2541] bg-slate-50/50 dark:bg-white/[0.02] py-8 text-center">
      <div className="text-2xl text-slate-400 dark:text-slate-600">◌</div>
      <div className="mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-300">{title}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-700 dark:text-rose-300">
      <span>{message}</span>
      {onRetry ? (
        <button
          type="button"
          className="rounded-lg border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-800 dark:text-rose-200 transition-colors hover:bg-rose-500/30 cursor-pointer"
          onClick={onRetry}
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white/90 dark:bg-[#0b132b]/80 p-5 shadow-sm dark:shadow-xl dark:shadow-black/20 backdrop-blur-xl transition-colors ${className}`}
      style={style}
    >
      {title || action ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title ? <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">{title}</div> : null}
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone = '' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white/90 dark:bg-[#0b132b]/80 p-5 shadow-sm dark:shadow-xl dark:shadow-black/20 backdrop-blur-xl transition-colors">
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`font-mono text-2xl font-black text-slate-900 dark:text-white ${tone}`}>{value}</div>
      {sub ? <div className="text-xs text-slate-500 dark:text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider ${
        className || 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-electric-600 to-electric-400 transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white/50 dark:bg-black/20">
      <table className="w-full text-left text-xs">
        <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-100/90 dark:bg-[#070d1e]/80 text-[10.5px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">{children}</tbody>
      </table>
    </div>
  );
}

export function PaginationBar({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const firstVisible = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const visiblePages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => firstVisible + index,
  );
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-slate-500 dark:text-slate-400">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded-lg border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          disabled={safePage <= 1}
          onClick={() => onPage(1)}
        >
          First
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          disabled={safePage <= 1}
          onClick={() => onPage(safePage - 1)}
        >
          &larr; Prev
        </button>
        {visiblePages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={`h-7 w-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              pageNumber === safePage
                ? 'bg-gradient-to-r from-electric-600 to-electric-500 text-white shadow-md shadow-electric-600/30'
                : 'border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 dark:hover:text-white'
            }`}
            aria-current={pageNumber === safePage ? 'page' : undefined}
            onClick={() => onPage(pageNumber)}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          className="rounded-lg border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          disabled={safePage >= totalPages}
          onClick={() => onPage(safePage + 1)}
        >
          Next &rarr;
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-200 dark:hover:bg-white/10 disabled:opacity-40 cursor-pointer"
          disabled={safePage >= totalPages}
          onClick={() => onPage(totalPages)}
        >
          Last
        </button>
      </div>
      <span className="font-mono text-xs text-slate-500">
        Page {safePage} of {totalPages}
      </span>
    </div>
  );
}
