import { useState } from 'react';

interface MVPModule {
  id: string;
  category: string;
  number: string;
  title: string;
  frontDesc: string;
  frontWidget: React.ReactNode;
  isDark?: boolean;
  // User-Friendly Back Side Details
  keyAdvantage: string;
  howItWorks: string[];
  proTip: string;
  whyYouNeedIt: string;
}

export function BentoMatrix() {
  const [activeCategory, setActiveCategory] = useState<string>('All Features');
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>({});

  const toggleFlip = (id: string) => {
    setFlippedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const categories = [
    'All Features',
    'Connections & Security',
    'Opportunity Radar',
    'AI Strategy Assistant',
    'Portfolio & Watchlist',
    'Journal & Alerts',
  ];

  const modules: MVPModule[] = [
    {
      id: 'm1',
      category: 'Connections & Security',
      number: 'FEATURE 01',
      title: 'Broker Connections & Consent Security',
      frontDesc: 'Connect Zerodha Kite, Upstox & Groww safely. Enjoy 100% passwordless login with AES-256 bank-grade encryption and one-tap access control.',
      isDark: true,
      frontWidget: (
        <div className="bg-[#111d4a] rounded-2xl p-4 border border-electric-800/60 mt-4 space-y-2.5 text-xs text-white">
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Zerodha Kite Connected
            </span>
            <span className="text-[10px] font-mono bg-electric-950 px-2 py-0.5 rounded text-electric-300 border border-electric-700">
              BANK-GRADE ENCRYPTED
            </span>
          </div>
          <div className="text-[11px] text-slate-300 font-mono bg-[#070c18] p-2.5 rounded-xl border border-slate-800 space-y-1">
            <div className="text-slate-400 text-[10px]">Access: Holdings, Positions &amp; Orders</div>
            <div className="text-emerald-400 font-bold">✓ 1-Tap Revoke Available Any Time</div>
          </div>
        </div>
      ),
      keyAdvantage: '100% Passwordless Security & Zero Password Storage',
      howItWorks: [
        'Authorize directly on official Zerodha or Upstox login pages',
        'TradeBuddy receives a secure, encrypted token for live trading',
        'Revoke broker permissions instantly at any time with one click',
      ],
      proTip: 'Connect multiple brokers to split large orders and execute across accounts without opening separate browser tabs.',
      whyYouNeedIt: 'Protects your account credentials while enabling lightning-fast order placement across all your trading accounts.',
    },
    {
      id: 'm2',
      category: 'Opportunity Radar',
      number: 'FEATURE 02',
      title: 'Opportunity Radar & Market Scan',
      frontDesc: 'Scans 5,200+ NSE, BSE & F&O stocks continuously. Automatically ranks top breakout candidates with conviction scores and market regime insights.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900">BANKNIFTY 52400 CE</span>
            <span className="font-mono text-electric-600 font-bold text-[11px] bg-electric-50 px-2 py-0.5 rounded border border-electric-200">
              Conviction Score: 94 / 100
            </span>
          </div>
          <div className="text-[11px] text-[#78716c] bg-[#faf9f5] p-2.5 rounded-xl border border-[#f0ece1] font-mono">
            Setup: Bullish Momentum · VWAP + RSI 65.2 Breakout
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[#78716c]">
            <span className="w-1.5 h-1.5 rounded-full bg-electric-600" /> Live market scanner updated 50x per second
          </div>
        </div>
      ),
      keyAdvantage: 'Instant High-Probability Stock & Options Discovery',
      howItWorks: [
        'Engine monitors price, RSI, VWAP & Supertrend across 5,200+ stocks',
        'Filters out low-quality noise and calculates a 0-100 Conviction Score',
        'Displays top setups in real-time before retail traders notice',
      ],
      proTip: 'Look for conviction scores above 85% during morning opening range breakouts (9:15 AM - 10:30 AM) for maximum momentum.',
      whyYouNeedIt: 'Replaces endless manual stock scanning with an automated AI radar that pinpoints ready-to-move setups.',
    },
    {
      id: 'm3',
      category: 'AI Strategy Assistant',
      number: 'FEATURE 03',
      title: 'TradePanda AI Strategy Assistant',
      frontDesc: 'Get clear Buy, Watch, or Avoid guidance with plain-English explanations so you always know why a trade is recommended.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-900">RELIANCE (NSE)</span>
            <span className="font-mono text-emerald-700 font-bold text-[10px] bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              STRONG BUY SETUP
            </span>
          </div>
          <div className="text-[11px] text-slate-700 bg-[#faf9f5] p-2.5 rounded-xl border border-[#f0ece1] font-sans italic leading-snug">
            "TradePanda: Delivery volume spurt (2.4x) combined with EMA 20/50 golden cross suggests strong institutional buying."
          </div>
        </div>
      ),
      keyAdvantage: 'Plain-English AI Trade Explanations & Confidence',
      howItWorks: [
        'TradePanda AI analyzes technical setup, volume & market trend',
        'Generates an easy-to-read Buy, Watch, or Avoid recommendation',
        'Provides exact entry price, target projection & stop loss level',
      ],
      proTip: 'Ask TradePanda AI in voice or text to double-check any stock before placing your order to avoid entering bad setups.',
      whyYouNeedIt: 'Gives you an experienced AI co-pilot that verifies your trade logic and keeps you focused on high-win setups.',
    },
    {
      id: 'm4',
      category: 'Portfolio & Watchlist',
      number: 'FEATURE 04',
      title: 'Portfolio Intelligence & Risk Guard',
      frontDesc: 'Track live portfolio values, net P&L, sector allocation, and single-stock concentration risk across all your accounts.',
      frontWidget: (
        <div className="grid grid-cols-3 gap-2.5 mt-4">
          <div className="bg-white rounded-2xl p-3 border border-[#e8e4d8] text-center shadow-sm">
            <div className="text-[9px] text-[#78716c] font-medium uppercase">Portfolio Value</div>
            <div className="text-sm font-bold font-mono text-slate-900">₹14,82,500</div>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-[#e8e4d8] text-center shadow-sm">
            <div className="text-[9px] text-[#78716c] font-medium uppercase">Overall P&amp;L</div>
            <div className="text-sm font-bold font-mono text-emerald-600">+₹1.42L</div>
          </div>
          <div className="bg-white rounded-2xl p-3 border border-[#e8e4d8] text-center shadow-sm">
            <div className="text-[9px] text-[#78716c] font-medium uppercase">Top Sector</div>
            <div className="text-sm font-bold font-mono text-slate-900">BFSI (38.2%)</div>
          </div>
        </div>
      ),
      keyAdvantage: 'Unified Multi-Broker Portfolio & Concentration Shield',
      howItWorks: [
        'Syncs holdings automatically from Zerodha, Upstox & Groww',
        'Calculates real-time total net worth, unrealized P&L & sector weighting',
        'Alerts you if a single stock or sector accounts for too much risk',
      ],
      proTip: 'Keep single-stock allocation under 15% to maintain a balanced, resilient portfolio during market pullbacks.',
      whyYouNeedIt: 'Prevents over-exposure to a single stock or sector, protecting your capital from unexpected market shocks.',
    },
    {
      id: 'm5',
      category: 'Portfolio & Watchlist',
      number: 'FEATURE 05',
      title: 'Single-Tap Live Watchlist',
      frontDesc: 'Organize your favorite stocks and index options into a live watchlist with real-time price updates and instant signal links.',
      frontWidget: (
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-3.5 border border-[#d6d0c2] text-xs font-mono text-slate-900 space-y-2 shadow-sm mt-4">
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-bold">NIFTY 50 INDEX</span>
            <span className="text-emerald-600 font-bold">24,780.40 (+0.8%)</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-bold">TATA MOTORS</span>
            <span className="text-emerald-600 font-bold">₹1,042.50 (+1.4%)</span>
          </div>
        </div>
      ),
      keyAdvantage: 'Real-Time Price Streaming & Instant Setup Linking',
      howItWorks: [
        'Add any stock or option strike with one tap',
        'Prices stream live with sub-second tick updates',
        'Click any symbol to view TradePanda AI analysis instantly',
      ],
      proTip: 'Create a dedicated watchlist for NIFTY call/put option strikes to quickly compare premium momentum.',
      whyYouNeedIt: 'Keeps your favorite assets right at your fingertips with zero delay when breakout signals trigger.',
    },
    {
      id: 'm6',
      category: 'Portfolio & Watchlist',
      number: 'FEATURE 06',
      title: 'Smart Dashboard & Market Mood',
      frontDesc: 'A clean, uncluttered dashboard showing your live P&L, top breakout signals, and overall market trend indicator.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-xs space-y-2 shadow-sm mt-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Market Mood Summary:</span>
            <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              BULLISH MOMENTUM
            </span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            Synced with market breadth &amp; institutional order flow
          </div>
        </div>
      ),
      keyAdvantage: 'At-a-Glance Market Overview & Zero Clutter',
      howItWorks: [
        'Aggregates key metrics into clean, easy-to-read visual cards',
        'Displays real-time Market Mood (Bullish, Bearish, or Neutral)',
        'Highlights top trade opportunities ready for execution',
      ],
      proTip: 'Only take aggressive long trades when the Market Mood is Bullish to trade aligned with institutional flow.',
      whyYouNeedIt: 'Saves time every morning by providing an immediate overview of market health before you place a trade.',
    },
    {
      id: 'm7',
      category: 'Journal & Alerts',
      number: 'FEATURE 07',
      title: 'Instant Push & Email Trade Alerts',
      frontDesc: 'Get notified immediately on your phone or inbox whenever TradePanda AI spots a high-probability breakout or stop-loss trigger.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-xs space-y-2 shadow-sm mt-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping" />
            <span>ALERT: NIFTY 24800 CE Breakout Triggered</span>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Delivered instantly via Mobile Push Notification &amp; Email
          </div>
        </div>
      ),
      keyAdvantage: 'Never Miss a Move Even Away From Your Desk',
      howItWorks: [
        'Set custom price triggers or let AI monitor setups automatically',
        'Receive instant push notifications on your smartphone',
        'Click the alert notification to view setup details and execute',
      ],
      proTip: 'Enable push alerts for your target price levels so you can step away from charts without missing entries.',
      whyYouNeedIt: 'Frees you from staring at screens all day while guaranteeing you are alerted the second trades activate.',
    },
    {
      id: 'm8',
      category: 'Journal & Alerts',
      number: 'FEATURE 08',
      title: 'Automated Trade Journal',
      frontDesc: 'Automatically logs all your filled orders from Zerodha & Upstox with entry price, P&L, and space for trade notes.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-xs space-y-2 shadow-sm mt-4">
          <div className="flex justify-between items-center font-bold text-slate-900">
            <span>Zerodha Order #8842</span>
            <span className="text-emerald-600 font-mono">+₹4,250 P&amp;L</span>
          </div>
          <div className="text-[11px] text-slate-500 italic bg-[#faf9f5] p-2 rounded-xl border border-[#f0ece1]">
            Notes: "Followed TradePanda VWAP rule. Exited at Target 1."
          </div>
        </div>
      ),
      keyAdvantage: 'Zero Manual Data Entry & Automated Performance Tracking',
      howItWorks: [
        'Trades auto-import directly from broker APIs after execution',
        'Calculates win rate, profit factor & risk-reward performance',
        'Add quick notes or trade tags to review your trading discipline',
      ],
      proTip: 'Review your trade journal every weekend to identify which setup types generate your highest win rates.',
      whyYouNeedIt: 'Eliminates tedious manual Excel spreadsheets and turns your trade history into actionable performance data.',
    },
    {
      id: 'm9',
      category: 'Journal & Alerts',
      number: 'FEATURE 09',
      title: 'Custom Scanner & Risk Settings',
      frontDesc: 'Tailor TradeBuddy to your style. Customize scan markets (NSE/BSE/F&O), daily risk limits, notification preferences, and quiet hours.',
      frontWidget: (
        <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-xs font-mono text-slate-800 space-y-1.5 shadow-sm mt-4">
          <div className="flex justify-between">
            <span>Scan Universe:</span>
            <span className="font-bold text-electric-700">NSE 500 + F&amp;O</span>
          </div>
          <div className="flex justify-between">
            <span>Risk Profile:</span>
            <span className="font-bold text-slate-900">1.0% Max Loss / Trade</span>
          </div>
        </div>
      ),
      keyAdvantage: 'Fully Personalized Trading Environment & Discipline Guard',
      howItWorks: [
        'Choose your preferred stock universe (NIFTY 50, F&O, Midcaps)',
        'Set maximum daily risk limits to protect your capital',
        'Customize notification sounds, quiet hours & alert channels',
      ],
      proTip: 'Set quiet hours outside market trading times so you can relax without receiving non-critical alerts.',
      whyYouNeedIt: 'Ensures the platform adapts perfectly to your trading strategy, risk tolerance, and schedule.',
    },
  ];

  const filteredModules = modules.filter(
    (m) => activeCategory === 'All Features' || m.category === activeCategory
  );

  return (
    <section id="platform" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="mb-14">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-electric-50 border border-electric-200 text-electric-700 text-xs font-semibold mb-3">
          <span>🐼 TradeBuddy Features &amp; User Experience</span>
        </div>
        <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900 max-w-3xl leading-[1.12]">
          Built for traders.{' '}
          <span className="font-serif italic font-normal text-electric-600">Hover any card to flip 🔄 details!</span>
        </h2>
        <p className="mt-4 text-[#78716c] text-sm sm:text-base max-w-2xl">
          Hover over (or tap) any feature card below to flip it over and discover key advantages, how it works, and TradePanda pro tips!
        </p>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 mt-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/20'
                  : 'bg-[#eeeee8] text-[#57534e] hover:bg-[#e4e4dd]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Bento Grid with Hover 3D Flippable Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filteredModules.map((m) => {
          const isClickFlipped = !!flippedCards[m.id];

          return (
            <div
              key={m.id}
              onClick={() => toggleFlip(m.id)}
              className="group cursor-pointer perspective-1000 min-h-[420px]"
            >
              {/* Card Inner Container with Hover & Click 3D Flip */}
              <div
                className={`relative w-full h-full duration-700 transform-style-3d transition-transform ${
                  isClickFlipped ? 'rotate-y-180' : 'group-hover:rotate-y-180'
                }`}
                style={{
                  transformStyle: 'preserve-3d',
                  transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/* ── FRONT SIDE ── */}
                <div
                  className={`absolute inset-0 backface-hidden rounded-3xl border p-6 sm:p-7 flex flex-col justify-between shadow-sm hover:shadow-xl transition-all ${
                    m.isDark
                      ? 'bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] border-electric-900/60 text-white'
                      : 'bg-[#f0eee6] border-[#e2decfa0] text-slate-900'
                  }`}
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[10px] font-mono uppercase tracking-widest font-bold ${
                          m.isDark ? 'text-electric-400' : 'text-electric-700'
                        }`}
                      >
                        {m.number} / {m.category}
                      </span>
                      <span
                        className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border transition-all ${
                          m.isDark
                            ? 'bg-white/10 border-white/20 text-electric-300 group-hover:bg-electric-600 group-hover:text-white'
                            : 'bg-white border-[#d6d0c2] text-[#78716c] group-hover:bg-electric-600 group-hover:text-white'
                        }`}
                      >
                        Hover to Flip 🔄
                      </span>
                    </div>

                    <h3
                      className={`text-xl font-bold tracking-tight mb-2 ${
                        m.isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {m.title}
                    </h3>
                    <p
                      className={`text-xs leading-relaxed ${
                        m.isDark ? 'text-slate-300' : 'text-[#78716c]'
                      }`}
                    >
                      {m.frontDesc}
                    </p>
                  </div>

                  {m.frontWidget}
                </div>

                {/* ── BACK SIDE (User-Friendly Benefits & How It Works) ── */}
                <div
                  className="absolute inset-0 backface-hidden rounded-3xl border p-6 sm:p-7 flex flex-col justify-between bg-[#0b132b] border-electric-500/50 text-white shadow-2xl rotate-y-180"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                  }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <span className="text-[10px] font-mono text-electric-400 font-bold uppercase tracking-wider">
                        FEATURE BREAKDOWN &amp; BENEFITS
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-electric-950 text-electric-300 border border-electric-700">
                        Front ↩️
                      </span>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase">Key Advantage</div>
                      <div className="text-xs font-bold text-white font-sans">{m.keyAdvantage}</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase mb-1">How It Works</div>
                      <ul className="space-y-1 text-[11px] text-slate-300 font-sans">
                        {m.howItWorks.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="text-electric-400 font-bold flex-shrink-0">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-[#070c18] p-2.5 rounded-xl border border-slate-800 space-y-0.5">
                      <div className="text-[10px] text-electric-400 font-bold flex items-center gap-1 font-mono">
                        <span>🐼 TradePanda Pro Tip:</span>
                      </div>
                      <p className="text-[10.5px] text-slate-300 italic leading-snug">
                        "{m.proTip}"
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 leading-snug">
                    <span className="text-electric-400 font-bold">Why You Need It: </span>
                    {m.whyYouNeedIt}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
