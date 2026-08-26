// TradeBuddy Landing Page — Full 50/50 Bleed Hero Partition with Continuous Video-Style Animated Scene
// Left: Sapphire Blue Gradient | Right: Full Bleed 4K Video Loop of 3D Trading Desk & TradePanda
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TradePandaScene } from '../components/TradePandaScene';

/* --------------------------------------------------------------------------
   TradePanda Cinematic Scene — Full scripted cute loop:
   ACT 1 (0–22):   Panda sleeping on side at desk, Zzz speech bubble, cute snore bob
   ACT 2 (22–45):  Trader types question word by word in chat
   ACT 3 (45–60):  Notification ping! Panda's ear twitches, wakes up, does big yawn + stretch arms wide
   ACT 4 (60–82):  Panda upright, scans screens, types answer in chat (typewriter)
   ACT 5 (82–100): Panda sends answer, happy face, then curls up & sleeps again 💤
   -------------------------------------------------------------------------- */
const QUESTION_WORDS = ['What', 'is', 'the', 'best', 'stock', 'today?'];
const PANDA_ANSWER   = 'NIFTY 24800 CE 🚀  Entry ₹142 · Target ₹188 (+32%)  Routing to Zerodha!';

function ContinuousCinematicMovieScene_Old() {
  const [tick, setTick]       = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => setTick(t => (t >= 1000 ? 0 : t + 1)), 55);
    return () => clearInterval(id);
  }, [isPlaying]);

  const p = (tick / 1000) * 100; // normalised 0-100

  const isSleeping  = p < 22;
  const isTyping    = p >= 22 && p < 45;
  const isWaking    = p >= 45 && p < 60;
  const isAnalyzing = p >= 60 && p < 82;
  const isHappy     = p >= 82;

  // Word-by-word typing progress
  const typingProgress = isTyping ? (p - 22) / 23 : (p >= 45 ? 1 : 0);
  const wordsVisible   = Math.min(Math.floor(typingProgress * QUESTION_WORDS.length), QUESTION_WORDS.length);

  // Typewriter for panda answer
  const answerProgress = isAnalyzing ? (p - 60) / 22 : (isHappy ? 1 : 0);
  const answerChars    = Math.floor(answerProgress * PANDA_ANSWER.length);

  // Sleeping: body bobs gently up and down
  const sleepBob = isSleeping ? Math.sin(tick * 0.07) * 2.5 : 0;
  // Waking yawn: arms shoot out wide  (0 → 1 over isWaking window)
  const yawnProgress = isWaking ? Math.min((p - 45) / 15, 1) : (p >= 60 ? 1 : 0);
  // Happy bounce
  const happyBounce = isHappy ? Math.abs(Math.sin(tick * 0.22)) * 5 : 0;

  const eyesClosed = isSleeping || (isHappy && p > 93);
  const eyesWide   = isWaking && yawnProgress < 0.7;
  const eyesHappy  = isHappy && p <= 93;

  // Zzz: 3 letters that float upward and cycle
  const zAlpha = isSleeping ? 1 : 0;
  const z1y = isSleeping ? -(tick % 70) * 0.35 : -30;
  const z2y = isSleeping ? -((tick + 25) % 70) * 0.28 : -25;
  const z3y = isSleeping ? -((tick + 50) % 70) * 0.22 : -20;

  return (
    <div className="relative w-full h-full min-h-[600px] lg:min-h-[700px] flex items-center justify-center p-4 sm:p-5 bg-gradient-to-br from-[#ebe6d8] via-[#e2decf] to-[#d8d2c0] border-l border-[#d6d0c2]/60 select-none">

      {/* Ambient glow blobs */}
      <div className="absolute top-8 right-10 w-80 h-80 bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-8 w-64 h-64 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />

      {/* Main dark card */}
      <div className="relative z-10 w-full max-w-[460px] bg-gradient-to-b from-[#070c1a] via-[#0b132b] to-[#060a17] rounded-3xl border border-slate-700/60 shadow-[0_0_70px_rgba(37,99,235,0.2)] overflow-hidden flex flex-col text-white">

        {/* ── TOP HEADER ── */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5 border-b border-white/[0.07]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold tracking-widest text-slate-300 uppercase">TradePanda AI · Live Demo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border transition-all duration-500 ${
              isSleeping  ? 'bg-slate-800/80 border-slate-600 text-slate-400' :
              isTyping    ? 'bg-amber-900/50 border-amber-600/50 text-amber-300' :
              isWaking    ? 'bg-violet-900/50 border-violet-500/50 text-violet-300' :
              isAnalyzing ? 'bg-sky-900/50 border-sky-400/50 text-sky-300' :
                            'bg-blue-900/50 border-blue-400/50 text-blue-200'
            }`}>
              {isSleeping ? '😴 Sleeping' : isTyping ? '👨‍💻 Trader Asking' : isWaking ? '🥱 Waking Up' : isAnalyzing ? '⚡ Analyzing' : '😊 Answered!'}
            </span>
            <button onClick={() => setIsPlaying(v => !v)} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-[9px] text-slate-300 transition-colors">
              {isPlaying ? '❚❚' : '▶'}
            </button>
          </div>
        </div>

        {/* ── PANDA ANIMATION STAGE ── */}
        <div className="relative flex items-center justify-center px-3 pt-2 pb-1">
          <svg viewBox="0 0 340 200" className="w-full max-h-[200px] overflow-visible drop-shadow-2xl">
            <defs>
              <linearGradient id="scr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#070d1e" />
                <stop offset="100%" stopColor="#1e3a8a" />
              </linearGradient>
              <linearGradient id="scrActive" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#0c1f5e" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="dsk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8bfa8" />
                <stop offset="100%" stopColor="#a89e87" />
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            {/* ── MONITORS ── */}
            {/* Left monitor */}
            <rect x="5" y="30" width="90" height="72" rx="8" fill="url(#scr)" stroke={isAnalyzing || isHappy ? '#38bdf8' : '#1e293b'} strokeWidth="1.5" />
            {[0,1,2,3,4].map((i) => (
              <rect key={i} x={14 + i*16} y={58 - i * 4} width="9" height={22 + i * 4} rx="2" fill={i % 2 === 0 ? '#2563eb' : '#38bdf8'} opacity="0.85" key={i} />
            ))}
            <path d="M 14 68 Q 38 50 62 42 T 88 36" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity={isAnalyzing || isHappy ? 1 : 0.25} />

            {/* Right monitor */}
            <rect x="245" y="30" width="90" height="72" rx="8" fill="url(#scr)" stroke={isAnalyzing || isHappy ? '#38bdf8' : '#1e293b'} strokeWidth="1.5" />
            {[0,1,2,3,4].map((i) => (
              <rect key={i} x={254 + i*16} y={55 - i * 3} width="9" height={20 + i * 4} rx="2" fill={i % 2 === 0 ? '#38bdf8' : '#60a5fa'} opacity="0.85" />
            ))}
            <path d="M 254 65 Q 278 78 302 55 T 328 40" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity={isAnalyzing || isHappy ? 1 : 0.25} />

            {/* Center main monitor */}
            <rect x="108" y="14" width="124" height="88" rx="10" fill={isAnalyzing || isHappy ? 'url(#scrActive)' : 'url(#scr)'} stroke={isAnalyzing || isHappy ? '#60a5fa' : '#334155'} strokeWidth={isAnalyzing || isHappy ? 2 : 1.5} filter={isAnalyzing || isHappy ? 'url(#glow)' : undefined} />
            {[0,1,2,3,4,5].map((i) => (
              <rect key={i} x={118 + i * 17} y={50 - i * 3} width="10" height={28 + i * 3} rx="2" fill={['#2563eb','#38bdf8','#60a5fa','#38bdf8','#2563eb','#93c5fd'][i]} opacity="0.9" />
            ))}
            <path d="M 118 68 Q 148 48 178 36 T 224 22" fill="none" stroke="#38bdf8" strokeWidth="2.5" opacity={isAnalyzing || isHappy ? 1 : 0.3} />
            <text x="112" y="96" fill={isAnalyzing || isHappy ? '#38bdf8' : '#334155'} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
              {isSleeping ? 'Radar: sleep mode...' : isTyping ? 'Prompt incoming...' : isWaking ? 'Boot: scanning...' : isAnalyzing ? 'NIFTY 24800 CE · 94%' : '✓ Filled on Zerodha!'}
            </text>

            {/* Desk surface */}
            <ellipse cx="170" cy="163" rx="158" ry="20" fill="url(#dsk)" />

            {/* Keyboard */}
            <rect x="125" y="154" width="90" height="10" rx="3" fill="#1e293b" stroke={isAnalyzing ? '#38bdf8' : '#334155'} strokeWidth="0.8" />
            <line x1="133" y1="158" x2="207" y2="158" stroke="#334155" strokeWidth="0.7" />

            {/* Chair */}
            <rect x="135" y="108" width="70" height="60" rx="12" fill="#0f172a" />
            <rect x="145" y="106" width="50" height="10" rx="5" fill="#1e293b" />

            {/* ══════════════════════════════════
                 PANDA CHARACTER
               ══════════════════════════════════ */}
            {isSleeping ? (
              /* ── ACT 1: Panda curled sleeping on side on desk ── */
              <g transform={`translate(0, ${sleepBob})`}>
                {/* Body — rotated sideways, curled */}
                <ellipse cx="170" cy="148" rx="42" ry="22" fill="#0f172a" transform="rotate(-8 170 148)" />
                <ellipse cx="170" cy="148" rx="30" ry="14" fill="#f0f0f0" transform="rotate(-8 170 148)" />

                {/* Tail curl */}
                <path d="M 210 155 Q 222 162 216 172 Q 210 178 204 170" stroke="#0f172a" strokeWidth="10" strokeLinecap="round" fill="none" />

                {/* Legs tucked in */}
                <ellipse cx="140" cy="166" rx="18" ry="9" fill="#0f172a" transform="rotate(-20 140 166)" />
                <ellipse cx="200" cy="168" rx="16" ry="8" fill="#0f172a" transform="rotate(-10 200 168)" />
                <ellipse cx="150" cy="172" rx="12" ry="6" fill="#0f172a" />

                {/* Arms folded under head */}
                <path d="M 148 140 Q 136 148 128 152" stroke="#0f172a" strokeWidth="13" strokeLinecap="round" fill="none" />
                <path d="M 155 136 Q 143 145 135 149" stroke="#0f172a" strokeWidth="9" strokeLinecap="round" fill="none" />

                {/* Head — side lying */}
                <circle cx="135" cy="140" r="30" fill="#f0f0f0" stroke="#0f172a" strokeWidth="2.5" />

                {/* Ear (top one visible) */}
                <circle cx="120" cy="113" r="13" fill="#0f172a" />
                <circle cx="120" cy="113" r="6.5" fill="#2563eb" opacity="0.7" />

                {/* Eye patch */}
                <ellipse cx="126" cy="137" rx="10" ry="9" fill="#0f172a" transform="rotate(-20 126 137)" />
                <ellipse cx="148" cy="133" rx="9" ry="8" fill="#0f172a" transform="rotate(10 148 133)" />

                {/* Closed sleepy eyes */}
                <path d="M 121 137 Q 126 143 131 137" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                <path d="M 143 133 Q 148 138 153 133" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" fill="none" />

                {/* Nose */}
                <ellipse cx="138" cy="148" rx="4" ry="2.8" fill="#0f172a" />
                {/* Relaxed mouth */}
                <path d="M 133 153 Q 138 157 143 153" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" fill="none" />

                {/* Blush */}
                <ellipse cx="115" cy="146" rx="5" ry="3" fill="#93c5fd" opacity="0.45" />
                <ellipse cx="152" cy="140" rx="5" ry="3" fill="#93c5fd" opacity="0.45" />

                {/* Headset on sleeping panda */}
                <path d="M 108 132 Q 133 120 155 128" stroke="#38bdf8" strokeWidth="2.5" fill="none" />
                <rect x="104" y="129" width="7" height="11" rx="3" fill="#0284c7" />
                <rect x="153" y="125" width="7" height="11" rx="3" fill="#0284c7" />

                {/* ZZZ speech bubble */}
                <rect x="155" y="98" width="55" height="30" rx="10" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.2" opacity="0.95" />
                <polygon points="164,128 170,138 176,128" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.2" strokeLinejoin="round" />
                <text x="163" y="117" fill="#38bdf8" fontSize="13" fontFamily="monospace" fontWeight="bold" opacity={0.6 + Math.abs(Math.sin(tick * 0.06)) * 0.4}>Z</text>
                <text x="176" y="112" fill="#60a5fa" fontSize="10" fontFamily="monospace" fontWeight="bold" opacity={0.4 + Math.abs(Math.sin(tick * 0.06 + 1)) * 0.4}>z</text>
                <text x="187" y="108" fill="#93c5fd" fontSize="7" fontFamily="monospace" fontWeight="bold" opacity={0.3 + Math.abs(Math.sin(tick * 0.06 + 2)) * 0.3}>z</text>
              </g>
            ) : (
              /* ── ACTs 2-5: Panda upright at desk ── */
              <g transform={`translate(0, ${isWaking ? Math.sin(yawnProgress * Math.PI) * -4 : happyBounce})`}>
                {/* Body */}
                <ellipse cx="170" cy="145" rx="32" ry="28" fill="#0f172a" />
                <ellipse cx="170" cy="147" rx="22" ry="19" fill="#f0f0f0" />

                {/* Legs */}
                <ellipse cx="152" cy="170" rx="12" ry="7" fill="#0f172a" />
                <ellipse cx="188" cy="170" rx="12" ry="7" fill="#0f172a" />

                {/* ARMS — yawn stretch or normal/pointing */}
                {isWaking ? (
                  /* Arms stretched wide on yawn */
                  <>
                    {/* Left arm swings left and up */}
                    <ellipse
                      cx={170 - 36 - yawnProgress * 28}
                      cy={148 - yawnProgress * 28}
                      rx="12" ry="9"
                      fill="#0f172a"
                      transform={`rotate(${-30 - yawnProgress * 45} ${170 - 36 - yawnProgress * 28} ${148 - yawnProgress * 28})`}
                    />
                    {/* Right arm swings right and up */}
                    <ellipse
                      cx={170 + 36 + yawnProgress * 28}
                      cy={148 - yawnProgress * 28}
                      rx="12" ry="9"
                      fill="#0f172a"
                      transform={`rotate(${30 + yawnProgress * 45} ${170 + 36 + yawnProgress * 28} ${148 - yawnProgress * 28})`}
                    />
                  </>
                ) : isAnalyzing || isHappy ? (
                  /* One paw on keyboard, one pointing at screen */
                  <>
                    <ellipse cx="142" cy="156" rx="11" ry="8" fill="#0f172a" />
                    <ellipse cx="196" cy="138" rx="9" ry="14" fill="#0f172a" transform="rotate(-30 196 138)" />
                    <circle cx="194" cy="128" r="4.5" fill="#38bdf8" filter="url(#glow)" />
                  </>
                ) : (
                  /* Resting paws (typing phase) */
                  <>
                    <ellipse cx="143" cy="156" rx="11" ry="8" fill="#0f172a" />
                    <ellipse cx="197" cy="156" rx="11" ry="8" fill="#0f172a" />
                  </>
                )}

                {/* Head */}
                <circle cx="170" cy="106" r="32" fill="#f0f0f0" stroke="#0f172a" strokeWidth="2.5" />

                {/* Ears */}
                <circle cx="140" cy="80" r="14" fill="#0f172a" />
                <circle cx="140" cy="80" r="7" fill="#2563eb" opacity="0.75" />
                <circle cx="200" cy="80" r="14" fill="#0f172a" />
                <circle cx="200" cy="80" r="7" fill="#2563eb" opacity="0.75" />

                {/* Notification dot on ear during waking */}
                {isWaking && (
                  <circle cx="154" cy="68" r={5 + Math.sin(tick * 0.4) * 2.5} fill="#f59e0b" opacity="0.95" />
                )}

                {/* Headset */}
                <path d="M 138 97 Q 170 82 202 97" stroke="#38bdf8" strokeWidth="3" fill="none" />
                <rect x="134" y="93" width="8" height="14" rx="4" fill="#0284c7" />
                <rect x="198" y="93" width="8" height="14" rx="4" fill="#0284c7" />
                <path d="M 138 106 Q 148 124 162 120" stroke="#38bdf8" strokeWidth="2.5" fill="none" />
                <circle cx="163" cy="120" r="3" fill="#38bdf8" />

                {/* Eye patches */}
                <ellipse cx="157" cy="104" rx="11" ry="13" fill="#0f172a" transform="rotate(-15 157 104)" />
                <ellipse cx="183" cy="104" rx="11" ry="13" fill="#0f172a" transform="rotate(15 183 104)" />

                {/* EYES */}
                {eyesClosed ? (
                  <>
                    <path d="M 151 106 Q 157 112 163 106" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <path d="M 177 106 Q 183 112 189 106" stroke="#f0f0f0" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </>
                ) : eyesWide ? (
                  /* Big round surprised eyes on waking */
                  <>
                    <circle cx="157" cy="104" r="7" fill="#fff" />
                    <circle cx="158" cy="103" r="3.5" fill="#1d4ed8" />
                    <circle cx="183" cy="104" r="7" fill="#fff" />
                    <circle cx="184" cy="103" r="3.5" fill="#1d4ed8" />
                  </>
                ) : eyesHappy ? (
                  /* Happy ^ ^ eyes */
                  <>
                    <path d="M 151 103 Q 157 111 163 103" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <path d="M 177 103 Q 183 111 189 103" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </>
                ) : (
                  /* Normal attentive eyes */
                  <>
                    <circle cx="157" cy="104" r="5.5" fill="#fff" />
                    <circle cx="158" cy="103" r="2.8" fill="#1d4ed8" />
                    <circle cx="183" cy="104" r="5.5" fill="#fff" />
                    <circle cx="184" cy="103" r="2.8" fill="#1d4ed8" />
                  </>
                )}

                {/* Cyber visor */}
                <path d="M 145 100 Q 170 95 195 100" stroke="#38bdf8" strokeWidth="1.5" fill="none" />
                <rect x="146" y="96" width="23" height="13" rx="5" fill="#38bdf8" opacity={isAnalyzing || isHappy ? 0.45 : 0.15} stroke="#38bdf8" strokeWidth="1" />
                <rect x="171" y="96" width="23" height="13" rx="5" fill="#38bdf8" opacity={isAnalyzing || isHappy ? 0.45 : 0.15} stroke="#38bdf8" strokeWidth="1" />

                {/* Nose */}
                <ellipse cx="170" cy="118" rx="5" ry="3.5" fill="#0f172a" />

                {/* Mouth */}
                {isWaking && yawnProgress > 0.4 ? (
                  /* Yawning O mouth */
                  <ellipse cx="170" cy="126" rx="6" ry={4 + yawnProgress * 5} fill="#0f172a" />
                ) : eyesHappy ? (
                  <path d="M 163 123 Q 170 131 177 123" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                ) : (
                  <path d="M 164 123 Q 170 128 176 123" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" fill="none" />
                )}

                {/* Blush */}
                <ellipse cx="143" cy="116" rx="5.5" ry="3.5" fill="#93c5fd" opacity="0.5" />
                <ellipse cx="197" cy="116" rx="5.5" ry="3.5" fill="#93c5fd" opacity="0.5" />

                {/* Happy sparkles */}
                {isHappy && p < 90 && (
                  <>
                    <text x="108" y="78" fill="#fbbf24" fontSize="11">✨</text>
                    <text x="215" y="72" fill="#fbbf24" fontSize="9">⭐</text>
                    <text x="200" y="60" fill="#38bdf8" fontSize="8">💫</text>
                  </>
                )}
              </g>
            )}
          </svg>
        </div>

        {/* ── CHAT CONVERSATION PANEL ── */}
        <div className="mx-3 mb-3 bg-[#09101f]/90 backdrop-blur-xl rounded-2xl border border-white/[0.07] overflow-hidden flex flex-col" style={{ minHeight: 165, maxHeight: 190 }}>

          {/* Chat header bar */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border-b border-white/[0.06]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-600 to-sky-400 flex items-center justify-center text-[10px] flex-shrink-0">🐼</div>
            <div>
              <div className="text-[11px] font-semibold text-white leading-none">TradePanda AI</div>
              <div className="text-[9px] text-slate-500 font-mono leading-none mt-0.5">{isAnalyzing || isHappy ? '● online · analyzing markets' : isSleeping ? '◌ sleep mode' : '◌ idle'}</div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 px-3 py-2.5 space-y-2 overflow-hidden font-sans">

            {/* Trader question: word by word */}
            {(isTyping || isWaking || isAnalyzing || isHappy) && (
              <div className="flex justify-end items-end gap-1.5">
                <div className="bg-blue-600 text-white text-[11px] px-3 py-1.5 rounded-2xl rounded-br-sm max-w-[78%] leading-snug shadow">
                  {QUESTION_WORDS.slice(0, wordsVisible).join(' ')}
                  {isTyping && wordsVisible < QUESTION_WORDS.length && (
                    <span className="inline-block w-1 h-3.5 bg-white/70 ml-0.5 rounded-sm animate-pulse" />
                  )}
                </div>
                <span className="text-base mb-0.5 flex-shrink-0">👨‍💻</span>
              </div>
            )}

            {/* Panda waking up typing indicator */}
            {isWaking && (
              <div className="flex items-end gap-1.5">
                <span className="text-base mb-0.5 flex-shrink-0">🐼</span>
                <div className="bg-slate-700/70 text-slate-300 text-[11px] px-3 py-1.5 rounded-2xl rounded-bl-sm italic">
                  <span className="flex items-center gap-1.5">
                    waking up
                    <span className="flex gap-0.5">
                      {[0,150,300].map(d => <span key={d} className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Panda scanning indicator (before answer starts) */}
            {isAnalyzing && answerChars === 0 && (
              <div className="flex items-end gap-1.5">
                <span className="text-base mb-0.5 flex-shrink-0">🐼</span>
                <div className="bg-slate-700/70 text-slate-300 text-[11px] px-3 py-1.5 rounded-2xl rounded-bl-sm italic">
                  scanning 5,200 symbols
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 ml-1.5 animate-ping" />
                </div>
              </div>
            )}

            {/* Panda typewriter answer */}
            {((isAnalyzing && answerChars > 0) || isHappy) && (
              <div className="flex items-end gap-1.5">
                <span className="text-base mb-0.5 flex-shrink-0">🐼</span>
                <div className="bg-gradient-to-br from-[#1e3a8a] to-[#0c1f5e] border border-blue-500/30 text-sky-100 text-[11px] px-3 py-2 rounded-2xl rounded-bl-sm max-w-[85%] leading-snug shadow-lg">
                  <span className="font-medium text-white">{PANDA_ANSWER.slice(0, answerChars)}</span>
                  {isAnalyzing && answerChars < PANDA_ANSWER.length && (
                    <span className="inline-block w-1 h-3 bg-sky-400/80 ml-0.5 rounded-sm animate-pulse" />
                  )}
                  {isHappy && <div className="text-[9px] text-sky-400 mt-0.5 font-mono">✓ sent · Zerodha API</div>}
                </div>
              </div>
            )}

            {/* Back to sleep message */}
            {isHappy && p > 91 && (
              <div className="flex items-end gap-1.5">
                <span className="text-base mb-0.5 flex-shrink-0">🐼</span>
                <div className="bg-slate-800/60 text-slate-500 text-[10px] px-2.5 py-1.5 rounded-2xl rounded-bl-sm italic">going back to sleep… 😴 zzz</div>
              </div>
            )}

          </div>

          {/* Input bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.06]">
            <div className="flex-1 bg-white/[0.05] rounded-full px-3 py-1.5 text-[10px] text-slate-500 font-mono truncate">
              {isSleeping ? 'Panda is sleeping 😴' : isTyping ? 'Trader typing...' : isWaking ? 'Panda waking up 🥱' : isAnalyzing ? 'TradePanda analyzing...' : 'Ask TradePanda anything...'}
            </div>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all duration-300 ${isHappy ? 'bg-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.7)]' : 'bg-slate-700'}`}>
              {isHappy ? '🚀' : '↑'}
            </div>
          </div>
        </div>

        {/* ── SCRUBBER BAR ── */}
        <div className="px-4 pb-3.5">
          <div className="w-full bg-white/[0.07] h-1 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-600 via-sky-400 to-blue-500 transition-all duration-75 rounded-full" style={{ width: `${p}%` }} />
          </div>
        </div>

      </div>
    </div>
  );
}

export function LandingPage() {
  const [activeCategory, setActiveCategory] = useState<string>('Overview');
  const [activeTab, setActiveTab] = useState<number>(0);
  const [simSymbol, setSimSymbol] = useState<string>('NIFTY 50');
  const [simulating, setSimulating] = useState<boolean>(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const simData: Record<string, { target: string; stop: string; wr: string; conf: number; setup: string; rsi: string; vwap: string; type: string; pandaTip: string }> = {
    'NIFTY 50': { target: '24,850 (+140 pts)', stop: '24,650 (-60 pts)', wr: '88.4%', conf: 94, setup: '0DTE Gamma Sweep + VWAP Breakout', rsi: '62.4 (Strong Bullish)', vwap: 'Above VWAP (+42 pts)', type: 'Index Options', pandaTip: 'Panda alert: Heavy call buying detected in 24800 strikes!' },
    'BANKNIFTY': { target: '52,400 (+380 pts)', stop: '51,850 (-170 pts)', wr: '85.1%', conf: 91, setup: 'HDFC & ICICI Block Order Inflow', rsi: '65.2 (High Momentum)', vwap: 'Above VWAP (+110 pts)', type: 'F&O Derivatives', pandaTip: 'Panda alert: Banking index leading morning momentum.' },
    'NVDA':     { target: '$138.50 (+7.8%)', stop: '$125.00 (-2.6%)', wr: '89.2%', conf: 95, setup: 'Dark Pool 0DTE 130C Call Sweep', rsi: '64.8 (Breakout Flow)', vwap: 'Above VWAP (+$2.10)', type: 'US Equities / Options', pandaTip: 'Panda alert: 4,500 lot dark pool block execution.' },
    'RELIANCE': { target: '₹3,160 (+2.4%)',  stop: '₹2,975 (-1.1%)',  wr: '86.7%', conf: 89, setup: 'EMA 20/50 Cross + Delivery Volume Spurt', rsi: '61.0 (Accumulation)', vwap: 'Above VWAP (+₹18)', type: 'NSE Equity', pandaTip: 'Panda alert: Delivery volume 2.4x 30-day average.' },
    'BTC/USDT': { target: '$69,500 (+4.8%)', stop: '$63,200 (-1.9%)', wr: '84.0%', conf: 87, setup: 'Order Book Liquidity Sweep at $64.5k', rsi: '58.5 (Volume Surge)', vwap: 'Above VWAP (+$820)', type: 'Crypto Perpetuals', pandaTip: 'Panda alert: Bids absorbed at key $64.2k support.' },
  };

  const tabContent = [
    {
      label: '1. Multi-Indicator Radar',
      title: 'Spot high-probability institutional setups with zero hesitation.',
      desc: 'Real-time multi-exchange radar processes EMA crossovers, RSI divergence, ATR volatility bands, and dark pool volume spikes simultaneously.',
      points: [
        { h: 'Institutional Flow & Dark Pool Radar', b: 'Track massive block orders and unusual 0DTE options sweeps milliseconds before retail screeners.' },
        { h: 'Deterministic Multi-Indicator Convergence', b: 'Evaluates EMA 20/50, RSI(14) momentum, ATR dynamic trailing bands, and VWAP positioning in parallel.' },
        { h: 'Instant Webhook Triggers', b: 'Bridge TradingView strategies, custom Python bots, or Telegram alerts straight into live execution.' },
      ],
      badge: 'Live Radar Active',
      stat1: '5,200 / sec',
      stat1Label: 'Websocket Ticks',
      stat2: 'sub-12ms',
      stat2Label: 'Execution Speed',
    },
    {
      label: '2. Multi-Broker Smart Router',
      title: 'Execute across Zerodha, Groww, AngelOne & IBKR from one terminal.',
      desc: 'Connect your favorite Indian and Global broker accounts with OAuth2. Split, scale, and route orders simultaneously with zero slippage.',
      points: [
        { h: 'One-Click Multi-Broker Execution', b: 'Route orders to Zerodha Kite, Groww, AngelOne, Upstox, Dhan, or IBKR from a single hotkey.' },
        { h: 'Dynamic ATR Trailing Stops', b: 'Algorithmic trailing stops lock in profits as market momentum expands in your direction.' },
        { h: 'Unified Margin & Portfolio View', b: 'Track combined live P&L, margin utilization, and open risk across all brokerages simultaneously.' },
      ],
      badge: 'Multi-Broker Gateway',
      stat1: '6 Brokers',
      stat1Label: 'Simultaneous API',
      stat2: '0.00%',
      stat2Label: 'Slippage Guard',
    },
    {
      label: '3. Capital Shield Kill-Switch',
      title: 'Automated hardware-level risk management that eliminates blowout days.',
      desc: 'Capital Shield enforces strict discipline by auto-flattening positions and locking your terminal when maximum loss limits are approached.',
      points: [
        { h: 'Automated Daily Drawdown Kill-Switch', b: 'Instantly exits all open trades and locks execution if daily loss threshold is breached.' },
        { h: 'Dynamic Position Size Calculator', b: 'Auto-calculates lot size based on account balance, stop distance, and custom 1% risk rules.' },
        { h: 'Tilt & Revenge Trading Lockout', b: 'Panda AI detects over-leveraging or rapid emotional re-entries and enforces a cool-down timer.' },
      ],
      badge: 'Capital Shield Armed',
      stat1: '100%',
      stat1Label: 'Automated Defense',
      stat2: '$0',
      stat2Label: 'Unmanaged Risk',
    },
  ];

  const handleSimulate = (sym: string) => {
    setSimSymbol(sym);
    setSimulating(true);
    setTimeout(() => setSimulating(false), 400);
  };

  return (
    <div className="min-h-screen bg-[#f8f8f6] text-[#0f172a] font-sans antialiased selection:bg-[#2563eb] selection:text-white">

      {/* ======================================================================
          TRENDY CENTERED FLOATING GLASS NAVBAR
          ====================================================================== */}
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

      {/* ======================================================================
          SECTION 1 — HERO SECTION (FULL 50/50 BLEED PARTITION)
          Left 50%: Sapphire Blue Gradient | Right 50%: Warm Sandstone & TradePanda Scene
          ====================================================================== */}
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

      {/* ======================================================================
          BROKER & TRADING ECOSYSTEM LOGO BAR
          ====================================================================== */}
      <section id="brokers" className="border-b border-[#e5e5e0] bg-[#f4f4f0] py-8 px-6">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="text-center text-xs font-medium text-[#78716c] tracking-tight uppercase font-mono">
            Direct OAuth2 Execution with India &amp; Global Premier Brokers
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono font-bold text-xs text-[#141414]">
            {[
              { name: 'ZERODHA KITE', tag: 'Fastest F&O' },
              { name: 'GROWW API', tag: 'Direct Stocks' },
              { name: 'ANGELONE', tag: 'SmartAPI' },
              { name: 'UPSTOX PRO', tag: 'NSE & BSE' },
              { name: 'DHAN HQ', tag: 'Superfast API' },
              { name: 'INTERACTIVE BROKERS', tag: 'Global US/EU' },
              { name: 'TRADINGVIEW', tag: 'Webhooks' },
              { name: 'ALPACA MARKETS', tag: '0-Commission' },
            ].map((b, idx) => (
              <div 
                key={idx}
                className="bg-white rounded-xl p-3 border border-[#e2decfa0] hover:border-electric-500 text-center shadow-sm hover:shadow transition-all cursor-default"
              >
                <div className="tracking-tight text-[11px] font-bold text-slate-900">{b.name}</div>
                <div className="text-[9px] text-[#78716c] font-normal mt-0.5">{b.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ======================================================================
          SECTION 2 — THE BENTO MATRIX (5-Card Layout)
          ====================================================================== */}
      <section id="platform" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-50 border border-electric-200 text-electric-700 text-xs font-semibold mb-3">
            <span>🐼 Powered by TradePanda AI</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900 max-w-2xl leading-[1.12]">
            The operating system for{' '}
            <span className="font-serif italic font-normal text-electric-600">trading operations.</span>
          </h2>
          <p className="mt-4 text-[#78716c] text-sm sm:text-base max-w-xl">
            Everything active traders and prop firms need to scan, automate, and safeguard capital from a unified interface.
          </p>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {['Overview', 'Order Flow Radar', 'Smart Execution', 'Capital Shield', 'Trade Journal'].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  activeCategory === cat
                    ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/20'
                    : 'bg-[#eeeee8] text-[#57534e] hover:bg-[#e4e4dd]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Bento Grid: 3 Top Cards, 2 Bottom Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Card 1: Multi-Indicator Radar */}
          <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-7 flex flex-col justify-between min-h-[380px] relative overflow-hidden shadow-sm hover:shadow-lg transition-all">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">01 / Order Flow Radar</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">Multi-Indicator Convergence</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Evaluates EMA 20/50, RSI(14) divergence, and ATR dynamic volatility bands across thousands of tickers in parallel.
              </p>
            </div>

            {/* Inner White UI Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-6 relative z-10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900">BANKNIFTY 52000 CE</span>
                <span className="font-mono text-electric-600 font-bold text-[11px] bg-electric-50 px-2 py-0.5 rounded border border-electric-200">
                  RSI: 65.2 · Flow High
                </span>
              </div>
              <div className="text-[11px] text-[#78716c] bg-[#faf9f5] p-2.5 rounded-xl border border-[#f0ece1] font-mono">
                Entry ₹340.00 · Target ₹420.00 · Stop ₹295.00
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#78716c]">
                <span className="w-1.5 h-1.5 rounded-full bg-electric-600" /> Panda auto-synced open chart windows
              </div>
            </div>
          </div>

          {/* Card 2: Sapphire Dark Blue Execution Hub Card */}
          <div 
            className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] rounded-3xl border border-electric-900/60 p-6 sm:p-7 flex flex-col justify-between min-h-[380px] text-white relative overflow-hidden shadow-xl"
          >
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-electric-500/15 rounded-full blur-2xl pointer-events-none" />

            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-400 font-bold block mb-2">02 / Execution Hub</span>
              <h3 className="text-xl font-bold tracking-tight text-white mb-2">Multi-Broker Smart Route</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Connect Zerodha, Groww, AngelOne, Upstox, Dhan, or IBKR. Orders split and route in sub-12 milliseconds.
              </p>
            </div>

            {/* Dark Inner Card */}
            <div className="bg-[#111d4a] rounded-2xl p-4 border border-electric-800/60 mt-6 space-y-2 relative z-10">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Route: Zerodha + Groww</span>
                <span className="text-electric-300 font-mono text-[11px] font-bold">Filled 100% (4ms)</span>
              </div>
              <div className="text-[11px] text-slate-300 font-mono">
                Avg Fill: ₹24,710 · Latency: 4ms · Zero Slippage
              </div>
            </div>
          </div>

          {/* Card 3: Capital Shield Drawdown Guard */}
          <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-7 flex flex-col justify-between min-h-[380px] relative overflow-hidden shadow-sm hover:shadow-lg transition-all">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">03 / Capital Shield</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">Automated Drawdown Guard</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Hardware-grade risk limits. Auto-flatten all positions if daily drawdown breaches your predefined limit.
              </p>
            </div>

            {/* Inner White UI Card */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e8e4d8] mt-6 relative z-10 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-900">Daily Risk Status</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-electric-100 text-electric-800 font-bold">ARMED</span>
              </div>
              <div className="w-full bg-[#f0ede6] h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-electric-600 to-electric-400 h-full w-[24%]" />
              </div>
              <div className="flex justify-between text-[10px] text-[#78716c] font-mono">
                <span>Drawdown: -0.48%</span>
                <span>Max Limit: -1.50%</span>
              </div>
            </div>
          </div>

          {/* Card 4: Light Grid Card (Bottom Left 2/3 Width) */}
          <div className="md:col-span-2 bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-8 flex flex-col justify-between min-h-[320px] shadow-sm">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">04 / Self-Writing Journal</span>
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                Automated trade tagging, analytics, and behavioral coaching.
              </h3>
              <p className="text-xs sm:text-sm text-[#78716c] leading-relaxed max-w-xl">
                Every trade is automatically tagged with setup type, risk-reward ratio, execution latency, and emotional discipline score.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Win Rate</div>
                <div className="text-lg font-bold font-mono text-electric-700">88.4%</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Profit Factor</div>
                <div className="text-lg font-bold font-mono text-slate-900">2.84×</div>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-[#e8e4d8] text-center shadow-sm">
                <div className="text-[10px] text-[#78716c] font-medium uppercase">Avg R:R</div>
                <div className="text-lg font-bold font-mono text-slate-900">1 : 3.2</div>
              </div>
            </div>
          </div>

          {/* Card 5: Sandstone Topography Texture Card (Bottom Right 1/3 Width) */}
          <div className="bg-[#e4decfa0] rounded-3xl border border-[#d6d0c2] p-6 sm:p-7 flex flex-col justify-between min-h-[320px] shadow-sm">
            <div>
              <span className="text-[11px] font-mono uppercase tracking-widest text-electric-700 font-bold block mb-2">05 / Visual Strategy Builder</span>
              <h3 className="text-xl font-bold tracking-tight text-slate-900 mb-2">No-Code Logic</h3>
              <p className="text-xs text-[#78716c] leading-relaxed">
                Connect EMA crossovers, options flow, and VWAP rules with simple visual blocks.
              </p>
            </div>

            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 border border-[#d6d0c2] text-xs font-mono text-slate-900 space-y-1 shadow-sm">
              <div className="text-[10px] text-electric-700 font-bold">RULE #14 ACTIVE</div>
              <div className="font-bold">IF Vol &gt; 2.5x &amp; EMA20 &gt; EMA50</div>
              <div className="text-[#57534e]">THEN Route Zerodha Kite API</div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 3 — TWO-COLUMN TRADE PANDA SHOWCASE
          ====================================================================== */}
      <section className="bg-[#f0eee6] border-y border-[#e2decfa0] py-20 sm:py-28 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Column: Storytelling & Testimonial */}
          <div className="lg:col-span-6 space-y-7">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#d6d0c2] text-xs font-semibold text-slate-800 shadow-sm">
              <span className="text-base">🐼</span>
              <span className="font-mono">Meet TradePanda AI Assistant</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-normal leading-[1.12] tracking-tight text-slate-900">
              The only trading buddy that wakes up the second{' '}
              <span className="font-serif italic font-normal text-electric-600">alpha strikes.</span>
            </h2>

            <p className="text-[#78716c] text-sm sm:text-base leading-relaxed">
              Curled up peacefully at its multi-screen desk until unusual volume or options sweeps hit the tape. TradePanda wakes up, stretches, adjusts its headset, and pinpoints exact entry and stop levels for you.
            </p>

            <div className="pt-4 border-t border-[#dfdbcf] space-y-3">
              <p className="text-sm italic text-[#57534e] leading-relaxed">
                "Trading used to be lonely and stressful. With TradePanda watching the radar 24/7, I never worry about missing breakout prints or breaking my daily risk rules."
              </p>
              <div className="flex items-center gap-3">
                <img 
                  className="w-10 h-10 rounded-full object-cover border border-[#d6d0c2]" 
                  src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80" 
                  alt="Trader" 
                />
                <div>
                  <div className="font-bold text-xs text-slate-900">Arjun Mehta</div>
                  <div className="text-[11px] text-[#78716c]">Head of Quantitative Execution, Vertex Alpha Fund</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Video Scene Player Card */}
          <div className="lg:col-span-6">
            <div className="bg-gradient-to-br from-[#0b132b] via-[#0f172a] to-[#1e293b] rounded-3xl border border-slate-700/60 p-6 sm:p-8 relative overflow-hidden shadow-2xl space-y-5 text-white">
              <div className="absolute top-0 right-0 w-64 h-64 bg-electric-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-electric-400 animate-ping" />
                    <span className="text-xs font-mono font-bold text-slate-200">TradePanda Animated Stream · 60 FPS</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-electric-950 border border-electric-500/40 text-electric-300">
                    Live Active
                  </span>
                </div>

                <div className="bg-[#070c18] rounded-2xl p-5 border border-slate-800/80 space-y-3">
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>NIFTY / BANKNIFTY Multi-Screen Desk</span>
                    <span className="text-electric-400 font-mono text-[11px]">94% Prob</span>
                  </div>

                  <div className="bg-[#0b132b] rounded-xl p-3 border border-slate-800 text-[11px] font-mono space-y-1 text-slate-300">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-400">Panda's Diagnosis:</span>
                      <span className="text-electric-300 font-bold">Call Sweeps + Volume Spike</span>
                    </div>
                    <div className="text-white font-bold">"Buy Stop ₹142.50 · Target ₹188.00"</div>
                    <div className="text-[10px] text-slate-500">"Adjusted headset. Sizing capped to 1% risk."</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 4 — INTERACTIVE SLIDER / TAB WORKFLOW
          ====================================================================== */}
      <section id="solutions" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-left mb-12">
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900 max-w-3xl leading-[1.12]">
            Catch every move, execute every trade, and protect accounts{' '}
            <span className="font-serif italic font-normal text-electric-600">3x faster.</span>
          </h2>
          <p className="mt-4 text-[#78716c] text-sm sm:text-base max-w-xl">
            A battle-tested workflow engineered for zero hesitation and surgical execution precision.
          </p>

          {/* Tab Selection Buttons */}
          <div className="flex flex-wrap gap-2 mt-8">
            {tabContent.map((tab, idx) => (
              <button
                key={idx}
                onClick={() => setActiveTab(idx)}
                className={`px-5 py-2.5 rounded-full text-xs font-semibold tracking-tight transition-all ${
                  activeTab === idx
                    ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/20'
                    : 'bg-[#eeeee8] text-[#78716c] hover:bg-[#e4e4dd] hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2-Column Tab Content Card */}
        <div className="bg-[#f0eee6] rounded-3xl border border-[#e2decfa0] p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center shadow-sm">
          
          {/* Left Column: Accordion-like Feature List */}
          <div className="lg:col-span-6 space-y-6">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 leading-snug">
              {tabContent[activeTab].title}
            </h3>
            <p className="text-xs sm:text-sm text-[#78716c] leading-relaxed">
              {tabContent[activeTab].desc}
            </p>

            <div className="space-y-3 pt-2">
              {tabContent[activeTab].points.map((pt, pIdx) => (
                <div key={pIdx} className="bg-white rounded-2xl p-4 border border-[#e8e4d8] space-y-1 shadow-sm">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-electric-600" />
                    {pt.h}
                  </div>
                  <p className="text-[11px] text-[#78716c] leading-relaxed pl-3.5">
                    {pt.b}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Visual UI Card */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-white rounded-3xl p-6 border border-[#e8e4d8] shadow-lg space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-[#f0ede6]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-electric-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-900">{tabContent[activeTab].badge}</span>
                </div>
                <span className="text-[10px] font-mono text-electric-700 font-bold bg-electric-50 border border-electric-200 px-2 py-0.5 rounded">
                  TradeBuddy Core v2.4
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#faf9f5] p-3.5 rounded-2xl border border-[#f0ece1]">
                  <div className="text-[10px] text-[#78716c] uppercase font-medium">{tabContent[activeTab].stat1Label}</div>
                  <div className="text-lg font-bold font-mono text-slate-900">{tabContent[activeTab].stat1}</div>
                </div>
                <div className="bg-[#faf9f5] p-3.5 rounded-2xl border border-[#f0ece1]">
                  <div className="text-[10px] text-[#78716c] uppercase font-medium">{tabContent[activeTab].stat2Label}</div>
                  <div className="text-lg font-bold font-mono text-electric-600">{tabContent[activeTab].stat2}</div>
                </div>
              </div>

              <div className="p-3.5 bg-[#faf9f5] rounded-2xl border border-[#f0ece1] text-xs space-y-2">
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Real-Time Engine Status</span>
                  <span className="text-electric-700 font-mono font-bold">100% HEALTHY</span>
                </div>
                <div className="text-[11px] text-[#78716c]">
                  Automated latency monitoring, token refresh, and socket reconnect active.
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between text-xs text-[#78716c]">
                <span>All connected brokers synced</span>
                <span className="font-bold text-slate-900 font-mono">Active (4ms)</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 5 — MASSIVE SAPPHIRE BLUE EDITORIAL & METRICS SECTION
          ====================================================================== */}
      <section className="bg-gradient-to-br from-[#070d1e] via-[#0b132b] to-[#111d4a] text-white py-24 sm:py-32 px-4 sm:px-6 lg:px-8 relative overflow-hidden border-y border-[#1c2541]">
        <div className="absolute top-0 right-1/3 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto space-y-20 relative z-10">
          
          {/* Top Sapphire Header */}
          <div className="max-w-3xl space-y-4">
            <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-white leading-tight">
              Coordinate on every trade with{' '}
              <span className="font-serif italic text-transparent bg-clip-text bg-gradient-to-r from-electric-200 via-electric-400 to-blue-300">
                surgical AI precision.
              </span>
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-light">
              Institutional-grade reliability engineered to handle millions of websocket ticks during high-volatility market open sessions.
            </p>
          </div>

          {/* 4 Sapphire Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-3xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">LATENCY</span>
              <div className="text-3xl font-bold font-mono text-white">sub-12ms</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Direct WebSocket pipes into broker execution gateways with zero intermediary delays.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">ANNUAL VOLUME</span>
              <div className="text-3xl font-bold font-mono text-white">$4.2B+</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Over four billion dollars in equities, options, and futures routed seamlessly.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">SIGNAL ACCURACY</span>
              <div className="text-3xl font-bold font-mono text-white">88.4%</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Backtested against 10+ years of tick data across NYSE, NASDAQ, and NSE markets.
              </p>
            </div>

            <div className="bg-[#111d4a]/90 border border-electric-900/80 rounded-2xl p-6 space-y-3 hover:border-electric-500/40 transition-colors shadow-lg">
              <span className="text-[11px] font-mono text-electric-400 font-bold">UPTIME SLA</span>
              <div className="text-3xl font-bold font-mono text-white">99.98%</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Redundant cloud clusters ensure continuous scanning and stop execution uptime.
              </p>
            </div>
          </div>

          {/* Massive Editorial Serif Statement in Dark Sapphire */}
          <div className="max-w-4xl mx-auto text-center pt-12 border-t border-[#1c2541] space-y-6">
            <h3 className="text-3xl sm:text-5xl lg:text-[52px] font-serif font-normal text-white leading-[1.25]">
              Today, traders see only a fraction of their setups. Orders fill late. Slippage eats edge. And unmanaged risk costs accounts.
            </h3>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              TradeBuddy solves the fundamental fragmentation in retail and prop desk trading infrastructure.
            </p>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 6 — LIVE TERMINAL SIMULATOR DASHBOARD
          ====================================================================== */}
      <section id="simulator" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl border border-[#e2decfa0] shadow-xl p-6 sm:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#f0ede6]">
            <div>
              <h3 className="text-2xl sm:text-3xl font-normal tracking-tight text-slate-900">
                Review every trade. <span className="font-serif italic text-electric-600">Act on what it finds.</span>
              </h3>
              <p className="text-xs text-[#78716c] mt-1">
                Simulate AI confidence, dynamic stops, and target projections for any asset.
              </p>
            </div>

            {/* Ticker Selector Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {['NIFTY 50', 'BANKNIFTY', 'NVDA', 'RELIANCE', 'BTC/USDT'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => handleSimulate(sym)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                    simSymbol === sym
                      ? 'bg-gradient-to-r from-electric-700 to-electric-600 text-white shadow-md shadow-electric-600/30'
                      : 'bg-[#f4f4f0] text-[#78716c] hover:bg-[#e8e8e2] hover:text-slate-900'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Simulation Dashboard View */}
          <div className="bg-[#faf9f5] rounded-3xl border border-[#eeebe2] p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold font-mono text-slate-900">{simSymbol}</span>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-electric-50 text-electric-800 border border-electric-200 font-mono">
                    {simData[simSymbol]?.setup}
                  </span>
                </div>
                <div className="text-xs text-[#78716c] mt-1 font-mono">
                  Asset: {simData[simSymbol]?.type} · RSI: {simData[simSymbol]?.rsi} · {simData[simSymbol]?.vwap}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-[#78716c] font-mono">Panda AI Confidence</div>
                <div className="text-3xl font-bold font-mono text-electric-700">
                  {simulating ? 'Calculating...' : `${simData[simSymbol]?.conf}%`}
                </div>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Projected Target</div>
                <div className="text-xl font-bold text-electric-700 mt-1">{simData[simSymbol]?.target}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Risk-Reward 1:3.2</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Hard Circuit Stop</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{simData[simSymbol]?.stop}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Capital Shield Protected</div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#e8e4d8] shadow-sm">
                <div className="text-[10px] text-[#78716c] uppercase font-sans">Historical Win Rate</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{simData[simSymbol]?.wr}</div>
                <div className="text-[10px] text-[#78716c] font-sans mt-0.5">Sample: 1,420 Trades</div>
              </div>
            </div>

            {/* Panda Tip Banner */}
            <div className="bg-white p-3.5 rounded-2xl border border-electric-200/80 flex items-center gap-3 text-xs text-slate-800 shadow-sm">
              <span className="text-lg">🐼</span>
              <span className="font-medium">{simData[simSymbol]?.pandaTip}</span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-4 border-t border-[#eeebe2] text-xs text-[#78716c]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-electric-600 animate-pulse" />
                <span>Simulation model updated via live websocket stream</span>
              </div>

              <Link 
                to="/dashboard"
                className="px-5 py-2.5 bg-gradient-to-r from-electric-700 to-electric-600 hover:from-electric-600 hover:to-electric-500 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-electric-600/20"
              >
                Execute in Terminal →
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* ======================================================================
          SECTION 7 — PRICING
          ====================================================================== */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-[#e5e5e0]">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <h2 className="text-3xl sm:text-5xl font-normal tracking-tight text-slate-900">
            Transparent pricing for <span className="font-serif italic text-electric-600">every desk.</span>
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
              <div className="text-4xl font-normal font-serif text-slate-900">
                $0 <span className="text-xs font-sans text-[#78716c]">/ forever free</span>
              </div>

              <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
                <li className="flex items-center gap-2">✓ 15 AI radar signals per day</li>
                <li className="flex items-center gap-2">✓ 1 connected broker API</li>
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
              <p className="text-xs text-slate-300">For active day traders, scalpers, and systematic momentum desks.</p>
              <div className="text-4xl font-normal font-serif text-white">
                $49 <span className="text-xs font-sans text-slate-400">/ month</span>
              </div>

              <ul className="space-y-2.5 text-xs text-slate-300 pt-4 border-t border-slate-800">
                <li className="flex items-center gap-2">✓ Unlimited real-time AI radar signals</li>
                <li className="flex items-center gap-2">✓ Multi-broker smart routing (sub-12ms)</li>
                <li className="flex items-center gap-2">✓ Capital Shield circuit breaker defense</li>
                <li className="flex items-center gap-2">✓ Visual Strategy Builder &amp; Webhooks</li>
                <li className="flex items-center gap-2">✓ 10-Year historical tick backtesting</li>
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
              <h3 className="text-lg font-bold text-slate-900">Prop Firm</h3>
              <p className="text-xs text-[#78716c]">Custom infrastructure for trading desks, funds, and multi-user firms.</p>
              <div className="text-4xl font-normal font-serif text-slate-900">
                $199 <span className="text-xs font-sans text-[#78716c]">/ month</span>
              </div>

              <ul className="space-y-2.5 text-xs text-[#57534e] pt-4 border-t border-[#dfdbcf]">
                <li className="flex items-center gap-2">✓ Everything in Pro Quant</li>
                <li className="flex items-center gap-2">✓ Dedicated sub-5ms API gateway</li>
                <li className="flex items-center gap-2">✓ Multi-account risk orchestration</li>
                <li className="flex items-center gap-2">✓ Custom webhook integrations</li>
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

      {/* ======================================================================
          SECTION 8 — FAQ ACCORDION
          ====================================================================== */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto border-t border-[#e5e5e0]">
        <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-slate-900 text-center mb-10">
          Frequently asked <span className="font-serif italic text-electric-600">questions.</span>
        </h2>

        <div className="space-y-3">
          {[
            {
              q: 'How does TradeBuddy connect to my brokerage without storing passwords?',
              a: 'We use official OAuth 2.0 API tokens (such as Zerodha Kite Connect, AngelOne SmartAPI, and Interactive Brokers Gateway). Your credentials never touch our servers.',
            },
            {
              q: 'Can the Capital Shield circuit breaker flatten positions automatically?',
              a: 'Yes. When armed, Capital Shield operates directly at the gateway layer to instantly submit market exit orders if your predefined daily loss threshold is breached.',
            },
            {
              q: 'Does TradeBuddy support Indian markets (NSE & BSE) as well as US equities?',
              a: 'Yes! We provide full coverage for US Equities (NYSE/NASDAQ), Options Flow, and Indian Equities/F&O via Zerodha, Groww, AngelOne, Upstox, and Dhan.',
            },
            {
              q: 'Can I connect my TradingView alerts and Python bots?',
              a: 'Yes. Every TradeBuddy account includes dedicated webhook endpoints with signature authentication for automated webhook-to-broker execution.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              onClick={() => setFaqOpen(faqOpen === idx ? null : idx)}
              className="bg-[#f0eee6] rounded-2xl border border-[#e2decfa0] p-4.5 cursor-pointer hover:border-[#d6d0c2] transition-colors shadow-sm"
            >
              <div className="flex justify-between items-center text-xs sm:text-sm font-bold text-slate-900">
                <span>{item.q}</span>
                <span className="text-[#78716c] font-normal text-base ml-4 flex-shrink-0">
                  {faqOpen === idx ? '−' : '+'}
                </span>
              </div>
              {faqOpen === idx && (
                <p className="text-xs text-[#78716c] mt-3 pt-3 border-t border-[#dfdbcf] leading-relaxed">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ======================================================================
          SECTION 9 — FOOTER (Dark Sapphire Blue Footer)
          ====================================================================== */}
      <footer className="bg-gradient-to-b from-[#0b132b] to-[#070d1e] text-slate-400 py-16 px-4 sm:px-6 lg:px-8 border-t border-[#1c2541] text-xs">
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

    </div>
  );
}
