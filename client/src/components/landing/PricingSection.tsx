import { Link } from 'react-router-dom';

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#e5e5e0]">
      <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-slate-900 font-display">
          Transparent pricing for <span className="text-electric-600">every desk.</span>
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
            <div className="text-4xl font-bold text-slate-900 font-display">
              ₹0 <span className="text-xs font-sans text-[#78716c] font-normal">/ forever free</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
              <li className="flex items-center gap-2">✓ 15 AI radar signals per day</li>
              <li className="flex items-center gap-2">✓ 1 connected broker API (Zerodha/Groww)</li>
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
            <p className="text-xs text-slate-300">For active day traders, options scalpers, and systematic momentum desks.</p>
            <div className="text-4xl font-bold text-white font-display">
              ₹3,999 <span className="text-xs font-sans text-slate-400 font-normal">/ month ($49)</span>
            </div>

            <ul className="space-y-2.5 text-xs text-slate-300 pt-4 border-t border-slate-800">
              <li className="flex items-center gap-2">✓ Unlimited real-time AI radar signals</li>
              <li className="flex items-center gap-2">✓ Multi-broker smart routing (Zerodha, Groww, IBKR)</li>
              <li className="flex items-center gap-2">✓ Capital Shield circuit breaker defense</li>
              <li className="flex items-center gap-2">✓ Visual Strategy Webhooks &amp; Python API</li>
              <li className="flex items-center gap-2">✓ TradePanda AI 24/7 Voice &amp; Chat Assistant</li>
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
            <h3 className="text-lg font-bold text-slate-900">Prop Desk / Fund</h3>
            <p className="text-xs text-[#78716c]">Custom infrastructure for trading desks, funds, and multi-user firms.</p>
            <div className="text-4xl font-bold text-slate-900 font-display">
              ₹14,999 <span className="text-xs font-sans text-[#78716c] font-normal">/ month ($199)</span>
            </div>

            <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
              <li className="flex items-center gap-2">✓ Everything in Pro Quant</li>
              <li className="flex items-center gap-2">✓ Dedicated sub-5ms API gateway</li>
              <li className="flex items-center gap-2">✓ Multi-account risk orchestration</li>
              <li className="flex items-center gap-2">✓ Custom webhook &amp; broker OAuth integrations</li>
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
  );
}
