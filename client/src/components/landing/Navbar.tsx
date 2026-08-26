import { Link } from 'react-router-dom';

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-[#070d1e]/90 backdrop-blur-xl border-b border-[#1c2541]/80 shadow-2xl shadow-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">

        {/* Brand Logo with Cute Panda Icon */}
        <Link to="/" className="flex items-center gap-2.5 group flex-shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-electric-700 via-electric-600 to-electric-400 text-white font-extrabold flex items-center justify-center text-sm tracking-tight shadow-lg shadow-electric-600/30 group-hover:scale-105 transition-transform">
            🐼
          </div>
          <span className="font-bold tracking-tight text-base sm:text-lg text-white">
            Trade<span className="text-electric-400 font-extrabold">Buddy</span>
          </span>
        </Link>

        {/* Centered Navigation Links */}
        <div className="hidden md:flex items-center gap-8 text-xs font-semibold tracking-wide uppercase font-mono">
          <a href="#platform" className="text-slate-300 hover:text-electric-400 transition-colors">Platform</a>
          <a href="#brokers" className="text-slate-300 hover:text-electric-400 transition-colors">Brokers</a>
          <a href="#solutions" className="text-slate-300 hover:text-electric-400 transition-colors">Workflow</a>
          <a href="#simulator" className="text-slate-300 hover:text-electric-400 transition-colors">Simulator</a>
          <a href="#pricing" className="text-slate-300 hover:text-electric-400 transition-colors">Pricing</a>
        </div>

        {/* Actions & Market Status */}
        <div className="flex items-center gap-3.5 flex-shrink-0">


          <Link
            to="/login"
            className="text-xs font-semibold px-4 py-2 rounded-full text-slate-200 hover:text-white hover:bg-slate-800/80 transition-all border border-transparent hover:border-slate-700"
          >
            Sign In
          </Link>

          <Link
            to="/dashboard"
            className="px-5 py-2 rounded-full bg-gradient-to-r from-electric-600 via-electric-500 to-sky-400 hover:from-electric-500 hover:to-sky-300 text-white font-bold text-xs shadow-lg shadow-electric-600/30 hover:scale-105 transition-all"
          >
            Get Started →
          </Link>
        </div>

      </div>
    </header>
  );
}
