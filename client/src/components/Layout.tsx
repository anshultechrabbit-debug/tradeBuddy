import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/radar', label: 'Opportunity Radar' },
  { to: '/ai-picks', label: 'AI Strategy' },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/market', label: 'Market' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/journal', label: 'Trade Journal' },
  { to: '/settings', label: 'Settings' },
];

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/system-health', label: 'System Health' },
  { to: '/admin/brokers', label: 'Broker Connections' },
  { to: '/admin/compliance', label: 'Compliance' },
  { to: '/admin/scan-universe', label: 'Scan Universe' },
];

function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

export function Layout({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/dashboard" className="topbar-brand">
            <span className="brand-logo">⚡</span>
            <span>TradeBuddy</span>
          </NavLink>
          <nav className="topbar-nav">
            {NAV_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/dashboard'}
                className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-right">
            {isAdmin ? (
              <NavLink
                to="/admin/users"
                className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
              >
                Admin
              </NavLink>
            ) : null}
            <div className="topbar-user">
              <span className="avatar">{initials(user?.fullName, user?.email)}</span>
              <span className="user-email">{user?.email}</span>
            </div>
          </div>
        </div>
        {isAdmin ? (
          <div className="topbar-admin">
            {ADMIN_LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `topbar-link${isActive ? ' active' : ''}`}
              >
                {l.label}
              </NavLink>
            ))}
          </div>
        ) : null}
      </header>
      <div className="disclaimer-banner">
        <div className="disclaimer-banner-inner">
          <strong>🧠 Smart, Not Psychic —</strong>
          <span>
            We crunch the numbers; the market makes the rules. AI predictions can be wrong, delayed, or overturned by
            unexpected events. Treat every signal as information—not a promise. Check the data, understand the risk,
            and make your own informed decision.
          </span>
        </div>
      </div>
      <main className="main">{children}</main>
    </div>
  );
}