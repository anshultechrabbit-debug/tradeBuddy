import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { askAssistant } from '../store/aiSlice';

interface Message {
  id: string;
  role: 'user' | 'panda';
  text: string;
  ts: Date;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  "What's NIFTY 50 doing today?",
  'Which sectors are bullish?',
  'Top F&O setups right now?',
  'Analyse RELIANCE for me',
  'Is my portfolio diversified?',
  'What is India VIX telling us?',
];

function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function TradePandaChat({ open, onClose }: Props) {
  const dispatch = useAppDispatch();
  const { assistantAnswer, assistantLoading, assistantError } = useAppSelector((s) => s.ai);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'panda',
      text: "Hey there! 🐼 I'm TradePanda — your AI market co-pilot.\n\nAsk me anything: live market levels, sector outlook, stock analysis, option setups, or portfolio advice. I'm connected to live data and ready to help.",
      ts: new Date(),
    },
  ]);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Capture AI answer when it arrives
  useEffect(() => {
    if (!assistantLoading && pendingQ !== null) {
      const text = assistantAnswer
        ? assistantAnswer
        : assistantError
        ? `⚠️ ${assistantError}`
        : 'Sorry, I could not get a response right now.';
      setMessages((prev) => [
        ...prev,
        { id: `panda-${Date.now()}`, role: 'panda', text, ts: new Date() },
      ]);
      setPendingQ(null);
    }
  }, [assistantLoading, assistantAnswer, assistantError, pendingQ]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, assistantLoading]);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  function sendMessage(question: string) {
    const q = question.trim();
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

  if (!open) return null;

  return (
    /* ── Full-screen overlay ── */
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 sm:p-6"
    >
      {/* ── Modal panel ── */}
      <div className="w-full max-w-3xl h-[88vh] max-h-[760px] rounded-3xl bg-white dark:bg-[#0b132b]/95 border border-slate-200 dark:border-[#1c2541] shadow-2xl shadow-black/40 flex flex-col overflow-hidden backdrop-blur-2xl">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-800 to-indigo-900 px-6 py-4 flex items-center justify-between text-white border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-2xl shadow-lg">
              🐼
            </div>
            <div>
              <div className="font-extrabold text-base tracking-tight leading-none text-white">TradePanda AI</div>
              <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-200 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                Live · Market-aware AI co-pilot
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {messages.length > 1 && (
              <span className="hidden sm:inline-block px-3 py-1 rounded-full bg-white/10 text-[11px] font-mono text-blue-100">
                {messages.length - 1} message{messages.length > 2 ? 's' : ''}
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close (Esc)"
              className="px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* ── Messages area ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 shadow-md ${
                  msg.role === 'panda'
                    ? 'bg-gradient-to-br from-blue-600 to-blue-400 text-white'
                    : 'bg-gradient-to-br from-indigo-600 to-purple-500 text-white text-xs'
                }`}
              >
                {msg.role === 'panda' ? '🐼' : 'You'}
              </div>

              {/* Bubble */}
              <div className="max-w-[78%]">
                <div
                  className={`p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-md ${
                    msg.role === 'user'
                      ? 'rounded-3xl rounded-tr-sm bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium'
                      : 'rounded-3xl rounded-tl-sm bg-slate-100 dark:bg-[#111d4a] border border-slate-200 dark:border-[#1c2541] text-slate-800 dark:text-slate-200 font-light'
                  }`}
                >
                  {msg.text}
                </div>
                <div
                  className={`text-[9.5px] text-slate-400 mt-1 font-mono ${
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  {fmtTime(msg.ts)}
                </div>
              </div>
            </div>
          ))}

          {/* Typing dots */}
          {assistantLoading && pendingQ !== null && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center text-sm shrink-0 text-white">
                🐼
              </div>
              <div className="p-3.5 rounded-3xl rounded-tl-sm bg-slate-100 dark:bg-[#111d4a] border border-slate-200 dark:border-[#1c2541] flex items-center gap-2">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick prompts ── */}
        {messages.length === 1 && !assistantLoading && (
          <div className="p-4 border-t border-slate-200/80 dark:border-[#1c2541] bg-slate-50 dark:bg-[#070d1e]/80 flex flex-wrap gap-2 shrink-0">
            <div className="w-full text-[10.5px] text-slate-500 dark:text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">
              QUICK QUESTIONS
            </div>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendMessage(p)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-white/[0.03] hover:bg-blue-50 dark:hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-blue-600 dark:hover:text-blue-300 text-xs font-medium text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* ── Input bar ── */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-slate-200/80 dark:border-[#1c2541] bg-white dark:bg-[#070d1e] flex gap-3 items-center shrink-0"
        >
          <div className="text-xl shrink-0 select-none">🐼</div>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
            }}
            placeholder="Ask me about markets, stocks, options, or your portfolio…"
            disabled={assistantLoading}
            className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-[#1c2541] bg-slate-50 dark:bg-black/40 text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-blue-500 transition-colors"
          />
          <button
            type="submit"
            disabled={assistantLoading || !input.trim()}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all shrink-0 cursor-pointer"
          >
            {assistantLoading ? 'Thinking…' : 'Send ↑'}
          </button>
        </form>
      </div>
    </div>
  );
}
