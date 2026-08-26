import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { BrokersBar } from '../components/landing/BrokersBar';
import { Footer } from '../components/landing/Footer';
export function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<string>('Overview');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [simSymbol, setSimSymbol] = useState<string>('NIFTY 50');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const simData: Record<string, { target: string; stop: string; wr: string; conf: number; setup: string; rsi: string; vwap: string; type: string; pandaTip: string }> = {
    'NIFTY 50': { target: '24,850 (+140 pts)', stop: '24,650 (-60 pts)', wr: '88.4%', conf: 94, setup: '0DTE Gamma Sweep + VWAP Breakout', rsi: '62.4 (Strong Bullish)', vwap: 'Above VWAP (+42 pts)', type: 'Index Options', pandaTip: 'Panda alert: Heavy call buying detected in 24800 strikes!' },
    'BANKNIFTY': { target: '52,400 (+380 pts)', stop: '51,850 (-170 pts)', wr: '85.1%', conf: 91, setup: 'HDFC & ICICI Block Order Inflow', rsi: '65.2 (High Momentum)', vwap: 'Above VWAP (+110 pts)', type: 'F&O Derivatives', pandaTip: 'Panda alert: Banking index leading morning momentum.' },
    'NVDA':     { target: '$138.50 (+7.8%)', stop: '$125.00 (-2.6%)', wr: '89.2%', conf: 95, setup: 'Dark Pool 0DTE 130C Call Sweep', rsi: '64.8 (Breakout Flow)', vwap: 'Above VWAP (+$2.10)', type: 'US Equities / Options', pandaTip: 'Panda alert: 4,500 lot dark pool block execution.' },
    'RELIANCE': { target: '₹3,160 (+2.4%)',  stop: '₹2,975 (-1.1%)',  wr: '86.7%', conf: 89, setup: 'EMA 20/50 Cross + Delivery Volume Spurt', rsi: '61.0 (Accumulation)', vwap: 'Above VWAP (+₹18)', type: 'NSE Equity', pandaTip: 'Panda alert: Delivery volume 2.4x 30-day average.' },
    'BTC/USDT': { target: '$69,500 (+4.8%)', stop: '$63,200 (-1.9%)', wr: '84.0%', conf: 87, setup: 'Order Book Liquidity Sweep at $64.5k', rsi: '58.5 (Volume Surge)', vwap: 'Above VWAP (+$820)', type: 'Crypto Perpetuals', pandaTip: 'Panda alert: Bids absorbed at key $64.2k support.' },
  };

  const tabContent = [
    {
      label: '1. Multi-Indicator Radar',
      title: 'Spot high-probability institutional setups with zero hesitation.',
      desc: 'Real-time multi-exchange radar processes EMA crossovers, RSI divergence, ATR volatility bands, and dark pool volume spikes simultaneously.',
      points: [
        { h: 'Institutional Flow & Dark Pool Radar', b: 'Track massive block orders and unusual 0DTE options sweeps milliseconds before retail screeners.' },
        { h: 'Deterministic Multi-Indicator Convergence', b: 'Evaluates EMA 20/50, RSI(14) momentum, ATR dynamic trailing bands, and VWAP positioning in parallel.' },
        { h: 'Instant Webhook Triggers', b: 'Bridge TradingView strategies, custom Python bots, or Telegram alerts straight into live execution.' },
      ],
      badge: 'Live Radar Active',
      stat1: '5,200 / sec',
      stat1Label: 'Websocket Ticks',
      stat2: 'sub-12ms',
      stat2Label: 'Execution Speed',
    },
    {
      label: '2. Multi-Broker Smart Router',
      title: 'Execute across Zerodha, Groww, AngelOne & IBKR from one terminal.',
      desc: 'Connect your favorite Indian and Global broker accounts with OAuth2. Split, scale, and route orders simultaneously with zero slippage.',
      points: [
        { h: 'One-Click Multi-Broker Execution', b: 'Route orders to Zerodha Kite, Groww, AngelOne, Upstox, Dhan, or IBKR from a single hotkey.' },
        { h: 'Dynamic ATR Trailing Stops', b: 'Algorithmic trailing stops lock in profits as market momentum expands in your direction.' },
        { h: 'Unified Margin & Portfolio View', b: 'Track combined live P&L, margin utilization, and open risk across all brokerages simultaneously.' },
      ],
      badge: 'Multi-Broker Gateway',
      stat1: '6 Brokers',
      stat1Label: 'Simultaneous API',
      stat2: '0.00%',
      stat2Label: 'Slippage Guard',
    },
    {
      label: '3. Capital Shield Kill-Switch',
      title: 'Automated hardware-level risk management that eliminates blowout days.',
      desc: 'Capital Shield enforces strict discipline by auto-flattening positions and locking your terminal when maximum loss limits are approached.',
      points: [
        { h: 'Automated Daily Drawdown Kill-Switch', b: 'Instantly exits all open trades and locks execution if daily loss threshold is breached.' },
        { h: 'Dynamic Position Size Calculator', b: 'Auto-calculates lot size based on account balance, stop distance, and custom 1% risk rules.' },
        { h: 'Tilt & Revenge Trading Lockout', b: 'Panda AI detects over-leveraging or rapid emotional re-entries and enforces a cool-down timer.' },
      ],
      badge: 'Capital Shield Armed',
      stat1: '100%',
      stat1Label: 'Automated Defense',
      stat2: '$0',
      stat2Label: 'Unmanaged Risk',
    },
  ];

  const handleSimulate = (sym: string) => {
    setSimSymbol(sym);
    setSimulating(true);
    setTimeout(() => setSimulating(false), 400);
  };

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#0f172a] font-sans antialiased selection:bg-[#2563eb] selection:text-white">

      <Navbar />
      <HeroSection />
      <BrokersBar />

      {/* ======================================================================
          SECTION 2 — THE BENTO MATRIX (5-Card Layout)
          ====================================================================== */}
      <section id="platform" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-50 border border-electric-200 text-electric-700 text-xs font-semibold mb-3">
            <span>🐼 Powered by TradePanda AI</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900 max-w-2xl leading-[1.12]">
            The operating system for{' '}
            <span className="font-serif italic font-normal text-electric-600">trading operations.</span>
          </h2>
          <p className="mt-4 text-[#78716c] text-sm sm:text-base max-w-xl">
            Everything active traders and prop firms need to scan, automate, and safeguard capital from a unified interface.
          </p>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {['Overview', 'Order Flow Radar', 'Smart Execution', 'Capital Shield', 'Trade Journal'].map((cat) => (
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

        {/* Bento Grid: 3 Top Cards, 2 Bottom Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Multi-Indicator Radar */}
          <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-7 flex flex-col justify-between min-h-[380px] relative overflow-hidden shadow-sm hover:shadow-lg transition-all">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">01 / Order Flow Radar</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">Multi-Indicator Convergence</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Evaluates EMA 20/50, RSI(14) divergence, and ATR dynamic volatility bands across thousands of tickers in parallel.
              </p>
            </div>

            {/* Inner White UI Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-6 relative z-10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">BANKNIFTY 52000 CE</span>
                <span className="font-mono text-electric-600 font-bold text-[11px] bg-electric-50 px-2 py-0.5 rounded border border-electric-200">
                  RSI: 65.2 · Flow High
                </span>
              </div>
              <div className="text-[11px] text-[#78716c] bg-[#faf9f5] p-2.5 rounded-xl border border-[#f0ece1] font-mono">
                Entry ₹340.00 · Target ₹420.00 · Stop ₹295.00
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#78716c]">
                <span className="w-1.5 h-1.5 rounded-full bg-electric-600" /> Panda auto-synced open chart windows
              </div>
            </div>
          </div>

          {/* Card 2: Sapphire Dark Blue Execution Hub Card */}
          <div 
            className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] rounded-3xl border border-electric-900/60 p-6 sm:p-7 flex flex-col justify-between min-h-[380px] text-white relative overflow-hidden shadow-xl"
          >
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-electric-500/15 rounded-full blur-2xl pointer-events-none" />

            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-400 font-bold block mb-2">02 / Execution Hub</span>
              <h3 className="text-xl font-bold tracking-tight text-white mb-2">Multi-Broker Smart Route</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Connect Zerodha, Groww, AngelOne, Upstox, Dhan, or IBKR. Orders split and route in sub-12 milliseconds.
              </p>
            </div>

            {/* Dark Inner Card */}
            <div className="bg-[#111d4a] rounded-2xl p-4 border border-electric-800/60 mt-6 space-y-2 relative z-10">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Route: Zerodha + Groww</span>
                <span className="text-electric-300 font-mono text-[11px] font-bold">Filled 100% (4ms)</span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono">
                Avg Fill: ₹24,710 · Latency: 4ms · Zero Slippage
              </div>
            </div>
          </div>

          {/* Card 3: Capital Shield Drawdown Guard */}
          <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-7 flex flex-col justify-between min-h-[380px] relative overflow-hidden shadow-sm hover:shadow-lg transition-all">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">03 / Capital Shield</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">Automated Drawdown Guard</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Hardware-grade risk limits. Auto-flatten all positions if daily drawdown breaches your predefined limit.
              </p>
            </div>

            {/* Inner White UI Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-6 relative z-10 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-900">Daily Risk Status</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-electric-100 text-electric-800 font-bold">ARMED</span>
              </div>
              <div className="w-full bg-[#f0ede6] h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-electric-600 to-electric-400 h-full w-[24%]" />
              </div>
              <div className="flex justify-between text-[10px] text-[#78716c] font-mono">
                <span>Drawdown: -0.48%</span>
                <span>Max Limit: -1.50%</span>
              </div>
            </div>
          </div>

          {/* Card 4: Light Grid Card (Bottom Left 2/3 Width) */}
          <div className="md:col-span-2 bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-8 flex flex-col justify-between min-h-[320px] shadow-sm">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">04 / Self-Writing Journal</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                Automated trade tagging, analytics, and behavioral coaching.
              </h3>
              <p className="text-xs sm:text-sm text-[#78716c] leading-relaxed max-w-xl">
                Every trade is automatically tagged with setup type, risk-reward ratio, execution latency, and emotional discipline score.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Win Rate</div>
                <div className="text-lg font-bold font-mono text-electric-700">88.4%</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Profit Factor</div>
                <div className="text-lg font-bold font-mono text-slate-900">2.84×</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Avg R:R</div>
                <div className="text-lg font-bold font-mono text-slate-900">1 : 3.2</div>
              </div>
            </div>
          </div>

          {/* Card 5: Sandstone Topography Texture Card (Bottom Right 1/3 Width) */}
          <div className="bg-[#e4decfa0] rounded-3xl border border-[#d6d0c2] p-6 sm:p-7 flex flex-col justify-between min-h-[320px] shadow-sm">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">05 / Visual Strategy Builder</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">No-Code Logic</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Connect EMA crossovers, options flow, and VWAP rules with simple visual blocks.
              </p>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 border border-[#d6d0c2] text-xs font-mono text-slate-900 space-y-1 shadow-sm">
              <div className="text-[10px] text-electric-700 font-bold">RULE #14 ACTIVE</div>
              <div className="font-bold">IF Vol &gt; 2.5x &amp; EMA20 &gt; EMA50</div>
              <div className="text-[#57534e]">THEN Route Zerodha Kite API</div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 3 — TWO-COLUMN TRADE PANDA SHOWCASE
          ====================================================================== */}
      <section className="bg-[#f0eee6] border-y border-[#e2decfa0] py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Storytelling & Testimonial */}
          <div className="lg:col-span-6 space-y-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#d6d0c2] text-xs font-semibold text-slate-800 shadow-sm">
              <span className="text-base">🐼</span>
              <span className="font-mono">Meet TradePanda AI Assistant</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-normal leading-[1.12] tracking-tight text-slate-900">
              The only trading buddy that wakes up the second{' '}
              <span className="font-serif italic font-normal text-electric-600">alpha strikes.</span>
            </h2>

            <p className="text-[#78716c] text-sm sm:text-base leading-relaxed">
              Curled up peacefully at its multi-screen desk until unusual volume or options sweeps hit the tape. TradePanda wakes up, stretches, adjusts its headset, and pinpoints exact entry and stop levels for you.
            </p>

            <div className="pt-4 border-t border-[#dfdbcf] space-y-3">
              <p className="text-sm italic text-[#57534e] leading-relaxed">
                "Trading used to be lonely and stressful. With TradePanda watching the radar 24/7, I never worry about missing breakout prints or breaking my daily risk rules."
              </p>
              <div className="flex items-center gap-3">
                <img 
                  className="w-10 h-10 rounded-full object-cover border border-[#d6d0c2]" 
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80" 
                  alt="Trader" 
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">Arjun Mehta</div>
                  <div className="text-[11px] text-[#78716c]">Head of Quantitative Execution, Vertex Alpha Fund</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Video Scene Player Card */}
          <div className="lg:col-span-6">
            <div className="bg-gradient-to-br from-[#0b132b] via-[#0f172a] to-[#1e293b] rounded-3xl border border-slate-700/60 p-6 sm:p-8 relative overflow-hidden shadow-2xl space-y-5 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-electric-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-electric-400 animate-ping" />
                    <span className="text-xs font-mono font-bold text-slate-200">TradePanda Animated Stream · 60 FPS</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-electric-950 border border-electric-500/40 text-electric-300">
                    Live Active
                  </span>
                </div>

                <div className="bg-[#070c18] rounded-2xl p-5 border border-slate-800/80 space-y-3">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>NIFTY / BANKNIFTY Multi-Screen Desk</span>
                    <span className="text-electric-400 font-mono text-[11px]">94% Prob</span>
                  </div>

                  <div className="bg-[#0b132b] rounded-xl p-3 border border-slate-800 text-[11px] font-mono space-y-1 text-slate-300">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Panda's Diagnosis:</span>
                      <span className="text-electric-300 font-bold">Call Sweeps + Volume Spike</span>
                    </div>
                    <div className="text-white font-bold">"Buy Stop ₹142.50 · Target ₹188.00"</div>
                    <div className="text-[10px] text-slate-500">"Adjusted headset. Sizing capped to 1% risk."</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 4 — INTERACTIVE SLIDER / TAB WORKFLOW
          ====================================================================== */}
      <section id="solutions" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-left mb-12">
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900 max-w-3xl leading-[1.12]">
            Catch every move, execute every trade, and protect accounts{' '}
            <span className="font-serif italic font-normal text-electric-600">3x faster.</span>
          </h2>
          <p className="mt-4 text-[#78716c] text-sm sm:text-base max-w-xl">
            A battle-tested workflow engineered for zero hesitation and surgical execution precision.
          </p>

          {/* Tab Selection Buttons */}
          <div className="flex flex-wrap gap-2 mt-8">
            {tabContent.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-tight transition-all ${
                  activeTab === idx
                    ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/20'
                    : 'bg-[#eeeee8] text-[#78716c] hover:bg-[#e4e4dd] hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2-Column Tab Content Card */}
        <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-sm">
          
          {/* Left Column: Accordion-like Feature List */}
          <div className="lg:col-span-6 space-y-6">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 leading-snug">
              {tabContent[activeTab].title}
            </h3>
            <p className="text-xs sm:text-sm text-[#78716c] leading-relaxed">
              {tabContent[activeTab].desc}
            </p>

            <div className="space-y-3 pt-2">
              {tabContent[activeTab].points.map((pt, pIdx) => (
                <div key={pIdx} className="bg-white rounded-2xl p-4 border border-[#e8e4d8] space-y-1 shadow-sm">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-electric-600" />
                    {pt.h}
                  </div>
                  <p className="text-[11px] text-[#78716c] leading-relaxed pl-3.5">
                    {pt.b}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Visual UI Card */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#e8e4d8] shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#f0ede6]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-electric-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-900">{tabContent[activeTab].badge}</span>
                </div>
                <span className="text-[10px] font-mono text-electric-700 font-bold bg-electric-50 border border-electric-200 px-2 py-0.5 rounded">
                  TradeBuddy Core v2.4
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#faf9f5] p-3.5 rounded-2xl border border-[#f0ece1]">
                  <div className="text-[10px] text-[#78716c] uppercase font-medium">{tabContent[activeTab].stat1Label}</div>
                  <div className="text-lg font-bold font-mono text-slate-900">{tabContent[activeTab].stat1}</div>
                </div>
                <div className="bg-[#faf9f5] p-3.5 rounded-2xl border border-[#f0ece1]">
                  <div className="text-[10px] text-[#78716c] uppercase font-medium">{tabContent[activeTab].stat2Label}</div>
                  <div className="text-lg font-bold font-mono text-electric-600">{tabContent[activeTab].stat2}</div>
                </div>
              </div>

              <div className="p-3.5 bg-[#faf9f5] rounded-2xl border border-[#f0ece1] text-xs space-y-2">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Real-Time Engine Status</span>
                  <span className="text-electric-700 font-mono font-bold">100% HEALTHY</span>
                </div>
                <div className="text-[11px] text-[#78716c]">
                  Automated latency monitoring, token refresh, and socket reconnect active.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-[#78716c]">
                <span>All connected brokers synced</span>
                <span className="font-bold text-slate-900 font-mono">Active (4ms)</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 5 — MASSIVE SAPPHIRE BLUE EDITORIAL & METRICS SECTION
          ====================================================================== */}
      <section className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] text-white py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden border-y border-[#1c2541]">
        <div className="absolute top-0 right-1/3 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-20 relative z-10">
          
          {/* Top Sapphire Header */}
          <div className="max-w-3xl space-y-4">
            <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-white leading-tight">
              Coordinate on every trade with{' '}
              <span className="font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-electric-200 via-electric-400 to-blue-300">
                surgical AI precision.
              </span>
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
              Institutional-grade reliability engineered to handle millions of websocket ticks during high-volatility market open sessions.
            </p>
          </div>

          {/* 4 Sapphire Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-3xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">LATENCY</span>
              <div className="text-3xl font-bold font-mono text-white">sub-12ms</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Direct WebSocket pipes into broker execution gateways with zero intermediary delays.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">ANNUAL VOLUME</span>
              <div className="text-3xl font-bold font-mono text-white">$4.2B+</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Over four billion dollars in equities, options, and futures routed seamlessly.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">SIGNAL ACCURACY</span>
              <div className="text-3xl font-bold font-mono text-white">88.4%</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Backtested against 10+ years of tick data across NYSE, NASDAQ, and NSE markets.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">UPTIME SLA</span>
              <div className="text-3xl font-bold font-mono text-white">99.98%</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Redundant cloud clusters ensure continuous scanning and stop execution uptime.
              </p>
            </div>
          </div>

          {/* Massive Editorial Serif Statement in Dark Sapphire */}
          <div className="max-w-4xl mx-auto text-center pt-12 border-t border-[#1c2541] space-y-6">
            <h3 className="text-3xl sm:text-5xl lg:text-[52px] font-serif font-normal text-white leading-[1.25]">
              Today, traders see only a fraction of their setups. Orders fill late. Slippage eats edge. And unmanaged risk costs accounts.
            </h3>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              TradeBuddy solves the fundamental fragmentation in retail and prop desk trading infrastructure.
            </p>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 6 — LIVE TERMINAL SIMULATOR DASHBOARD
          ====================================================================== */}
      <section id="simulator" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-[#e2decfa0] shadow-xl p-6 sm:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#f0ede6]">
            <div>
              <h3 className="text-2xl sm:text-3xl font-normal tracking-tight text-slate-900">
                Review every trade. <span className="font-serif italic text-electric-600">Act on what it finds.</span>
              </h3>
              <p className="text-xs text-[#78716c] mt-1">
                Simulate AI confidence, dynamic stops, and target projections for any asset.
              </p>
            </div>

            {/* Ticker Selector Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {['NIFTY 50', 'BANKNIFTY', 'NVDA', 'RELIANCE', 'BTC/USDT'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => handleSimulate(sym)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    simSymbol === sym
                      ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/30'
                      : 'bg-[#f4f4f0] text-[#78716c] hover:bg-[#e8e8e2] hover:text-slate-900'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Simulation Dashboard View */}
          <div className="bg-[#faf9f5] rounded-3xl border border-[#eeebe2] p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold font-mono text-slate-900">{simSymbol}</span>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-electric-50 text-electric-800 border border-electric-200 font-mono">
                    {simData[simSymbol]?.setup}
                  </span>
                </div>
                <div className="text-xs text-[#78716c] mt-1 font-mono">
                  Asset: {simData[simSymbol]?.type} · RSI: {simData[simSymbol]?.rsi} · {simData[simSymbol]?.vwap}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-[#78716c] font-mono">Panda AI Confidence</div>
                <div className="text-3xl font-bold font-mono text-electric-700">
                  {simulating ? 'Calculating...' : `${simData[simSymbol]?.conf}%`}
                </div>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Projected Target</div>
                <div className="text-xl font-bold text-electric-700 mt-1">{simData[simSymbol]?.target}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Risk-Reward 1:3.2</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Hard Circuit Stop</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{simData[simSymbol]?.stop}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Capital Shield Protected</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Historical Win Rate</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{simData[simSymbol]?.wr}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Sample: 1,420 Trades</div>
              </div>
            </div>

            {/* Panda Tip Banner */}
            <div className="bg-white p-3.5 rounded-2xl border border-electric-200/80 flex items-center gap-3 text-xs text-slate-800 shadow-sm">
              <span className="text-lg">🐼</span>
              <span className="font-medium">{simData[simSymbol]?.pandaTip}</span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[#eeebe2] text-xs text-[#78716c]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-electric-600 animate-pulse" />
                <span>Simulation model updated via live websocket stream</span>
              </div>

              <Link 
                to="/dashboard"
                className="px-5 py-2.5 bg-gradient-to-r from-electric-700 to-electric-600 hover:from-electric-600 hover:to-electric-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-electric-600/20"
              >
                Execute in Terminal →
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 7 — PRICING
          ====================================================================== */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#e5e5e0]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900">
            Transparent pricing for <span className="font-serif italic text-electric-600">every desk.</span>
          </h2>
          <p className="text-sm text-[#78716c]">
            Start free, scale seamlessly. Zero hidden broker markups or per-trade commission fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <div className="bg-[#f0eee6] rounded-3xl p-8 border border-[#e2decfa0] flex flex-col justify-between space-y-6 shadow-sm">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Starter Desk</h3>
              <p className="text-xs text-[#78716c]">Essential AI signal radar and automated trade journaling.</p>
              <div className="text-4xl font-normal font-serif text-slate-900">
                $0 <span className="text-xs font-sans text-[#78716c]">/ forever free</span>
              </div>

              <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
                <li className="flex items-center gap-2">✓ 15 AI radar signals per day</li>
                <li className="flex items-center gap-2">✓ 1 connected broker API</li>
                <li className="flex items-center gap-2">✓ Automatic trade journaling</li>
                <li className="flex items-center gap-2">✓ Community Discord support</li>
              </ul>
            </div>

            <Link
              to="/login"
              className="w-full py-3 text-center rounded-2xl bg-white hover:bg-[#faf9f5] border border-[#d6d0c2] text-slate-900 font-bold text-xs transition-all shadow-sm"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro Quant (Featured Dark Sapphire Card) */}
          <div className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] text-white rounded-3xl p-8 border border-electric-500/80 flex flex-col justify-between space-y-6 shadow-2xl relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-electric-600 to-electric-400 text-white text-[10px] font-bold uppercase tracking-wider px-3.5 py-0.5 rounded-full shadow-md">
              Most Popular
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-bold text-white">Pro Quant</h3>
              <p className="text-xs text-slate-300">For active day traders, scalpers, and systematic momentum desks.</p>
              <div className="text-4xl font-normal font-serif text-white">
                $49 <span className="text-xs font-sans text-slate-400">/ month</span>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-4 border-t border-slate-800">
                <li className="flex items-center gap-2">✓ Unlimited real-time AI radar signals</li>
                <li className="flex items-center gap-2">✓ Multi-broker smart routing (sub-12ms)</li>
                <li className="flex items-center gap-2">✓ Capital Shield circuit breaker defense</li>
                <li className="flex items-center gap-2">✓ Visual Strategy Builder &amp; Webhooks</li>
                <li className="flex items-center gap-2">✓ 10-Year historical tick backtesting</li>
              </ul>
            </div>

            <Link
              to="/dashboard"
              className="w-full py-3.5 text-center rounded-2xl bg-gradient-to-r from-electric-600 to-electric-500 hover:from-electric-500 hover:to-electric-400 text-white font-bold text-xs transition-all shadow-lg shadow-electric-600/30 hover:scale-105"
            >
              Start 14-Day Free Trial
            </Link>
          </div>

          {/* Prop Firm */}
          <div className="bg-[#f0eee6] rounded-3xl p-8 border border-[#e2decfa0] flex flex-col justify-between space-y-6 shadow-sm">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">Prop Firm</h3>
              <p className="text-xs text-[#78716c]">Custom infrastructure for trading desks, funds, and multi-user firms.</p>
              <div className="text-4xl font-normal font-serif text-slate-900">
                $199 <span className="text-xs font-sans text-[#78716c]">/ month</span>
              </div>

              <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
                <li className="flex items-center gap-2">✓ Everything in Pro Quant</li>
                <li className="flex items-center gap-2">✓ Dedicated sub-5ms API gateway</li>
                <li className="flex items-center gap-2">✓ Multi-account risk orchestration</li>
                <li className="flex items-center gap-2">✓ Custom webhook integrations</li>
                <li className="flex items-center gap-2">✓ Priority 24/7 dedicated engineering support</li>
              </ul>
            </div>

            <Link
              to="/login"
              className="w-full py-3 text-center rounded-xl bg-white hover:bg-[#faf9f5] border border-[#d6d0c2] text-slate-900 font-bold text-xs transition-all shadow-sm"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* ======================================================================
          SECTION 8 — FAQ ACCORDION
          ====================================================================== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto border-t border-[#e5e5e0]">
        <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-slate-900 text-center mb-10">
          Frequently asked <span className="font-serif italic text-electric-600">questions.</span>
        </h2>

        <div className="space-y-3">
          {[
            {
              q: 'How does TradeBuddy connect to my brokerage without storing passwords?',
              a: 'We use official OAuth 2.0 API tokens (such as Zerodha Kite Connect, AngelOne SmartAPI, and Interactive Brokers Gateway). Your credentials never touch our servers.',
            },
            {
              q: 'Can the Capital Shield circuit breaker flatten positions automatically?',
              a: 'Yes. When armed, Capital Shield operates directly at the gateway layer to instantly submit market exit orders if your predefined daily loss threshold is breached.',
            },
            {
              q: 'Does TradeBuddy support Indian markets (NSE & BSE) as well as US equities?',
              a: 'Yes! We provide full coverage for US Equities (NYSE/NASDAQ), Options Flow, and Indian Equities/F&O via Zerodha, Groww, AngelOne, Upstox, and Dhan.',
            },
            {
              q: 'Can I connect my TradingView alerts and Python bots?',
              a: 'Yes. Every TradeBuddy account includes dedicated webhook endpoints with signature authentication for automated webhook-to-broker execution.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
              className="bg-[#f0eee6] rounded-2xl border border-[#e2decfa0] p-4.5 cursor-pointer hover:border-[#d6d0c2] transition-colors shadow-sm"
            >
              <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-900">
                <span>{item.q}</span>
                <span className="text-[#78716c] font-normal text-base ml-4 flex-shrink-0">
                  {faqOpen === idx ? '−' : '+'}
                </span>
              </div>
              {faqOpen === idx && (
                <p className="text-xs text-[#78716c] mt-3 pt-3 border-t border-[#dfdbcf] leading-relaxed">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================================
          SECTION 9 — FOOTER (Dark Sapphire Blue Footer)
          ====================================================================== */}
      <Footer />

    </div>
  );
}
