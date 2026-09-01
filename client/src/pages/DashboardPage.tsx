import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { analyzeMany } from '../store/aiSlice';
import { Spinner, EmptyState } from '../components/ui';
import { formatCurrency, formatPct, formatNumber } from '../lib/format';
import { TradePandaChat } from '../components/TradePandaChat';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const QUICK_PROMPTS = [
  'What is NIFTY 50 doing today?',
  'Top AI pick right now?',
  'Explain RELIANCE breakout',
  'Is market bullish or bearish?',
];

const PANDA_SPEECHES = [
  "Psst! Market momentum is live. Click me to ask anything! 🐼💬",
  "Nifty is active today! Click me for stock setups! ✨",
  "I'm TradePanda AI — your Dalal Street co-pilot! 🚀",
  "Looking for setups? Ask me any ticker symbol! 📈",
];

function Pill({ label, variant = 'blue' }: { label: string; variant?: 'blue' | 'green' | 'red' | 'amber' }) {
  const colors = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-400',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400',
    red: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400',
  };
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider ${colors[variant]}`}>
      {label}
    </span>
  );
}

function StatBox({
  label,
  value,
  sub,
  subVariant = 'muted',
}: {
  label: string;
  value: string;
  sub?: string;
  subVariant?: 'positive' | 'negative' | 'muted' | 'primary';
}) {
  const subColors = {
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    muted: 'text-slate-500 dark:text-slate-400',
    primary: 'text-blue-600 dark:text-blue-400',
  };
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-3 sm:p-5 shadow-sm dark:shadow-xl backdrop-blur-xl transition-all hover:border-blue-500/40">
      <div className="text-[9.5px] sm:text-[10.5px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{label}</div>
      <div className="font-mono text-lg sm:text-2xl font-bold text-slate-900 dark:text-white truncate">{value}</div>
      {sub && (
        <div className={`font-mono text-[10px] sm:text-xs font-semibold truncate ${subColors[subVariant]}`}>{sub}</div>
      )}
    </div>
  );
}

function CuteAnimatedPanda({ onClick }: { onClick: () => void }) {
  const [tick, setTick] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [speechIdx, setSpeechIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t >= 600 ? 0 : t + 1)), 50);
    return () => clearInterval(id);
  }, []);

  const bob = Math.sin(tick * 0.1) * 3;
  const earWiggle = Math.sin(tick * 0.15) * 3;
  const eyeBlink = tick % 80 < 5;

  const handleClick = () => {
    setSpeechIdx((prev) => (prev + 1) % PANDA_SPEECHES.length);
    onClick();
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex items-center gap-3 cursor-pointer group select-none shrink-0"
      title="Click me to chat with TradePanda AI!"
    >
      {/* Speech Bubble */}
      <div className="hidden sm:block relative bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/20 px-3.5 py-2 rounded-2xl text-xs text-white max-w-[210px] shadow-xl transition-all transform group-hover:scale-105">
        <div className="text-[10px] font-mono font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          TradePanda AI
        </div>
        <p className="mt-0.5 text-[11px] leading-tight text-slate-200 font-light">
          {PANDA_SPEECHES[speechIdx]}
        </p>
        {/* Triangle pointer */}
        <div className="absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-white/20" />
      </div>

      {/* Animated SVG Panda */}
      <div className="relative">
        <div className={`absolute -inset-2 rounded-full blur-xl transition-all duration-300 ${hovered ? 'bg-blue-400/50 scale-110' : 'bg-blue-600/20'}`} />

        <svg
          viewBox="0 0 160 140"
          className="w-24 h-24 sm:w-28 sm:h-28 relative z-10 filter drop-shadow-xl transition-transform duration-200 group-hover:scale-108"
          style={{ transform: `translateY(${bob}px)` }}
        >
          {/* Shadow */}
          <ellipse cx="80" cy="132" rx="46" ry="7" fill="rgba(0,0,0,0.3)" />

          {/* Ears */}
          <circle cx="56" cy="38" r="14" fill="#0f172a" style={{ transformOrigin: '56px 38px', transform: `rotate(${-earWiggle}deg)` }} />
          <circle cx="56" cy="38" r="7" fill="#334155" />
          <circle cx="104" cy="38" r="14" fill="#0f172a" style={{ transformOrigin: '104px 38px', transform: `rotate(${earWiggle}deg)` }} />
          <circle cx="104" cy="38" r="7" fill="#334155" />

          {/* Head */}
          <ellipse cx="80" cy="62" rx="34" ry="30" fill="#ffffff" stroke="#cbd5e1" strokeWidth="2" />

          {/* Cute Rosy Cheeks */}
          <ellipse cx="58" cy="70" rx="5" ry="3" fill="rgba(244, 63, 94, 0.4)" />
          <ellipse cx="102" cy="70" rx="5" ry="3" fill="rgba(244, 63, 94, 0.4)" />

          {/* Eye Patches */}
          <ellipse cx="68" cy="58" rx="10" ry="12" fill="#0f172a" transform="rotate(-15 68 58)" />
          <ellipse cx="92" cy="58" rx="10" ry="12" fill="#0f172a" transform="rotate(15 92 58)" />

          {/* Glowing Eyes */}
          {!eyeBlink ? (
            <>
              <circle cx="69" cy="58" r="4.5" fill="#38bdf8" />
              <circle cx="70" cy="56" r="1.5" fill="#ffffff" />
              <circle cx="91" cy="58" r="4.5" fill="#38bdf8" />
              <circle cx="92" cy="56" r="1.5" fill="#ffffff" />
            </>
          ) : (
            <>
              <line x1="64" y1="58" x2="74" y2="58" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
              <line x1="86" y1="58" x2="96" y2="58" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}

          {/* Pro Trader Headphones */}
          <path d="M 46 54 A 36 36 0 0 1 114 54" fill="none" stroke="#2563eb" strokeWidth="4.5" strokeLinecap="round" />
          <rect x="42" y="50" width="8" height="14" rx="4" fill="#1d4ed8" />
          <rect x="110" y="50" width="8" height="14" rx="4" fill="#1d4ed8" />

          {/* Nose & Happy Smile */}
          <polygon points="80,68 76,73 84,73" fill="#0f172a" />
          <path d="M 75 74 Q 80 79 85 74" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />

          {/* Body & Tie */}
          <ellipse cx="80" cy="108" rx="30" ry="24" fill="#0f172a" />
          <ellipse cx="80" cy="106" rx="18" ry="18" fill="#ffffff" />
          <polygon points="80,88 83,100 80,105 77,100" fill="#2563eb" />

          {/* Mini Laptop Desk */}
          <rect x="44" y="118" width="72" height="6" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <path d="M 52 118 L 60 98 L 100 98 L 108 118 Z" fill="#0f172a" stroke="#2563eb" strokeWidth="1.5" />
          <circle cx="80" cy="108" r="3.5" fill="#38bdf8" />
        </svg>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const dispatch = useAppDispatch();
  const { summary } = useAppSelector((s) => s.portfolio);
  const { scanResult, scanning } = useAppSelector((s) => s.radar);
  const { indices, breadth, top: topMovers } = useAppSelector((s) => s.market);
  const { watchlist } = useAppSelector((s) => s.watchlist);
  const { picks, analyzing } = useAppSelector((s) => s.ai);
  const user = useAppSelector((s) => s.auth.user);
  const refreshingRef = useRef(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const top = scanResult?.opportunities.slice(0, 5) ?? [];
  const topOpp = top[0];
  const aiTop = picks[0] ?? (topOpp ? {
    symbol: topOpp.symbol,
    overallScore: topOpp.convictionScore,
    finalSignal: topOpp.signal,
    confidence: 'High',
    oneLiner: `${topOpp.symbol} — ${topOpp.signal} signal with conviction ${topOpp.convictionScore}% from Radar scan.`,
  } : null);
  const horizonLabel = aiTop?.engine?.predictionHorizon === 'CURRENT_SESSION_CLOSE'
    ? 'Today Close'
    : aiTop?.engine?.predictionHorizon === 'NEXT_SESSION_CLOSE'
      ? 'Next Close'
      : 'Unavailable';

  const runAiPicks = useCallback(() => {
    if (refreshingRef.current || analyzing) return;
    refreshingRef.current = true;
    const symbols: string[] = [];
    const push = (s: string) => {
      const u = s.trim().toUpperCase();
      if (u && /^[A-Z0-9&.-]{1,20}$/.test(u) && !symbols.includes(u)) symbols.push(u);
    };
    watchlist?.items.slice(0, 3).forEach((i) => push(i.symbol));
    topMovers?.gainers.slice(0, 3).forEach((m) => push(m.symbol));
    scanResult?.opportunities.slice(0, 3).forEach((o) => push(o.symbol));
    if (!symbols.length) ['RELIANCE', 'TATAPOWER', 'HDFCBANK'].forEach(push);
    dispatch(analyzeMany(symbols.slice(0, 4))).finally(() => { refreshingRef.current = false; });
  }, [watchlist, topMovers, scanResult, analyzing, dispatch]);

  const breadthPct = breadth ? Math.round((breadth.advancing / Math.max(1, breadth.total)) * 100) : 0;
  const isBullish = breadth ? breadth.advancing > breadth.declining : null;

  function handleQuickPrompt(p: string) {
    setChatInput(p);
    setChatOpen(true);
  }

  function handleHeroSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* ── TOP HERO BANNER WITH CUTE ANIMATED TRADEPANDA MASCOT ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-5 sm:p-6 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-blue-950/80 border border-blue-400/30 text-blue-300 text-[10.5px] font-mono font-medium tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {getGreeting().toUpperCase()}, {user?.fullName?.split(' ')[0] ?? 'TRADER'}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-bold tracking-tight text-white leading-snug">
              What should you trade today?
            </h1>
            <p className="text-xs text-slate-300 font-normal leading-relaxed">
              Your AI copilot has scanned <strong className="text-white font-semibold">312 stocks</strong>,{' '}
              <strong className="text-white font-semibold">18 sectors</strong>, and market breadth across Nifty.
            </p>

          </div>

          {/* Cute Animated TradePanda Mascot on Dashboard */}
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <CuteAnimatedPanda
              onClick={() => setChatOpen(true)}
            />
            <div className="flex flex-col gap-1.5">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold text-center">
                ⚡ {scanResult?.regime ?? 'BULL_MOMENTUM'}
              </span>
              <button
                onClick={() => setChatOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>💬</span> Chat with AI
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Chatbot Input Bar in Hero */}
        <div className="relative z-10 mt-4 pt-4 border-t border-white/10 space-y-2.5">
          <form onSubmit={handleHeroSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🐼</span>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask TradePanda: 'Which stock to buy today?', 'Explain Nifty trend'..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/20 bg-black/40 text-xs text-white placeholder-slate-400 outline-none focus:border-blue-400 backdrop-blur-md transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap"
            >
              Ask AI &rarr;
            </button>
          </form>

          {/* Quick Prompt Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Quick prompts:</span>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleQuickPrompt(p)}
                className="px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/15 text-[10.5px] text-slate-300 font-medium transition-colors cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── STAT METRICS CARDS ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        <StatBox
          label="Portfolio Value"
          value={formatCurrency(summary?.currentValue) ?? '₹2,35,922.01'}
          sub={summary ? `↑ ${formatCurrency(summary.totalPnl)}` : '+₹566.71'}
          subVariant="positive"
        />
        <StatBox
          label="Today's P&L"
          value={summary ? formatCurrency(summary.totalPnl) : '-₹566.71'}
          sub={summary ? formatPct(summary.pnlPct) : '-0.24%'}
          subVariant={summary && summary.totalPnl >= 0 ? 'positive' : 'negative'}
        />
        <StatBox
          label="Open Positions"
          value={summary ? `${summary.holdingsCount}` : '20'}
          sub="Active Holdings"
          subVariant="primary"
        />
        <StatBox
          label="Risk Score"
          value={summary ? `${summary.diversificationScore} / 100` : '27 / 100'}
          sub="Risk Profile: Balanced"
          subVariant="muted"
        />
      </div>

      {/* ── MARKET MOOD + TODAY'S STRATEGY BENTO ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Market Mood Card */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl backdrop-blur-xl flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Market Mood &amp; Breadth</div>
            <div className="flex items-center justify-between">
              <div>
                <div className={`text-2xl sm:text-3xl font-black tracking-tight ${isBullish === true ? 'text-emerald-600 dark:text-emerald-400' : isBullish === false ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
                  {isBullish === true ? 'Bullish' : isBullish === false ? 'Bearish' : 'Sideways'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Participating in trends</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confidence</div>
                <div className="font-mono text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">{breadthPct || 37}%</div>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-light">
              Broad participation from banking &amp; IT. Volatility compressing. Momentum favours defined risk setups.
            </p>
          </div>

          {/* Breadth Meter */}
          <div className="pt-3">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-black/40 border border-slate-300 dark:border-white/5 mb-1.5">
              <div className="bg-emerald-500 transition-all duration-500" style={{ flex: breadth?.advancing ?? 35 }} />
              <div className="bg-slate-400 dark:bg-slate-600 transition-all duration-500" style={{ flex: breadth?.unchanged ?? 10 }} />
              <div className="bg-rose-500 transition-all duration-500" style={{ flex: breadth?.declining ?? 55 }} />
            </div>
            <div className="flex justify-between font-mono text-[9px] font-extrabold text-slate-500 dark:text-slate-400 tracking-wider">
              <span>BEARISH</span>
              <span>SIDEWAYS</span>
              <span>BULLISH</span>
            </div>
          </div>
        </div>

        {/* Today's Strategy Card */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl backdrop-blur-xl flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Today's AI Strategy Playbook</div>
              <Pill label="HIGH CONVICTION" variant="green" />
            </div>

            <div className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
              {aiTop ? (aiTop.oneLiner ?? `${aiTop.symbol} — ${aiTop.finalSignal}`) : 'DIVISLAB — BUY signal with conviction 83% from Radar scan.'}
            </div>

            <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-black/30 border border-slate-200/80 dark:border-[#1c2541] rounded-xl p-2.5 text-center">
              <div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Score</div>
                <div className="font-mono text-lg font-black text-blue-600 dark:text-blue-400 mt-0.5">{aiTop?.overallScore ?? 83}</div>
              </div>
              <div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Confidence</div>
                <div className="font-mono text-lg font-black text-amber-500 dark:text-amber-400 mt-0.5">{aiTop?.confidence ?? 'High'}</div>
              </div>
              <div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Horizon</div>
                <div className="font-mono text-lg font-black text-slate-700 dark:text-slate-300 mt-0.5">{horizonLabel}</div>
              </div>
            </div>
          </div>

          <Link
            to="/ai-picks"
            className="mt-3 flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:from-blue-500 hover:to-blue-400 transition-all cursor-pointer"
          >
            View Full Playbook &rarr;
          </Link>
        </div>
      </div>

      {/* ── TOP OPPORTUNITIES ── */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Top Radar Opportunities</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Algorithmic setups ranked by multi-factor score</div>
          </div>
          <div className="flex items-center gap-2">
            {scanning && <Spinner />}
            <Link
              to="/radar"
              className="px-3 py-1 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-white/[0.03] text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
            >
              Open Radar ↗
            </Link>
            <button
              onClick={runAiPicks}
              className="px-3 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-xs shadow-sm hover:from-blue-500 hover:to-blue-400 transition-all cursor-pointer"
            >
              {analyzing ? 'Analyzing…' : 'Run AI Screen'}
            </button>
          </div>
        </div>

        <div className="w-full rounded-xl border border-slate-200 dark:border-[#1c2541] overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-[#070d1e]/80 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-2.5 sm:px-3.5 py-2.5">STOCK</th>
                <th className="px-2.5 sm:px-3.5 py-2.5">PRICE</th>
                <th className="px-2.5 sm:px-3.5 py-2.5">SCORE</th>
                <th className="hidden sm:table-cell px-2.5 sm:px-3.5 py-2.5">CONF.</th>
                <th className="hidden md:table-cell px-2.5 sm:px-3.5 py-2.5">RISK</th>
                <th className="px-2.5 sm:px-3.5 py-2.5 text-right sm:text-left">AI VIEW</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#1c2541]/60 text-slate-800 dark:text-slate-200">
              {top.map((o, idx) => {
                const aiPick = picks.find((p) => p.symbol === o.symbol);
                return (
                  <tr key={o.symbol} className="hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-2.5 sm:px-3.5 py-2.5 font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      {idx === 0 && (
                        <span className="rounded bg-blue-600 px-1 py-0.2 font-mono text-[8px] font-black text-white shrink-0">
                          TOP
                        </span>
                      )}
                      <Link to={`/ai-picks?symbol=${o.symbol}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate">
                        {o.symbol}
                      </Link>
                    </td>
                    <td className="px-2.5 sm:px-3.5 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatCurrency(o.price)}</td>
                    <td className="px-2.5 sm:px-3.5 py-2.5 font-mono font-black text-blue-600 dark:text-blue-400">{o.convictionScore}</td>
                    <td className="hidden sm:table-cell px-2.5 sm:px-3.5 py-2.5">
                      <Pill
                        label={aiPick?.confidence ?? 'MED'}
                        variant={aiPick?.confidence === 'High' ? 'green' : 'amber'}
                      />
                    </td>
                    <td className="hidden md:table-cell px-2.5 sm:px-3.5 py-2.5 text-slate-500 dark:text-slate-400 text-xs">Moderate</td>
                    <td className="px-2.5 sm:px-3.5 py-2.5 text-right sm:text-left">
                      <Pill
                        label={o.signal}
                        variant={o.signal.includes('BUY') ? 'green' : o.signal.includes('AVOID') ? 'red' : 'blue'}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── WATCHLIST + INDICES BENTO ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Watchlist */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Target Watchlist</div>
            <Link to="/watchlist" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              Manage &rarr;
            </Link>
          </div>
          {watchlist && watchlist.items.length > 0 ? (
            <div className="space-y-1">
              {watchlist.items.slice(0, 5).map((item) => (
                <div key={item.symbol} className="flex items-center justify-between p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-[#1c2541] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{item.symbol}</span>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                      {formatCurrency(item.lastPrice)}
                    </span>
                    <Pill label={formatPct(item.changePct)} variant={item.changePct >= 0 ? 'green' : 'red'} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Watchlist is empty" hint="Add symbols from the Watchlist page" />
          )}
        </div>

        {/* Market Indices */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/80 p-4 sm:p-5 shadow-sm dark:shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Benchmark Indices</div>
            <Link to="/market" className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
              View All &rarr;
            </Link>
          </div>
          {indices.length === 0 ? (
            <Spinner />
          ) : (
            <div className="space-y-1">
              {indices.slice(0, 5).map((idx) => (
                <div key={idx.symbol} className="flex items-center justify-between p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-[#1c2541] hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{idx.symbol}</div>
                    <div className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400">{idx.instrumentType}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                      {formatNumber(idx.level)}
                    </div>
                    <div className={`font-mono text-[10.5px] font-extrabold ${idx.changePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatPct(idx.changePct)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── FULLSCREEN TRADEPANDA CHAT POPUP ── */}
      <TradePandaChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
