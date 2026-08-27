import { useState, type ReactNode } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { useTheme } from '../hooks/useTheme';
import { useLiveMarketSync } from '../hooks/useLiveMarketSync';
import { formatNumber, formatPct } from '../lib/format';
import { TradePandaChat } from './TradePandaChat';

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

const DEFAULT_TICKERS = [
  { symbol: 'NIFTY 50',   level: 24780.40, change: 618.55, changePct: 0.82 },
  { symbol: 'BANK NIFTY', level: 53410.65, change: -88.48, changePct: -0.17 },
  { symbol: 'NIFTY IT',   level: 42918.20, change: 618.55, changePct: 1.44 },
  { symbol: 'INDIA VIX',  level: 12.84,    change: -0.42,  changePct: -3.17 },
  { symbol: 'USD/INR',    level: 83.42,    change: 0.05,   changePct: 0.06 },
  { symbol: 'GOLD (MCX)', level: 72148,    change: 312,    changePct: 0.43 },
];

function initials(name?: string | null, email?: string) {
  const src = name?.trim() || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function Layout({ children }: { children: ReactNode }) {
  useLiveMarketSync();

  const location  = useLocation();
  const navigate  = useNavigate();
  const user      = useAppSelector((s) => s.auth.user);
  const indices   = useAppSelector((s) => s.market.indices);
  const topMovers = useAppSelector((s) => s.market.top);
  const isAdmin   = user?.role === 'ADMIN';
  const { theme, toggleTheme } = useTheme();

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

          <Link to="/dashboard" className="flex items-center gap-2 sm:gap-2.5 group">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-base sm:text-lg shadow-md shadow-blue-600/30 group-hover:scale-105 transition-transform shrink-0">
              🐼
            </div>
            <div>
              <div className="text-sm sm:text-base font-extrabold tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5 leading-none">
                TradeBuddy
              </div>
              <div className="text-[8px] sm:text-[8.5px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                QUANTILOT AI
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
          {/* Live Market Badge */}
          <div className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-[10.5px] font-mono font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>NSE CASH · OPEN</span>
          </div>

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
              <nav className="space-y-1">
                <div className="px-3 pt-1 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                  CORE TERMINAL
                </div>
                {NAV_LINKS.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === '/dashboard'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300 dark:border dark:border-blue-500/40'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                      }`
                    }
                  >
                    <span className="text-base">{l.icon}</span>
                    <span className="flex-1">{l.label}</span>
                    {l.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-[10px] font-mono font-bold">
                        {l.badge}
                      </span>
                    )}
                  </NavLink>
                ))}

                <div className="pt-3 pb-1 px-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                  SYSTEM
                </div>
                {SYSTEM_LINKS.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                      }`
                    }
                  >
                    <span className="text-base">{l.icon}</span>
                    <span>{l.label}</span>
                  </NavLink>
                ))}

                {isAdmin && (
                  <>
                    <div className="pt-3 pb-1 px-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                      ADMIN
                    </div>
                    {ADMIN_LINKS.map((l) => (
                      <NavLink
                        key={l.to}
                        to={l.to}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                            isActive
                              ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                          }`
                        }
                      >
                        <span className="text-base">{l.icon}</span>
                        <span>{l.label}</span>
                      </NavLink>
                    ))}
                  </>
                )}
              </nav>
            </div>

            {/* Mobile Footer */}
            <div className="pt-3 border-t border-slate-200 dark:border-[#192447]">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-100 dark:bg-[#0c1636] border border-slate-200 dark:border-[#1e2a52] text-xs">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white text-xs">
                  {initials(user?.fullName, user?.email)}
                </div>
                <div className="overflow-hidden flex-1">
                  <div className="font-bold text-slate-900 dark:text-white truncate">
                    {user?.fullName ?? user?.email?.split('@')[0] ?? 'Anshul'}
                  </div>
                  <div className="text-[10px] text-blue-500 font-semibold">⚡ Pro Trader</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. LAYOUT BODY: SIDEBAR (LEFT) + DASHBOARD/CONTENT PANE (RIGHT) ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── STICKY LEFT SIDEBAR (STARTS DIRECTLY UNDER TOP NAVBAR) ── */}
        <aside className="w-64 shrink-0 bg-white dark:bg-[#070e24] border-r border-slate-200 dark:border-[#192447] flex flex-col justify-between p-3.5 hidden md:flex sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto z-20 shadow-sm transition-colors" style={{ scrollbarWidth: 'thin' }}>

          <div className="space-y-4">
            <div className="px-3 pt-1 text-[9.5px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
              CORE TERMINAL
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1">
              {NAV_LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === '/dashboard'}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300 dark:border dark:border-blue-500/40 shadow-sm shadow-blue-500/10'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                    }`
                  }
                >
                  <span className="text-base group-hover:scale-110 transition-transform">{l.icon}</span>
                  <span className="flex-1 tracking-tight">{l.label}</span>
                  {l.badge && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 text-[10px] font-extrabold font-mono border border-blue-200 dark:border-blue-500/30">
                      {l.badge}
                    </span>
                  )}
                </NavLink>
              ))}

              <div className="pt-4 pb-1 px-3 text-[9.5px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                SYSTEM &amp; CONTROLS
              </div>
              {SYSTEM_LINKS.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300 dark:border dark:border-blue-500/40 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                    }`
                  }
                >
                  <span className="text-base group-hover:scale-110 transition-transform">{l.icon}</span>
                  <span className="tracking-tight">{l.label}</span>
                </NavLink>
              ))}

              {isAdmin && (
                <>
                  <div className="pt-4 pb-1 px-3 text-[9.5px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 font-mono">
                    ADMIN SUITE
                  </div>
                  {ADMIN_LINKS.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      className={({ isActive }) =>
                        `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                          isActive
                            ? 'bg-blue-50 text-blue-600 font-bold dark:bg-blue-600/20 dark:text-blue-300 dark:border dark:border-blue-500/40 shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                        }`
                      }
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">{l.icon}</span>
                      <span className="tracking-tight">{l.label}</span>
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
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          t.tag === 'INDEX'
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
                      <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded ${
                        isNeg ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
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