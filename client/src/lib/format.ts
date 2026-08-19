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