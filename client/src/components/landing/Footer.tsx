import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="border-t border-[#1c2541] bg-[#070d1e] text-slate-400 py-16 px-6 sm:px-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 mb-12">
          
          <div className="col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-electric-700 to-electric-400 text-white font-extrabold flex items-center justify-center text-xs">
                🐼
              </div>
              <span className="font-bold tracking-tight text-base text-white">
                Trade<span className="text-electric-400 font-extrabold">Buddy</span>
              </span>
            </Link>
            <p className="text-xs text-slate-400 max-w-sm leading-relaxed">
              The operating system for modern trading operations. Multi-indicator signal extraction, smart order routing, and automated risk protection powered by TradePanda AI.
            </p>
            <div className="flex items-center gap-2 text-[11px] text-white font-mono">
              <span className="w-2 h-2 rounded-full bg-electric-400 animate-pulse" />
              <span>All broker API gateways operational · 4ms avg latency</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[10px]">Product</div>
            <div><a href="#platform" className="text-slate-400 hover:text-white transition-colors">Signal Radar</a></div>
            <div><a href="#brokers" className="text-slate-400 hover:text-white transition-colors">Execution Hub</a></div>
            <div><a href="#solutions" className="text-slate-400 hover:text-white transition-colors">Capital Shield</a></div>
            <div><a href="#platform" className="text-slate-400 hover:text-white transition-colors">Journal &amp; Analytics</a></div>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[10px]">Brokers</div>
            <div><a href="#brokers" className="text-slate-400 hover:text-white transition-colors">Zerodha Kite</a></div>
            <div><a href="#brokers" className="text-slate-400 hover:text-white transition-colors">Groww API</a></div>
            <div><a href="#brokers" className="text-slate-400 hover:text-white transition-colors">AngelOne SmartAPI</a></div>
            <div><a href="#brokers" className="text-slate-400 hover:text-white transition-colors">Upstox &amp; Dhan</a></div>
          </div>

          <div className="space-y-2.5">
            <div className="font-bold text-white uppercase tracking-wider text-[10px]">Company</div>
            <div><Link to="/login" className="text-slate-400 hover:text-white transition-colors">Sign In</Link></div>
            <div><a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a></div>
            <div><a href="#" className="text-slate-400 hover:text-white transition-colors">Security &amp; Encryption</a></div>
            <div><a href="#" className="text-slate-400 hover:text-white transition-colors">API Documentation</a></div>
          </div>

        </div>

        <div className="pt-8 border-t border-[#1c2541] flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-slate-500">
          <div>© {new Date().getFullYear()} TradeBuddy Technologies Inc. All rights reserved.</div>
          <div>Disclaimer: Trading stocks, options, and futures involves risk of loss. Past performance is not indicative of future results.</div>
        </div>
      </div>
    </footer>
  );
}
