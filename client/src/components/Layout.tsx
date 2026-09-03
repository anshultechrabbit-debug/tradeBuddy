import { useState, useEffect, type ReactNode } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useTheme } from '../hooks/useTheme';
import { useLiveMarketSync } from '../hooks/useLiveMarketSync';
import { formatNumber, formatPct } from '../lib/format';
import { fetchMarketStatus } from '../store/marketSlice';
import { TradePandaChat } from './TradePandaChat';

// Modern Outline SVG Icons
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  markets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
  radar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </svg>
  ),
  options: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3Z" />
    </svg>
  ),
  portfolio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <rect width="20" height="14" x="2" y="7" rx="3" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  coach: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M9.5 15a3.5 3.5 0 0 0 5 0" />
    </svg>
  ),
  connections: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M9 17H7A5 5 0 0 1 7 7h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" x2="16" y1="12" y2="12" />
    </svg>
  ),
  strategies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  journal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  ),
  commodities: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <circle cx="8" cy="8" r="6" />
      <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
      <path d="M7 6h1v4" />
      <path d="m16.7 13.3.6.7" />
    </svg>
  ),
  watchlist: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: Icons.dashboard },
  { to: '/radar', label: 'Opportunity Radar', icon: Icons.radar, badge: '12' },
  { to: '/market', label: 'Markets', icon: Icons.markets },
  { to: '/ai-picks', label: 'AI Strategy', icon: Icons.options },
  { to: '/portfolio', label: 'Portfolio', icon: Icons.portfolio },
  { to: '/watchlist', label: 'Watchlist', icon: Icons.watchlist },
  { to: '/alerts', label: 'Alerts', icon: Icons.alerts, badge: '4' },
  { to: '/journal', label: 'Trade Journal', icon: Icons.journal },
];

const SYSTEM_LINKS = [
  { to: '/settings', label: 'Settings', icon: Icons.settings },
];

const ADMIN_LINKS = [
  { to: '/admin/users', label: 'Users', icon: Icons.coach },
  { to: '/admin/system-health', label: 'System Health', icon: Icons.reports },
  { to: '/admin/brokers', label: 'Broker Connections', icon: Icons.connections },
  { to: '/admin/compliance', label: 'Compliance', icon: Icons.admin },
  { to: '/admin/scan-universe', label: 'Scan Universe', icon: Icons.radar },
];


const DEFAULT_TICKERS = [
  { symbol: 'NIFTY 50', level: 24780.40, change: 618.55, changePct: 0.82 },
  { symbol: 'BANK NIFTY', level: 53410.65, change: -88.48, changePct: -0.17 },
  { symbol: 'NIFTY IT', level: 42918.20, change: 618.55, changePct: 1.44 },
  { symbol: 'INDIA VIX', level: 12.84, change: -0.42, changePct: -3.17 },
  { symbol: 'USD/INR', level: 83.42, change: 0.05, changePct: 0.06 },
  { symbol: 'GOLD (MCX)', level: 72148, change: 312, changePct: 0.43 },
];

function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Layout({ children }: { children: ReactNode }) {
  useLiveMarketSync();

  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const indices = useAppSelector((s) => s.market.indices);
  const topMovers = useAppSelector((s) => s.market.top);
  const marketStatus = useAppSelector((s) => s.market.status);
  const isAdmin = user?.role === 'ADMIN';
  const { theme, toggleTheme } = useTheme();

  // The one canonical, holiday-aware market-status source (see marketSlice's
  // fetchMarketStatus) — session state changes on the order of minutes at
  // most (open/close/holiday transitions), so a minute is plenty granular
  // and avoids polling more than the actual value ever changes.
  useEffect(() => {
    dispatch(fetchMarketStatus());
    const timer = setInterval(() => dispatch(fetchMarketStatus()), 60000);
    return () => clearInterval(timer);
  }, [dispatch]);

  const [chatOpen, setChatOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Combine live indices + top active market movers
  const liveItems: Array<{ symbol: string; level: number; change?: number | null; changePct: number; tag?: string }> = [];

  if (indices && indices.length > 0) {
    indices.forEach((idx) => liveItems.push({ symbol: idx.symbol, level: idx.level, change: idx.change, changePct: idx.changePct, tag: 'INDEX' }));
  } else {
    DEFAULT_TICKERS.forEach((t) => liveItems.push(t));
  }

  if (topMovers?.gainers && topMovers.gainers.length > 0) {
    topMovers.gainers.slice(0, 4).forEach((g) => {
      liveItems.push({ symbol: g.symbol, level: g.lastPrice, changePct: g.changePct, tag: 'TOP GAINER' });
    });
  }

  if (topMovers?.losers && topMovers.losers.length > 0) {
    topMovers.losers.slice(0, 3).forEach((l) => {
      liveItems.push({ symbol: l.symbol, level: l.lastPrice, changePct: l.changePct, tag: 'LOSER' });
    });
  }

  const tickerList = liveItems.length > 0 ? liveItems : DEFAULT_TICKERS;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim().toUpperCase();
    if (!q) return;
    navigate(`/ai-picks?symbol=${q}`);
    setSearchQuery('');
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070d1e] text-slate-900 dark:text-slate-100 font-sans flex flex-col transition-colors duration-200 selection:bg-blue-600 selection:text-white">

      {/* ── 1. PREMIUM TOP NAVBAR (VERY TOP) ── */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#070e24]/95 backdrop-blur-xl border-b border-slate-200/80 dark:border-[#192447] px-3.5 sm:px-6 py-2.5 flex items-center justify-between shadow-sm transition-colors shrink-0">

        {/* Left: Brand Logo & Mobile Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            <span className="text-sm">☰</span>
          </button>

          <Link to="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-xs group-hover:scale-105 transition-transform shrink-0">
              T
            </div>
            <div>
              <div className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-1 leading-none">
                TradeBuddy
              </div>
              <div className="text-[8px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-400 font-mono mt-0.5">
                POWERED BY QUANTILOT.AI
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Global Quick Search Input */}
        <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center flex-1 max-w-md mx-4 lg:mx-6">
          <div className="relative w-full">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker, radar setup, or index (e.g. RELIANCE, NIFTY)..."
              className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-200 dark:border-[#1e2a52] bg-slate-100/80 dark:bg-[#0c1636] text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </form>

        {/* Right: Market Status + Quick Actions + Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Live / Closed Market Badge — sourced from the server's holiday-aware
              calendar (marketSlice.fetchMarketStatus), not a local weekday+clock
              guess, so this can never say OPEN on an NSE holiday when every
              prediction on the page already knows the market is closed. */}
          {marketStatus?.isOpen ? (
            <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10.5px] font-mono font-bold" title={marketStatus.holiday ?? undefined}>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>NSE CASH · OPEN</span>
            </div>
          ) : marketStatus ? (
            <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10.5px] font-mono font-bold" title={marketStatus.holiday ?? marketStatus.session}>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>NSE CASH · {marketStatus.session === 'HOLIDAY' ? 'HOLIDAY' : 'CLOSED'}</span>
            </div>
          ) : null}


          {/* Quick AI Trigger */}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs shadow-md shadow-blue-600/25 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span>🐼</span>
            <span className="hidden xs:inline sm:inline">Ask AI</span>
          </button>

          {/* Alerts Link */}
          <Link
            to="/alerts"
            className="relative p-2 rounded-xl bg-slate-100 dark:bg-[#0c1636] border border-slate-200 dark:border-[#1e2a52] hover:bg-slate-200 dark:hover:bg-[#121f47] text-slate-700 dark:text-slate-300 transition-colors"
            title="View Alerts"
          >
            <span className="text-xs sm:text-sm">🔔</span>
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-blue-600 text-white font-mono text-[9px] font-black flex items-center justify-center">
              4
            </span>
          </Link>

          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-2 rounded-xl bg-slate-100 dark:bg-[#0c1636] border border-slate-200 dark:border-[#1e2a52] hover:bg-slate-200 dark:hover:bg-[#121f47] text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <span className="text-xs sm:text-sm">{theme === 'dark' ? '🌙' : '☀️'}</span>
          </button>

          {/* User Profile Avatar */}
          <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-[#192447]">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-[11px] sm:text-xs shadow-sm">
              {initials(user?.fullName, user?.email)}
            </div>
          </div>
        </div>
      </header>

      {/* ── MOBILE SLIDE-OUT DRAWER OVERLAY ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          />

          {/* Drawer Content */}
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-[#070e24] border-r border-slate-200 dark:border-[#192447] flex flex-col justify-between p-4 z-10 shadow-2xl h-full overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-[#192447]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-base shadow-md">
                    🐼
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900 dark:text-white">TradeBuddy</div>
                    <div className="text-[8px] font-mono text-blue-500 font-bold">QUANTILOT AI</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Mobile Search */}
              <form onSubmit={handleSearchSubmit} className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ticker..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#1e2a52] bg-slate-100 dark:bg-[#0c1636] text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none"
                />
              </form>

              {/* Navigation Links */}
              <nav className="space-y-0.5 sidebar-custom">
                {NAV_LINKS.map((l) => (
                  <NavLink
                    key={l.to + l.label}
                    to={l.to}
                    end={l.to === '/dashboard'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all ${
                        isActive
                          ? 'sidebar-link-active shadow-xs'
                          : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 group-hover:text-slate-700'}`}>{l.icon}</span>
                        <span className="flex-1">{l.label}</span>
                        {l.badge && (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 text-[10.5px] font-semibold font-mono">
                            {l.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}

                <div className="pt-3.5 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                  SYSTEM
                </div>
                {SYSTEM_LINKS.map((l) => (
                  <NavLink
                    key={l.to + l.label}
                    to={l.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all ${
                        isActive
                          ? 'sidebar-link-active shadow-xs'
                          : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 group-hover:text-slate-700'}`}>{l.icon}</span>
                        <span>{l.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}

                {isAdmin && (
                  <>
                    <div className="pt-3.5 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
                      ADMIN
                    </div>
                    {ADMIN_LINKS.map((l) => (
                      <NavLink
                        key={l.to + l.label}
                        to={l.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all ${
                            isActive
                              ? 'sidebar-link-active shadow-xs'
                              : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 group-hover:text-slate-700'}`}>{l.icon}</span>
                            <span>{l.label}</span>
                          </>
                        )}
                      </NavLink>
                    ))}
                  </>
                )}
              </nav>
            </div>

            {/* Mobile Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#192447]">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-100 dark:bg-[#0c1636] border border-slate-200 dark:border-[#1e2a52] text-xs">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white text-xs">
                  {initials(user?.fullName, user?.email)}
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {user?.fullName ?? 'Arjun R.'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-semibold">Pro Trader</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. LAYOUT BODY: SIDEBAR (LEFT) + DASHBOARD/CONTENT PANE (RIGHT) ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── STICKY LEFT SIDEBAR (STARTS DIRECTLY UNDER TOP NAVBAR) ── */}
        <aside className="w-60 shrink-0 sidebar-custom border-r border-slate-200/90 dark:border-[#192447] flex flex-col justify-between p-3 hidden md:flex sticky top-[53px] h-[calc(100vh-53px)] overflow-y-auto z-20 shadow-xs transition-colors" style={{ scrollbarWidth: 'thin' }}>

          <div className="space-y-3">
            {/* Core Navigation Links */}
            <nav className="space-y-0.5">
              {NAV_LINKS.map((l) => (
                <NavLink
                  key={l.to + l.label}
                  to={l.to}
                  end={l.to === '/dashboard'}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'sidebar-link-active shadow-xs'
                        : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}>{l.icon}</span>
                      <span className="flex-1 tracking-normal">{l.label}</span>
                      {l.badge && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300 text-[10.5px] font-semibold font-mono">
                          {l.badge}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}

              <div className="pt-3 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                SYSTEM
              </div>
              {SYSTEM_LINKS.map((l) => (
                <NavLink
                  key={l.to + l.label}
                  to={l.to}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
                      isActive
                        ? 'sidebar-link-active shadow-xs'
                        : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}>{l.icon}</span>
                      <span className="tracking-normal">{l.label}</span>
                    </>
                  )}
                </NavLink>
              ))}

              {isAdmin && (
                <>
                  <div className="pt-3 pb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 font-mono">
                    ADMIN
                  </div>
                  {ADMIN_LINKS.map((l) => (
                    <NavLink
                      key={l.to + l.label}
                      to={l.to}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
                          isActive
                            ? 'sidebar-link-active shadow-xs'
                            : 'sidebar-link hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`shrink-0 transition-colors ${isActive ? 'text-[var(--sidebar-primary)]' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'}`}>{l.icon}</span>
                          <span className="tracking-normal">{l.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </>
              )}
            </nav>
          </div>



          {/* Sidebar Footer: User Card */}
          <div className="pt-3 border-t border-slate-200 dark:border-[#192447]">
            <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-100 dark:bg-[#0c1636] border border-slate-200 dark:border-[#1e2a52] text-xs shadow-inner">
              <div className="relative">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                  {initials(user?.fullName, user?.email)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-[#0c1636]" />
              </div>
              <div className="overflow-hidden flex-1">
                <div className="font-bold text-slate-900 dark:text-white truncate text-xs">
                  {user?.fullName ?? user?.email?.split('@')[0] ?? 'Anshul'}
                </div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                  <span>⚡ Pro Trader</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── 3. RIGHT CONTENT PANE (BOARD SIDE) ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#070d1e] overflow-y-auto transition-colors">

          {/* ── INDICES SLIDING TICKER BAR (ONLY ON BOARD SIDE) ── */}
          <div className="bg-slate-900 dark:bg-[#030712] border-b border-slate-800 dark:border-[#192447] overflow-hidden py-1.5 px-3 sm:px-4 text-xs font-mono select-none flex items-center shadow-inner shrink-0 z-10">
            <div className="flex-1 overflow-hidden">
              <div className="animate-marquee-infinite flex items-center gap-6 whitespace-nowrap">
                {[...tickerList, ...tickerList, ...tickerList, ...tickerList].map((t, i) => {
                  const isNeg = t.changePct < 0;
                  return (
                    <span key={i} className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-lg hover:bg-white/[0.06] transition-colors cursor-default">
                      {t.tag && (
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${t.tag === 'INDEX'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : isNeg
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                          {t.tag}
                        </span>
                      )}
                      <span className="text-slate-300 font-semibold">{t.symbol}</span>
                      <span className="text-white font-bold">{formatNumber(t.level)}</span>
                      <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${isNeg ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                        {formatPct(t.changePct)}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── MAIN CONTENT VIEW ── */}
          <main className="flex-1 p-3 sm:p-4 md:p-5 lg:p-6 max-w-[1440px] w-full mx-auto">
            {children}
          </main>

          {/* ── 4. LOWER SIDE DISCLAIMER FOOTER ── */}
          <footer className="mt-auto px-3.5 sm:px-6 py-2.5 sm:py-3 bg-amber-500/10 dark:bg-[#0b132b]/80 border-t border-amber-500/20 dark:border-[#192447] flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] sm:text-xs text-amber-900 dark:text-slate-400 transition-colors">
            <div className="flex items-center gap-1.5 sm:gap-2 text-center sm:text-left">
              <strong className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 font-bold shrink-0">
                <span>🧠</span> Smart, Not Psychic —
              </strong>
              <span className="font-light">
                AI predictions can be wrong, delayed, or overturned by unexpected market events. Treat every signal as information—not a promise.
              </span>
            </div>
            <div className="font-mono text-[9.5px] sm:text-[10px] text-slate-400 shrink-0">
              TradeBuddy v2.4 · SEBI Research Disclaimer Applies
            </div>
          </footer>
        </div>
      </div>

      {/* Fullscreen TradePanda Chat Popup */}
      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}