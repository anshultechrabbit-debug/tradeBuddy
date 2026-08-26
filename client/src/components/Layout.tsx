import type { ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { useTheme } from '../hooks/useTheme';

const NAV_LINKS = [
  { to: '/dashboard',  label: 'Dashboard',        icon: '⊞' },
  { to: '/radar',      label: 'Opportunity Radar', icon: '📡', badge: '12' },
  { to: '/market',     label: 'Markets',           icon: '📈' },
  { to: '/ai-picks',   label: 'AI Strategy',       icon: '🤖' },
  { to: '/portfolio',  label: 'Portfolio',         icon: '💼' },
  { to: '/watchlist',  label: 'Watchlist',         icon: '👀' },
  { to: '/alerts',     label: 'Alerts',            icon: '🔔', badge: '4' },
  { to: '/journal',    label: 'Trade Journal',     icon: '📖' },
];

const SYSTEM_LINKS = [
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

const ADMIN_LINKS = [
  { to: '/admin/users',         label: 'Users',              icon: '👥' },
  { to: '/admin/system-health', label: 'System Health',      icon: '💊' },
  { to: '/admin/brokers',       label: 'Broker Connections', icon: '🔌' },
  { to: '/admin/compliance',    label: 'Compliance',         icon: '🛡️' },
  { to: '/admin/scan-universe', label: 'Scan Universe',      icon: '🌐' },
];

const TICKERS = [
  { symbol: 'BANK NIFTY', value: '53,410.65', change: '-88.48',   changePct: '-0.17%', neg: true },
  { symbol: 'NIFTY IT',   value: '42,918.20', change: '+618.55',  changePct: '+1.44%', neg: false },
  { symbol: 'INDIA VIX',  value: '12.84',     change: '-0.42',    changePct: '-3.17%', neg: true },
  { symbol: 'NIFTY 50',   value: '24,780.40', change: '+618.55',  changePct: '+0.82%', neg: false },
  { symbol: 'USD/INR',    value: '83.42',     change: '+0.05',    changePct: '+0.06%', neg: false },
  { symbol: 'GOLD (MCX)', value: '72,148',    change: '+312',     changePct: '+0.43%', neg: false },
];

function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Layout({ children }: { children: ReactNode }) {
  const user    = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === 'ADMIN';
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="layout">

      {/* ── LIVE TICKER BAR ── */}
      <div className="tb-ticker-bar">
        <div className="tb-ticker-track">
          {[...TICKERS, ...TICKERS].map((t, i) => (
            <span key={i} className="tb-ticker-item">
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>{t.symbol}</span>
              <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{t.value}</span>
              <span style={{ color: t.neg ? '#f87171' : '#34d399', fontWeight: 600 }}>
                {t.change}
              </span>
              <span style={{
                color: t.neg ? '#f87171' : '#34d399',
                fontSize: 10,
                background: t.neg ? 'rgba(239,68,68,0.12)' : 'rgba(52,211,153,0.12)',
                padding: '1px 5px',
                borderRadius: 4,
                fontWeight: 600,
              }}>
                {t.changePct}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── LAYOUT BODY: SIDEBAR + MAIN ── */}
      <div className="tb-layout-body">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="tb-sidebar">

          {/* Brand */}
          <Link to="/dashboard" className="tb-sidebar-brand">
            <div className="tb-sidebar-brand-logo">🐼</div>
            <div>
              <div className="tb-sidebar-brand-name">TradeBuddy</div>
              <div className="tb-sidebar-brand-sub">POWERED BY QUANTILOT AI</div>
            </div>
          </Link>

          {/* Nav */}
          <nav className="tb-sidebar-nav">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/dashboard'}
                className={({ isActive }) => `tb-sidebar-link${isActive ? ' active' : ''}`}
              >
                <span className="tb-sidebar-link-icon">{l.icon}</span>
                <span style={{ flex: 1 }}>{l.label}</span>
                {l.badge && <span className="tb-sidebar-badge">{l.badge}</span>}
              </NavLink>
            ))}

            <div className="tb-sidebar-label">SYSTEM</div>
            {SYSTEM_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `tb-sidebar-link${isActive ? ' active' : ''}`}
              >
                <span className="tb-sidebar-link-icon">{l.icon}</span>
                <span>{l.label}</span>
              </NavLink>
            ))}

            {isAdmin && (
              <>
                <div className="tb-sidebar-label">ADMIN</div>
                {ADMIN_LINKS.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) => `tb-sidebar-link${isActive ? ' active' : ''}`}
                  >
                    <span className="tb-sidebar-link-icon">{l.icon}</span>
                    <span>{l.label}</span>
                  </NavLink>
                ))}
              </>
            )}
          </nav>

          {/* Theme Toggle */}
          <button
            type="button"
            className="tb-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>

          {/* User Profile Footer */}
          <div className="tb-sidebar-user" style={{ marginTop: 12 }}>
            <div className="tb-sidebar-user-avatar">
              {initials(user?.fullName, user?.email)}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div className="tb-sidebar-user-name">
                {user?.fullName ?? user?.email?.split('@')[0] ?? 'Trader'}
              </div>
              <div className="tb-sidebar-user-role">Pro Trader</div>
            </div>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className="tb-main-col">
          {/* Disclaimer */}
          <div className="tb-disclaimer">
            <strong>🧠 Smart, Not Psychic —</strong>
            <span>
              AI predictions can be wrong, delayed, or overturned by unexpected events.
              Treat every signal as information—not a promise.
            </span>
          </div>

          <main className="tb-main-scroll">
            {children}
          </main>
        </div>
      </div>

    </div>
  );
}