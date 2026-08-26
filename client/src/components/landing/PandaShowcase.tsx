export function PandaShowcase() {
  return (
    <section className="bg-[#f0eee6] border-y border-[#e2decfa0] py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        {/* Left Column: Storytelling & Testimonial */}
        <div className="lg:col-span-6 space-y-7">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#d6d0c2] text-xs font-semibold text-slate-800 shadow-sm">
            <span className="text-base">🐼</span>
            <span className="font-mono">Meet TradePanda AI Assistant</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-normal leading-[1.12] tracking-tight text-slate-900">
            The only AI trading companion that wakes up the second{' '}
            <span className="font-serif italic font-normal text-electric-600">alpha strikes.</span>
          </h2>

          <p className="text-[#78716c] text-sm sm:text-base leading-relaxed">
            Curled up peacefully at its multi-screen trading desk until high-probability RSI breakout or options volume sweeps hit the tape. TradePanda wakes up, rubs its eyes, stretches, adjusts its headset, and pinpoints exact entries, targets, and stop levels for Zerodha Kite, Groww &amp; premier brokers.
          </p>

          <div className="pt-4 border-t border-[#dfdbcf] space-y-3">
            <p className="text-sm italic text-[#57534e] leading-relaxed">
              "Trading NIFTY options used to be stressful. With TradePanda scanning 5,200 tickers 24/7, I get automated entry alerts and Capital Shield protection that prevents revenge trading."
            </p>
            <div className="flex items-center gap-3">
              <img 
                className="w-10 h-10 rounded-full object-cover border border-[#d6d0c2]" 
                src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80" 
                alt="Trader" 
              />
              <div>
                <div className="font-bold text-xs text-slate-900">Arjun Mehta</div>
                <div className="text-[11px] text-[#78716c]">Quantitative Execution Lead · NIFTY &amp; F&amp;O Options Desk</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Video Scene Feature Card */}
        <div className="lg:col-span-6">
          <div className="bg-gradient-to-br from-[#0b132b] via-[#0f172a] to-[#1e293b] rounded-3xl border border-slate-700/60 p-6 sm:p-8 relative overflow-hidden shadow-2xl space-y-5 text-white">
            <div className="absolute top-0 right-0 w-64 h-64 bg-electric-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-electric-400 animate-ping" />
                  <span className="text-xs font-mono font-bold text-slate-200">TradePanda AI Live Terminal Stream</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-electric-950 border border-electric-500/40 text-electric-300">
                  Live Active
                </span>
              </div>

              <div className="bg-[#070c18] rounded-2xl p-5 border border-slate-800/80 space-y-3">
                <div className="text-xs font-bold text-white flex items-center justify-between">
                  <span>NIFTY 24800 CE Options Setup</span>
                  <span className="text-electric-400 font-mono text-[11px]">94% Prob</span>
                </div>

                <div className="bg-[#0b132b] rounded-xl p-3 border border-slate-800 text-[11px] font-mono space-y-1 text-slate-300">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-slate-400">Panda AI Diagnosis:</span>
                    <span className="text-electric-300 font-bold">VWAP Breakout + Volume Spike</span>
                  </div>
                  <div className="text-white font-bold">"Buy Stop ₹142.00 · Target ₹188.00 (+32%)"</div>
                  <div className="text-[10px] text-slate-500">"Routing to Zerodha Kite API with 1% Capital Shield."</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
