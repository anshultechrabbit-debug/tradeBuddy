import type { ReactNode } from 'react';
import { useAppSelector } from '../store/hooks';

export function Layout({ children }: { children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  const isAdmin = user?.role === 'ADMIN';
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-dot" /> TradeBuddy
        </div>
        <nav className="sidebar-nav">
          <a href="/dashboard" className="nav-link">Dashboard</a>
          <a href="/radar" className="nav-link">Opportunity Radar</a>
          <a href="/portfolio" className="nav-link">Portfolio</a>
          <a href="/watchlist" className="nav-link">Watchlist</a>
          <a href="/market" className="nav-link">Market</a>
          <a href="/strategy" className="nav-link">Strategy</a>
          <a href="/alerts" className="nav-link">Alerts</a>
          <a href="/journal" className="nav-link">Trade Journal</a>
          <a href="/settings" className="nav-link">Settings</a>
          {isAdmin ? (
            <>
              <div className="nav-section">Admin</div>
              <a href="/admin/users" className="nav-link">Users</a>
              <a href="/admin/system-health" className="nav-link">System Health</a>
              <a href="/admin/brokers" className="nav-link">Broker Connections</a>
              <a href="/admin/compliance" className="nav-link">Compliance</a>
              <a href="/admin/scan-universe" className="nav-link">Scan Universe</a>
            </>
          ) : null}
        </nav>
        <div className="sidebar-user">
          <div className="user-email">{user?.email}</div>
          <div className="user-role">{user?.role}</div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}