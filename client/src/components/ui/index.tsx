import type { CSSProperties, ReactNode } from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="spinner-wrap">
      <div className="spinner" aria-label="loading" />
      {label ? <span className="muted">{label}</span> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">◌</div>
      <div className="empty-state-title">{title}</div>
      {hint ? <div className="muted">{hint}</div> : null}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string | null | undefined; onRetry?: () => void }) {
  return (
    <div className="error-box">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function Card({ title, action, children, className = '', style }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`card ${className}`} style={style}>
      {title || action ? (
        <div className="card-header">
          {title ? <h3 className="card-title">{title}</h3> : null}
          {action ? <div className="card-action">{action}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, tone = '' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone}`}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function Badge({ children, className = 'badge badge-muted' }: { children: ReactNode; className?: string }) {
  return <span className={className}>{children}</span>;
}

export function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
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
    <div className="pagination">
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={safePage <= 1}
        onClick={() => onPage(1)}
      >
        First
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={safePage <= 1}
        onClick={() => onPage(safePage - 1)}
      >
        ← Prev
      </button>
      {visiblePages.map((pageNumber) => (
        <button
          key={pageNumber}
          type="button"
          className={`btn btn-sm ${pageNumber === safePage ? 'btn-primary' : 'btn-outline'}`}
          aria-current={pageNumber === safePage ? 'page' : undefined}
          onClick={() => onPage(pageNumber)}
        >
          {pageNumber}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={safePage >= totalPages}
        onClick={() => onPage(safePage + 1)}
      >
        Next →
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={safePage >= totalPages}
        onClick={() => onPage(totalPages)}
      >
        Last
      </button>
      <span className="muted small">Page {safePage} of {totalPages}</span>
    </div>
  );
}
