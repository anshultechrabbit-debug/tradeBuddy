import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { askAssistant } from '../store/aiSlice';

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
      text: "Hey! 🐼 I'm TradePanda, your live market AI co-pilot. Ask me any rate, trend, or setup!",
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
    <div
      className="dash-card"
      style={{
        padding: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        minHeight: 680,
        position: 'sticky',
        top: 24,
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.06)',
      }}
    >
      {/* ── Top Header Bar ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #0ea5e9 100%)',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'white',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
          >
            🐼
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>TradePanda AI</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', marginTop: 2 }}>
              {isThinking ? '⚡ ANALYZING MARKET…' : '🟢 LIVE CO-PILOT'}
            </div>
          </div>
        </div>

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            title="Expand Fullscreen Chat"
            style={{
              background: 'rgba(255,255,255,0.18)',
              border: 'none',
              borderRadius: 8,
              color: 'white',
              cursor: 'pointer',
              padding: '5px 9px',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>⛶</span> Expand
          </button>
        )}
      </div>

      {/* ── Standing Panda Scene Stage ── */}
      <div
        style={{
          position: 'relative',
          height: 180,
          background: 'linear-gradient(180deg, rgba(30,58,138,0.15) 0%, rgba(14,165,233,0.05) 100%)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {/* Glow ambient */}
        <div
          style={{
            position: 'absolute',
            width: 200,
            height: 120,
            borderRadius: '50%',
            background: isThinking ? 'rgba(59,130,246,0.3)' : 'rgba(14,165,233,0.18)',
            filter: 'blur(30px)',
            transition: 'background 0.5s ease',
          }}
        />

        {/* Live Index Pill Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            background: 'var(--bg-elev)',
            border: '1px solid var(--border)',
            padding: '4px 10px',
            borderRadius: 99,
            fontSize: 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>NIFTY</span>
          <span style={{ color: 'var(--text)' }}>{nifty ? nifty.level.toLocaleString('en-IN') : '24,780.40'}</span>
          <span style={{ color: '#22c55e' }}>{nifty ? `+${nifty.changePct}%` : '+0.82%'}</span>
        </div>

        {scanResult?.regime && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              right: 12,
              background: 'rgba(251,191,36,0.12)',
              border: '1px solid rgba(251,191,36,0.3)',
              color: '#d97706',
              padding: '4px 8px',
              borderRadius: 99,
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            ⚡ {scanResult.regime}
          </div>
        )}

        {/* Panda SVG Character */}
        <svg viewBox="0 0 280 180" style={{ width: '100%', height: '100%', maxWidth: 300 }}>
          <defs>
            <radialGradient id="pandaBody" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#e2e8f0" />
            </radialGradient>
            <radialGradient id="pandaDark" cx="40%" cy="40%" r="60%">
              <stop offset="0%" stopColor="#27272a" />
              <stop offset="100%" stopColor="#09090b" />
            </radialGradient>
            <linearGradient id="headphoneGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>
            <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Mini Desk */}
          <ellipse cx="140" cy="155" rx="100" ry="14" fill="#cbd5e1" opacity="0.4" />
          <rect x="80" y="145" width="120" height="12" rx="4" fill="#1e293b" opacity="0.8" />
          <rect x="110" y="147" width="60" height="3" rx="1" fill="#38bdf8" opacity={isThinking ? 1 : 0.4} filter={isThinking ? 'url(#glowEffect)' : undefined} />

          {/* Standing / Seated Panda Body with Bob Animation */}
          <g transform={`translate(0, ${bob})`}>
            {/* Feet */}
            <ellipse cx="115" cy="150" rx="12" ry="7" fill="url(#pandaDark)" />
            <ellipse cx="165" cy="150" rx="12" ry="7" fill="url(#pandaDark)" />

            {/* Torso */}
            <ellipse cx="140" cy="120" rx="34" ry="28" fill="url(#pandaDark)" />
            <ellipse cx="140" cy="124" rx="22" ry="20" fill="url(#pandaBody)" />

            {/* Arms holding tablet/steering */}
            <ellipse cx="108" cy="128" rx="10" ry="14" fill="url(#pandaDark)" transform="rotate(25 108 128)" />
            <ellipse cx="172" cy="128" rx="10" ry="14" fill="url(#pandaDark)" transform="rotate(-25 172 128)" />

            {/* Trading Tablet */}
            <rect x="122" y="126" width="36" height="22" rx="3" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" />
            <line x1="126" y1="134" x2="154" y2="134" stroke="#22c55e" strokeWidth="1.5" />
            <line x1="126" y1="140" x2="146" y2="140" stroke="#38bdf8" strokeWidth="1.5" />

            {/* Head */}
            <circle cx="140" cy="76" r="32" fill="url(#pandaBody)" />

            {/* Ears with Wiggle */}
            <circle cx="112" cy={50 + earWiggle} r="13" fill="url(#pandaDark)" />
            <circle cx="112" cy={50 + earWiggle} r="7" fill="#3b82f6" opacity="0.6" />

            <circle cx="168" cy={50 - earWiggle} r="13" fill="url(#pandaDark)" />
            <circle cx="168" cy={50 - earWiggle} r="7" fill="#3b82f6" opacity="0.6" />

            {/* Headphones */}
            <path d="M 108 72 C 108 42, 172 42, 172 72" fill="none" stroke="url(#headphoneGrad)" strokeWidth="4" strokeLinecap="round" />
            <rect x="104" y="66" width="7" height="15" rx="3.5" fill="#1d4ed8" />
            <rect x="169" y="66" width="7" height="15" rx="3.5" fill="#1d4ed8" />

            {/* Eye Patches */}
            <ellipse cx="127" cy="74" rx="9" ry="12" fill="url(#pandaDark)" transform="rotate(-15 127 74)" />
            <ellipse cx="153" cy="74" rx="9" ry="12" fill="url(#pandaDark)" transform="rotate(15 153 74)" />

            {/* Eyes */}
            {!eyeBlink ? (
              <>
                <circle cx="128" cy="74" r="4.5" fill="#ffffff" />
                <circle cx="129" cy="74" r="2.5" fill="#1e40af" />
                <circle cx="127.5" cy="72.5" r="1" fill="#ffffff" />

                <circle cx="152" cy="74" r="4.5" fill="#ffffff" />
                <circle cx="153" cy="74" r="2.5" fill="#1e40af" />
                <circle cx="151.5" cy="72.5" r="1" fill="#ffffff" />
              </>
            ) : (
              <>
                <line x1="124" y1="74" x2="132" y2="74" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                <line x1="148" y1="74" x2="156" y2="74" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
              </>
            )}

            {/* Nose & Cute Smile */}
            <ellipse cx="140" cy="85" rx="4" ry="2.8" fill="#18181b" />
            <path d="M 136 89 Q 140 93 144 89" fill="none" stroke="#18181b" strokeWidth="1.8" strokeLinecap="round" />

            {/* Cheeks */}
            <circle cx="118" cy="84" r="4" fill="#f472b6" opacity="0.4" />
            <circle cx="162" cy="84" r="4" fill="#f472b6" opacity="0.4" />
          </g>
        </svg>
      </div>

      {/* ── Live Conversation Stream ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: msg.role === 'panda' ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' : 'var(--border-strong)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: msg.role === 'panda' ? 13 : 10,
                color: 'white',
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {msg.role === 'panda' ? '🐼' : 'U'}
            </div>

            <div style={{ maxWidth: '82%' }}>
              <div
                style={{
                  padding: '9px 13px',
                  borderRadius: msg.role === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' : 'var(--bg-elev-2)',
                  color: msg.role === 'user' ? 'white' : 'var(--text)',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'panda' ? '1px solid var(--border)' : 'none',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                {msg.text}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  marginTop: 2,
                  fontFamily: 'monospace',
                  textAlign: msg.role === 'user' ? 'right' : 'left',
                }}
              >
                {fmtTime(msg.ts)}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isThinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              🐼
            </div>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: '14px 14px 14px 2px',
                background: 'var(--bg-elev-2)',
                border: '1px solid var(--border)',
                display: 'flex',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'inline-block',
                    animation: `pandaDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Quick Prompts Chips ── */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          flexShrink: 0,
          background: 'var(--bg-elev)',
        }}
      >
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => sendMessage(p)}
            style={{
              fontSize: 10.5,
              padding: '4px 9px',
              borderRadius: 99,
              border: '1px solid var(--border)',
              background: 'var(--bg-elev-2)',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease',
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = '#2563eb';
              b.style.color = '#2563eb';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = 'var(--border)';
              b.style.color = 'var(--text-muted)';
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* ── Input bar ── */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '10px 12px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          background: 'var(--bg-elev)',
          flexShrink: 0,
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Panda a question…"
          disabled={assistantLoading}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-elev-2)',
            color: 'var(--text)',
            fontSize: 12.5,
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s ease',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#2563eb';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        />
        <button
          type="submit"
          disabled={assistantLoading || !input.trim()}
          style={{
            padding: '9px 14px',
            borderRadius: 10,
            background: input.trim() && !assistantLoading ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' : 'var(--bg-elev-2)',
            color: input.trim() && !assistantLoading ? 'white' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            cursor: input.trim() && !assistantLoading ? 'pointer' : 'not-allowed',
            fontSize: 13,
            fontWeight: 700,
            transition: 'all 0.15s ease',
            flexShrink: 0,
          }}
        >
          {assistantLoading ? '…' : '↑'}
        </button>
      </form>
    </div>
  );
}
