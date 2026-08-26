export function MetricsSection() {
  return (
    <section className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] text-white py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden border-y border-[#1c2541]">
      <div className="absolute top-0 right-1/3 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-20 relative z-10">
        
        {/* Top Sapphire Header */}
        <div className="max-w-3xl space-y-4">
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-white leading-tight">
            Coordinate every trade with{' '}
            <span className="font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-electric-200 via-electric-400 to-blue-300">
              surgical AI precision.
            </span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
            Institutional-grade reliability engineered to process millions of WebSocket ticks across NSE, BSE, and global markets during high-volatility sessions.
          </p>
        </div>

        {/* 4 Sapphire Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-3xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
            <span className="text-[11px] font-mono text-electric-400 font-bold">LATENCY</span>
            <div className="text-3xl font-bold font-mono text-white">sub-12ms</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Direct WebSocket pipes into Zerodha Kite, Groww &amp; broker gateways with zero intermediary delays.
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
            <span className="text-[11px] font-mono text-electric-400 font-bold">PREDICTION WIN RATE</span>
            <div className="text-3xl font-bold font-mono text-white">88.4%</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Tested against live market signals across NIFTY 50, BankNifty, and high-volume F&amp;O stocks.
            </p>
          </div>

          <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
            <span className="text-[11px] font-mono text-electric-400 font-bold">UPTIME SLA</span>
            <div className="text-3xl font-bold font-mono text-white">99.98%</div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Redundant cloud clusters ensure continuous scanning, WebSocket streaming, and stop-loss execution.
            </p>
          </div>
        </div>

        {/* Massive Editorial Statement in Dark Sapphire */}
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
  );
}
