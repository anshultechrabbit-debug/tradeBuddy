export function formatCurrency(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return `${value.toFixed(0)}`;
}

export function formatTimeAgo(value: string | number | Date | null | undefined): string {
  if (!value) return '—';
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return '—';
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

export function pnlClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-muted';
  return value > 0 ? 'text-positive' : 'text-negative';
}

export function signalBadgeClass(signal: string): string {
  switch (signal) {
    case 'BUY':
      return 'badge badge-buy';
    case 'WATCH':
      return 'badge badge-watch';
    case 'AVOID':
      return 'badge badge-avoid';
    default:
      return 'badge badge-muted';
  }
}

export function regimeBadgeClass(regime: string): string {
  switch (regime) {
    case 'BULLISH':
      return 'badge badge-buy';
    case 'BEARISH':
      return 'badge badge-avoid';
    default:
      return 'badge badge-watch';
  }
}

export function toCamelCase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase());
}