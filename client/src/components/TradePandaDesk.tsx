import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { askAssistant } from '../store/aiSlice';
import { formatNumber, formatPct } from '../lib/format';

interface Message {
  id: string;
  role: 'user' | 'panda';
  text: string;
  ts: Date;
}

const QUICK_PROMPTS = [
  'What is rate of NIFTY 50 today?',
  'Top AI pick right now?',
  'Explain RELIANCE trend',
  'How is market mood?',
];

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function TradePandaDesk({ onExpand }: { onExpand?: () => void }) {
  const dispatch = useAppDispatch();
  const { assistantAnswer, assistantLoading, assistantError } = useAppSelector((s) => s.ai);
  const { indices } = useAppSelector((s) => s.market);
  const { scanResult } = useAppSelector((s) => s.radar);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'panda',
      text: "Hey! 🐼 I'm TradePanda, your live market AI co-pilot. Ask me any stock setup, trend, or Nifty level!",
      ts: new Date(),
    },
  ]);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Character animation tick loop
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t >= 600 ? 0 : t + 1)), 50);
    return () => clearInterval(id);
  }, []);

  // Sync AI answer
  useEffect(() => {
    if (!assistantLoading && pendingQ !== null) {
      const text = assistantAnswer
        ? assistantAnswer
        : assistantError
        ? `⚠️ ${assistantError}`
        : 'Market data processed. Ready for next query.';
      setMessages((prev) => [
        ...prev,
        { id: `panda-${Date.now()}`, role: 'panda', text, ts: new Date() },
      ]);
      setPendingQ(null);
    }
  }, [assistantLoading, assistantAnswer, assistantError, pendingQ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, assistantLoading]);

  function sendMessage(qStr: string) {
    const q = qStr.trim();
    if (!q || assistantLoading || pendingQ !== null) return;
    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: q, ts: new Date() },
    ]);
    setPendingQ(q);
    dispatch(askAssistant(q));
    setInput('');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  const isThinking = assistantLoading && pendingQ !== null;
  const bob = Math.sin(tick * 0.1) * 3;
  const earWiggle = Math.sin(tick * 0.15) * 2;
  const eyeBlink = tick % 90 < 5;

  const nifty = indices.find((i) => i.symbol.includes('NIFTY 50'));

  return (
    <div className="flex flex-col h-full min-h-[380px] rounded-3xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-[#0b132b]/95 shadow-xl dark:shadow-2xl dark:shadow-black/40 backdrop-blur-xl overflow-hidden">
      {/* ── Top Header Bar ── */}
      <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-4 py-3 flex items-center justify-between text-white border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-lg shadow-md">
            🐼
          </div>
          <div>
            <div className="font-extrabold text-sm leading-tight text-white">TradePanda AI</div>
            <div className="text-[9.5px] text-blue-200 font-mono font-bold mt-0.5 tracking-wider">
              {isThinking ? '⚡ ANALYZING LIVE TICK…' : '🟢 LIVE CO-PILOT'}
            </div>
          </div>
        </div>

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expand Fullscreen Chat"
            className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-white font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>⛶</span> Expand
          </button>
        )}
      </div>

      {/* ── Standing Panda Scene Stage ── */}
      <div className="relative h-36 sm:h-40 bg-gradient-to-b from-slate-900 to-slate-950 dark:from-[#070d1e] dark:to-[#0b132b] flex items-center justify-center border-b border-slate-200/40 dark:border-[#1c2541] shrink-0 overflow-hidden">
        {/* Ambient Glow */}
        <div
          className={`absolute w-44 h-24 rounded-full blur-2xl transition-all duration-500 ${
            isThinking ? 'bg-blue-500/40' : 'bg-sky-500/25'
          }`}
        />

        {/* Live Index Pill Overlay */}
        <div className="absolute top-2.5 left-3.5 z-10">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 border border-white/10 text-[10px] font-mono text-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            NIFTY {nifty?.level ? formatNumber(nifty.level) : '24,780.40'}{' '}
            <strong className="text-emerald-400">{nifty?.changePct ? formatPct(nifty.changePct) : '+0.82%'}</strong>
          </span>
        </div>

        {/* Market Regime Badge */}
        <div className="absolute top-2.5 right-3.5 z-10">
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9.5px] font-mono font-bold uppercase tracking-wider">
            {scanResult?.regime ?? 'BULL_MOMENTUM'}
          </span>
        </div>

        {/* Interactive SVG Panda Stage */}
        <svg
          viewBox="0 0 160 140"
          className="w-32 h-28 relative z-10 select-none transition-transform duration-200"
          style={{ transform: `translateY(${bob}px)` }}
        >
          {/* Desk shadow */}
          <ellipse cx="80" cy="132" rx="46" ry="7" fill="rgba(0,0,0,0.3)" />

          {/* Ears */}
          <circle cx="56" cy="38" r="14" fill="#0f172a" style={{ transformOrigin: '56px 38px', transform: `rotate(${-earWiggle}deg)` }} />
          <circle cx="56" cy="38" r="7" fill="#334155" />
          <circle cx="104" cy="38" r="14" fill="#0f172a" style={{ transformOrigin: '104px 38px', transform: `rotate(${earWiggle}deg)` }} />
          <circle cx="104" cy="38" r="7" fill="#334155" />

          {/* Head */}
          <ellipse cx="80" cy="62" rx="34" ry="30" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />

          {/* Eye Patches */}
          <ellipse cx="68" cy="58" rx="10" ry="12" fill="#0f172a" transform="rotate(-15 68 58)" />
          <ellipse cx="92" cy="58" rx="10" ry="12" fill="#0f172a" transform="rotate(15 92 58)" />

          {/* Eyes */}
          {!eyeBlink ? (
            <>
              <circle cx="69" cy="58" r="4.5" fill="#38bdf8" />
              <circle cx="70" cy="56" r="1.5" fill="#ffffff" />
              <circle cx="91" cy="58" r="4.5" fill="#38bdf8" />
              <circle cx="92" cy="56" r="1.5" fill="#ffffff" />
            </>
          ) : (
            <>
              <line x1="64" y1="58" x2="74" y2="58" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
              <line x1="86" y1="58" x2="96" y2="58" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
            </>
          )}

          {/* Headphone band */}
          <path d="M 46 54 A 36 36 0 0 1 114 54" fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
          <rect x="42" y="50" width="8" height="14" rx="4" fill="#1d4ed8" />
          <rect x="110" y="50" width="8" height="14" rx="4" fill="#1d4ed8" />

          {/* Nose & Mouth */}
          <polygon points="80,68 76,73 84,73" fill="#0f172a" />
          <path d="M 76 74 Q 80 78 84 74" fill="none" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />

          {/* Body & Tie */}
          <ellipse cx="80" cy="108" rx="30" ry="24" fill="#0f172a" />
          <ellipse cx="80" cy="106" rx="18" ry="18" fill="#ffffff" />
          <polygon points="80,88 83,100 80,105 77,100" fill="#2563eb" />

          {/* Laptop Desk */}
          <rect x="44" y="118" width="72" height="6" rx="3" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <path d="M 52 118 L 60 98 L 100 98 L 108 118 Z" fill="#0f172a" stroke="#2563eb" strokeWidth="1" />
          <circle cx="80" cy="108" r="3.5" fill="#38bdf8" />
        </svg>
      </div>

      {/* ── Chat Messages Scroll View ── */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-[140px] max-h-[220px]">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 font-black shadow-sm ${
                msg.role === 'panda'
                  ? 'bg-gradient-to-br from-blue-600 to-blue-400 text-white'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
              }`}
            >
              {msg.role === 'panda' ? '🐼' : 'U'}
            </div>

            <div className="max-w-[84%]">
              <div
                className={`p-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                  msg.role === 'user'
                    ? 'rounded-2xl rounded-tr-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium'
                    : 'rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-[#111d4a] border border-slate-200 dark:border-[#1c2541] text-slate-800 dark:text-slate-200 font-light'
                }`}
              >
                {msg.text}
              </div>
              <div
                className={`text-[9px] text-slate-400 mt-0.5 font-mono ${
                  msg.role === 'user' ? 'text-right' : 'text-left'
                }`}
              >
                {fmtTime(msg.ts)}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isThinking && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-xs shrink-0 text-white">
              🐼
            </div>
            <div className="p-2 rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-[#111d4a] border border-slate-200 dark:border-[#1c2541] flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick Prompts Chips ── */}
      <div className="p-2 border-t border-slate-200/80 dark:border-[#1c2541] bg-slate-50 dark:bg-[#070d1e]/80 flex flex-wrap gap-1.5 shrink-0">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => sendMessage(p)}
            className="px-2.5 py-1 rounded-full border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-white/[0.03] hover:bg-blue-50 dark:hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-300 text-[10.5px] font-medium text-slate-600 dark:text-slate-400 transition-all cursor-pointer"
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Input bar ── */}
      <form
        onSubmit={handleSubmit}
        className="p-2.5 border-t border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#070d1e] flex gap-2 shrink-0"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Panda a question…"
          disabled={assistantLoading}
          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-black/40 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={assistantLoading || !input.trim()}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all shrink-0 cursor-pointer"
        >
          {assistantLoading ? '…' : '↑'}
        </button>
      </form>
    </div>
  );
}
