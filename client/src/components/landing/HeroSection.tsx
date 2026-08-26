import { Link } from 'react-router-dom';
import { TradePandaScene } from '../TradePandaScene';

export function HeroSection() {
  return (
    <section className="w-full min-h-[640px] lg:min-h-[700px] grid grid-cols-1 lg:grid-cols-2 pt-24 lg:pt-24 overflow-hidden bg-[#070d1e]">
      
      {/* ── LEFT HALF (Full 50% Bleed Sapphire Blue Gradient) ── */}
      <div className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] text-white flex flex-col justify-center px-8 sm:px-12 lg:px-16 py-12 lg:py-16 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-[#1c2541]">
        {/* Ambient Sapphire Glow */}
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-xl space-y-6 relative z-10">
          {/* Cute Panda Badge */}
          <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-electric-950/90 border border-electric-500/40 text-electric-300 text-xs font-semibold shadow-inner">
            <span className="text-sm animate-bounce">🐼</span>
            <span className="font-mono">Meet TradePanda — Your 24/7 AI Buddy that never sleeps!</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-[52px] font-normal leading-[1.1] tracking-tight text-white">
            AI for trading operations built for{' '}
            <span className="font-serif italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-electric-200 via-electric-400 to-blue-300">
              serious desks.
            </span>
          </h1>
          
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
            TradeBuddy pairs you with a tireless AI companion that scans multi-indicator setups across thousands of tickers, executes in sub-12ms, and prevents emotional drawdowns.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/dashboard"
              className="px-7 py-3.5 rounded-full bg-gradient-to-r from-electric-600 to-electric-500 hover:from-electric-500 hover:to-electric-400 text-white font-bold text-xs tracking-tight transition-all shadow-xl shadow-electric-600/30 hover:scale-105"
            >
              Start Free with Panda →
            </Link>
            <a
              href="#simulator"
              className="px-6 py-3.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 font-medium text-xs tracking-tight transition-all"
            >
              Live Signal Simulator
            </a>
          </div>

          {/* Bottom Social Proof */}
          <div className="pt-6 border-t border-[#1c2541] flex items-center gap-4 text-xs text-slate-400">
            <div className="flex -space-x-2">
              <img 
                className="w-7 h-7 rounded-full border-2 border-[#0b132b] object-cover" 
                src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80" 
                alt="User" 
              />
              <img 
                className="w-7 h-7 rounded-full border-2 border-[#0b132b] object-cover" 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80" 
                alt="User" 
              />
              <img 
                className="w-7 h-7 rounded-full border-2 border-[#0b132b] object-cover" 
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=80&q=80" 
                alt="User" 
              />
            </div>
            <div>
              <span className="text-white font-medium">45,000+ active traders</span> executing over $4.2B in volume
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT HALF (Warm Sandstone Canvas hosting floating TradePanda Scene Card) ── */}
      <div className="w-full h-full flex items-center justify-center p-4 lg:p-8 bg-gradient-to-br from-[#ebe6d8] via-[#e2decf] to-[#d8d2c0]">
        <TradePandaScene />
      </div>

    </section>
  );
}
