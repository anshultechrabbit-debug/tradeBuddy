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
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'pandaFadeIn 0.18s ease',
      }}
    >
      {/* ── Modal panel ── */}
      <div
        style={{
          width: '100%',
          maxWidth: 860,
          height: '88vh',
          maxHeight: 760,
          borderRadius: 24,
          background: 'var(--bg-elev)',
          border: '1px solid var(--border)',
          boxShadow: '0 32px 120px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'pandaSlideUp 0.22s ease',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)',
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.18)',
            border: '2px solid rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            flexShrink: 0,
          }}>
            🐼
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 18, color: 'white', letterSpacing: '-0.02em' }}>
              TradePanda AI
            </div>
            <div style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.75)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 2,
            }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#22c55e',
                display: 'inline-block',
                boxShadow: '0 0 6px #22c55e',
              }} />
              Live · Market-aware AI co-pilot
            </div>
          </div>

          {/* Message count badge */}
          {messages.length > 1 && (
            <div style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.12)',
              padding: '3px 10px',
              borderRadius: 99,
              marginRight: 8,
            }}>
              {messages.length - 1} message{messages.length > 2 ? 's' : ''}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 10,
              color: 'white',
              cursor: 'pointer',
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 700,
              transition: 'background 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.28)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.15)'; }}
          >
            ✕ Close
          </button>
        </div>

        {/* ── Messages area ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: msg.role === 'panda'
                  ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)'
                  : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: msg.role === 'panda' ? 18 : 13,
                color: 'white',
                fontWeight: 800,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {msg.role === 'panda' ? '🐼' : 'You'}
              </div>

              {/* Bubble */}
              <div style={{ maxWidth: '72%' }}>
                <div style={{
                  padding: '13px 18px',
                  borderRadius: msg.role === 'user'
                    ? '18px 18px 4px 18px'
                    : '18px 18px 18px 4px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)'
                    : 'var(--bg-elev-2)',
                  color: msg.role === 'user' ? 'white' : 'var(--text)',
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'panda' ? '1px solid var(--border)' : 'none',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                }}>
                  {msg.text}
                </div>
                <div style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginTop: 4,
                  fontFamily: 'monospace',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}>
                  {fmtTime(msg.ts)}
                </div>
              </div>
            </div>
          ))}

          {/* Typing dots */}
          {assistantLoading && pendingQ !== null && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, flexShrink: 0,
              }}>🐼</div>
              <div style={{
                padding: '14px 20px',
                borderRadius: '18px 18px 18px 4px',
                background: 'var(--bg-elev-2)',
                border: '1px solid var(--border)',
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'inline-block',
                    animation: `pandaDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick prompts (first message only) ── */}
        {messages.length === 1 && !assistantLoading && (
          <div style={{
            padding: '0 24px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            flexShrink: 0,
            borderTop: '1px solid var(--border)',
            paddingTop: 12,
          }}>
            <div style={{
              width: '100%',
              fontSize: 11,
              color: 'var(--text-muted)',
              fontFamily: 'monospace',
              fontWeight: 700,
              marginBottom: 4,
              letterSpacing: '0.05em',
            }}>
              QUICK QUESTIONS
            </div>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendMessage(p)}
                style={{
                  fontSize: 12,
                  padding: '7px 14px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elev-2)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s ease',
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = '#2563eb';
                  b.style.color = '#2563eb';
                  b.style.background = 'rgba(37,99,235,0.06)';
                }}
                onMouseLeave={(e) => {
                  const b = e.currentTarget as HTMLButtonElement;
                  b.style.borderColor = 'var(--border)';
                  b.style.color = 'var(--text)';
                  b.style.background = 'var(--bg-elev-2)';
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* ── Input bar ── */}
        <form
          onSubmit={handleSubmit}
          style={{
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 10,
            background: 'var(--bg-elev)',
            flexShrink: 0,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 20, flexShrink: 0 }}>🐼</div>
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
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: 14,
              border: '1.5px solid var(--border)',
              background: 'var(--bg-elev-2)',
              color: 'var(--text)',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
              transition: 'border-color 0.15s ease',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#2563eb'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
          <button
            type="submit"
            disabled={assistantLoading || !input.trim()}
            style={{
              padding: '12px 22px',
              borderRadius: 14,
              background: input.trim() && !assistantLoading
                ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)'
                : 'var(--bg-elev-2)',
              color: input.trim() && !assistantLoading ? 'white' : 'var(--text-muted)',
              border: '1.5px solid var(--border)',
              cursor: input.trim() && !assistantLoading ? 'pointer' : 'not-allowed',
              fontSize: 14,
              fontWeight: 700,
              transition: 'all 0.15s ease',
              flexShrink: 0,
              fontFamily: 'inherit',
            }}
          >
            {assistantLoading ? 'Thinking…' : 'Send ↑'}
          </button>
        </form>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pandaFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pandaSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes pandaDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40%            { transform: scale(1.1); opacity: 1;   }
        }
      `}</style>
    </div>
  );
}
