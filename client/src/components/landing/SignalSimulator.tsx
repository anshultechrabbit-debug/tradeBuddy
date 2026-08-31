import { useState } from 'react';
import { Link } from 'react-router-dom';

export function SignalSimulator() {
  const [simSymbol, setSimSymbol] = useState<string>('NIFTY 50');
  const [simulating, setSimulating] = useState<boolean>(false);

  const simData: Record<string, { target: string; stop: string; wr: string; conf: number; setup: string; rsi: string; vwap: string; type: string; pandaTip: string }> = {
    'NIFTY 50': { target: '24,850 (+140 pts)', stop: '24,650 (-60 pts)', wr: '88.4%', conf: 94, setup: '0DTE Gamma Sweep + VWAP Breakout', rsi: '62.4 (Strong Bullish)', vwap: 'Above VWAP (+42 pts)', type: 'Index Options', pandaTip: 'TradePanda AI: Heavy call buying detected in 24800 strikes!' },
    'BANKNIFTY': { target: '52,400 (+380 pts)', stop: '51,850 (-170 pts)', wr: '85.1%', conf: 91, setup: 'HDFC & ICICI Block Order Inflow', rsi: '65.2 (High Momentum)', vwap: 'Above VWAP (+110 pts)', type: 'F&O Derivatives', pandaTip: 'TradePanda AI: Banking index leading morning momentum.' },
    'RELIANCE': { target: '₹3,160 (+2.4%)',  stop: '₹2,975 (-1.1%)',  wr: '86.7%', conf: 89, setup: 'EMA 20/50 Cross + Delivery Volume Spurt', rsi: '61.0 (Accumulation)', vwap: 'Above VWAP (+₹18)', type: 'NSE Equity', pandaTip: 'TradePanda AI: Delivery volume 2.4x 30-day average.' },
    'NVDA':     { target: '$138.50 (+7.8%)', stop: '$125.00 (-2.6%)', wr: '89.2%', conf: 95, setup: 'Dark Pool 0DTE 130C Call Sweep', rsi: '64.8 (Breakout Flow)', vwap: 'Above VWAP (+$2.10)', type: 'US Equities / Options', pandaTip: 'TradePanda AI: 4,500 lot dark pool block execution.' },
    'BTC/USDT': { target: '$69,500 (+4.8%)', stop: '$63,200 (-1.9%)', wr: '84.0%', conf: 87, setup: 'Order Book Liquidity Sweep at $64.5k', rsi: '58.5 (Volume Surge)', vwap: 'Above VWAP (+$820)', type: 'Crypto Perpetuals', pandaTip: 'TradePanda AI: Bids absorbed at key $64.2k support.' },
  };

  const handleSimulate = (sym: string) => {
    setSimSymbol(sym);
    setSimulating(true);
    setTimeout(() => setSimulating(false), 400);
  };

  return (
    <section id="simulator" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="bg-white rounded-3xl border border-[#e2decfa0] shadow-xl p-6 sm:p-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#f0ede6]">
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-display">
              Live AI Signal Simulator. <span className="text-electric-600 font-bold">Test setups in real time.</span>
            </h3>
            <p className="text-xs text-[#78716c] mt-1">
              Simulate TradePanda AI confidence, dynamic stops, RSI/VWAP signals, and target projections for NIFTY, BANKNIFTY &amp; F&amp;O stocks.
            </p>
          </div>

          {/* Ticker Selector Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {['NIFTY 50', 'BANKNIFTY', 'RELIANCE', 'NVDA', 'BTC/USDT'].map((sym) => (
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
              <div className="text-xs text-[#78716c] font-mono">TradePanda AI Confidence</div>
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
              <span>Simulation model updated via live WebSocket engine</span>
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
  );
}
