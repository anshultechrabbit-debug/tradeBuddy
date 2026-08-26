import { Link } from 'react-router-dom';

export function Navbar() {
  return (
    <header className="fixed top-5 left-0 right-0 z-50 px-4 flex justify-center pointer-events-none">
      <nav className="bg-[#0b132b]/90 backdrop-blur-xl border border-electric-500/30 rounded-full px-5 py-2.5 shadow-2xl shadow-electric-950/40 flex items-center justify-between gap-4 sm:gap-10 pointer-events-auto max-w-4xl w-full">
        
        {/* Brand Logo with Cute Panda Icon */}
        <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-electric-700 via-electric-600 to-electric-400 text-white font-extrabold flex items-center justify-center text-xs tracking-tight shadow-md shadow-electric-600/30 group-hover:scale-105 transition-transform">
            🐼
          </div>
          <span className="font-bold tracking-tight text-sm text-white">
            Trade<span className="text-electric-400 font-extrabold">Buddy</span>
          </span>
        </Link>

        {/* Centered Navigation Links */}
        <div className="hidden md:flex items-center gap-6 text-xs font-semibold">
          <a href="#platform" className="text-slate-300 hover:text-electric-400 transition-colors">Platform</a>
          <a href="#brokers" className="text-slate-300 hover:text-electric-400 transition-colors">Brokers</a>
          <a href="#solutions" className="text-slate-300 hover:text-electric-400 transition-colors">Solutions</a>
          <a href="#simulator" className="text-slate-300 hover:text-electric-400 transition-colors">Simulator</a>
          <a href="#pricing" className="text-slate-300 hover:text-electric-400 transition-colors">Pricing</a>
        </div>

        {/* Actions & Market Status */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[10px] font-mono font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-electric-400 animate-pulse" />
            <span>Panda AI Live</span>
          </div>
          <Link 
            to="/login"
            className="text-xs font-semibold px-3 py-1.5 rounded-full text-slate-200 hover:text-white hover:bg-slate-800/60 transition-all"
          >
            Sign In
          </Link>
          <Link
            to="/dashboard"
            className="px-4 py-1.5 rounded-full bg-gradient-to-r from-electric-600 to-electric-500 hover:from-electric-500 hover:to-electric-400 text-white font-bold text-xs shadow-md shadow-electric-600/30 hover:scale-105 transition-all"
          >
            Get Started →
          </Link>
        </div>

      </nav>
    </header>
  );
}
