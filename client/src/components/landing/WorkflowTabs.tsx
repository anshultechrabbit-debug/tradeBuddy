import { useState } from 'react';

export function WorkflowTabs() {
  const [activeTab, setActiveTab] = useState<number>(0);

  const tabContent = [
    {
      label: '1. Multi-Indicator Radar',
      title: 'Spot high-probability institutional setups with zero hesitation.',
      desc: 'Real-time multi-exchange radar processes EMA crossovers, RSI divergence, Supertrend bands, MACD, and VWAP positioning simultaneously.',
      points: [
        { h: 'Institutional Flow & Volume Spurt Radar', b: 'Track massive order flow and breakout patterns across NIFTY, BANKNIFTY & F&O tickers in real-time.' },
        { h: 'Deterministic Multi-Indicator Convergence', b: 'Evaluates EMA 20/50, RSI(14) momentum, ATR trailing volatility bands, and VWAP positioning in parallel.' },
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
      title: 'Execute across Zerodha, Groww, AngelOne, Upstox & IBKR from one terminal.',
      desc: 'Connect your broker accounts via official OAuth2 API gateways. Split, scale, and route orders simultaneously with zero slippage.',
      points: [
        { h: 'One-Click Multi-Broker Execution', b: 'Route orders to Zerodha Kite, Groww, AngelOne, Upstox, Dhan, Fyers, or IBKR from a single interface.' },
        { h: 'Dynamic ATR Trailing Stops', b: 'Algorithmic trailing stops lock in profits as market momentum expands in your direction.' },
        { h: 'Unified Margin & Portfolio View', b: 'Track combined live P&L, margin utilization, and open risk across all brokerages simultaneously.' },
      ],
      badge: 'Multi-Broker Gateway',
      stat1: '6+ Brokers',
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
      stat2: '₹0',
      stat2Label: 'Unmanaged Risk',
    },
  ];

  return (
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
        
        {/* Left Column: Feature List */}
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
              <span>Zerodha, Groww, AngelOne &amp; IBKR Synced</span>
              <span className="font-bold text-slate-900 font-mono">Active (4ms)</span>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
