import { useState, useEffect } from 'react';

const U = "Hey TradePanda 👋 what is the rate of NIFTY 50 today?";
const P = "NIFTY 50 is trading at ₹24,780.40 (+0.82%) 🚀 Strong bullish momentum above VWAP with RSI 62.4!";
const T = 1100;

export function TradePandaScene() {
  const [tick, set] = useState(0);
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set(t => t >= T ? 0 : t + 1), 30);
    return () => clearInterval(id);
  }, [on]);

  const sl1 = tick < 180, ty = tick >= 180 && tick < 420, wk = tick >= 420 && tick < 560;
  const an = tick >= 560 && tick < 800, hp = tick >= 800 && tick < 960, sl2 = tick >= 960;
  const asl = sl1 || sl2;

  const uC = ty ? Math.floor(((tick - 180) / 240) * U.length) : tick >= 420 ? U.length : 0;
  const pC = an ? Math.floor(((tick - 560) / 240) * P.length) : tick >= 800 ? P.length : 0;

  const bob = asl ? Math.sin(tick * 0.06) * 2.5 : 0;
  const yT = wk ? Math.min((tick - 420) / 140, 1) : 0;
  const aS = wk ? Math.sin(yT * Math.PI) : 0;
  const bn = hp ? Math.abs(Math.sin(tick * 0.18)) * 4 : 0;
  const nR = wk ? 4 + Math.abs(Math.sin(tick * 0.3)) * 3 : 0;
  const zP2 = asl ? tick % 90 : 0;
  const zA2 = asl ? 0.5 + Math.abs(Math.sin(tick * 0.05)) * 0.5 : 0;

  const eCl = asl, eW = wk && yT < 0.6, eH = hp;
  const now = new Date();
  const hm = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

  const statusLabel = asl ? 'Sleeping 😴' : ty ? 'Trader typing' : wk ? 'Waking up 🥱' : an ? 'Analyzing ⚡' : 'Answered! 🎉';
  const statusBorder = asl ? 'rgba(71,85,105,0.5)' : an || hp ? 'rgba(59,130,246,0.5)' : wk ? 'rgba(167,139,250,0.5)' : 'rgba(251,191,36,0.5)';
  const statusColor = asl ? '#475569' : an || hp ? '#93c5fd' : wk ? '#c4b5fd' : '#fbbf24';
  const statusBg = asl ? 'rgba(15,23,42,0.5)' : an || hp ? 'rgba(30,58,138,0.3)' : wk ? 'rgba(109,40,217,0.2)' : 'rgba(120,53,15,0.3)';
  const dotBg = asl ? '#475569' : an || hp ? '#60a5fa' : wk ? '#a78bfa' : '#fbbf24';
  const onlineBg = asl ? '#374151' : an || hp ? '#34d399' : '#fbbf24';
  const onlineText = asl ? 'away · sleep mode' : ty ? 'online' : wk ? 'just woke up' : an ? 'typing...' : hp ? 'active now' : 'online';

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0', userSelect: 'none', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -32, right: 0, width: 384, height: 384, borderRadius: '50%', filter: 'blur(90px)', background: 'rgba(59,130,246,0.12)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: 0, left: -32, width: 256, height: 256, borderRadius: '50%', filter: 'blur(70px)', background: 'rgba(251,191,36,0.10)', pointerEvents: 'none' }} />

      {/* Main Card */}
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 460, borderRadius: 24, overflow: 'hidden', display: 'flex', flexDirection: 'column', color: 'white', background: 'linear-gradient(160deg,#080f20 0%,#0a1428 60%,#060c18 100%)', boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)' }}>

        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'rgba(148,163,184,0.5)', marginLeft: 4 }}>TradePanda · Live Demo</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 999, border: `1px solid ${statusBorder}`, color: statusColor, background: statusBg, transition: 'all 0.7s' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotBg, boxShadow: asl ? 'none' : '0 0 6px currentColor', display: 'inline-block' }} />
              {statusLabel}
            </div>
            <button onClick={() => setOn(v => !v)} style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>
              {on ? '❚❚' : '▶'}
            </button>
          </div>
        </div>

        {/* SVG Stage */}
        <div style={{ position: 'relative', height: 218, background: 'radial-gradient(ellipse at 50% 100%,rgba(37,99,235,0.14) 0%,transparent 72%)' }}>
          <svg viewBox="0 0 380 218" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <defs>
              <linearGradient id="s0" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#040b18" /><stop offset="100%" stopColor="#0f2352" /></linearGradient>
              <linearGradient id="sA" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#0d2166" /><stop offset="100%" stopColor="#1e40af" /></linearGradient>
              <linearGradient id="dG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8bfa8" /><stop offset="100%" stopColor="#9e9278" /></linearGradient>
              <radialGradient id="pH2" cx="45%" cy="38%" r="58%"><stop offset="0%" stopColor="#f9f9f9" /><stop offset="100%" stopColor="#e4e4e4" /></radialGradient>
              <radialGradient id="pB2" cx="50%" cy="40%" r="55%"><stop offset="0%" stopColor="#1a1a1a" /><stop offset="100%" stopColor="#080808" /></radialGradient>
              <filter id="sg2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              <filter id="xg2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>

            {/* Left monitor */}
            <rect x="6" y="26" width="88" height="62" rx="7" fill="url(#s0)" stroke={an || hp ? '#3b82f6' : '#1e293b'} strokeWidth="1.2" />
            {[0, 1, 2, 3, 4].map(i => <rect key={i} x={14 + i * 14} y={54 - i * 3} width="8" height={16 + i * 4} rx="1.5" fill={i % 2 ? '#1d4ed8' : '#38bdf8'} opacity={asl ? 0.25 : 0.9} />)}
            <path d="M 12 60 Q 36 46 58 38 T 86 28" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity={asl ? 0.08 : an || hp ? 0.9 : 0.3} />

            {/* Center monitor */}
            <rect x="108" y="12" width="164" height="92" rx="9" fill={an || hp ? 'url(#sA)' : 'url(#s0)'} stroke={an || hp ? '#60a5fa' : '#1e3a5f'} strokeWidth={an || hp ? 2 : 1.2} filter={an || hp ? 'url(#sg2)' : undefined} />
            {[0, 1, 2, 3, 4, 5].map(i => <rect key={i} x={118 + i * 22} y={50 - i * 4} width="12" height={26 + i * 4} rx="2" fill={['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#2563eb', '#1d4ed8'][i]} opacity={asl ? 0.18 : 0.9} />)}
            <path d="M 116 68 Q 148 46 185 32 T 262 16" fill="none" stroke="#60a5fa" strokeWidth="2" opacity={asl ? 0.08 : an || hp ? 1 : 0.28} filter={an || hp ? 'url(#sg2)' : undefined} />
            <text x="112" y="97" fill={an || hp ? '#60a5fa' : '#2d3f5c'} fontSize="7" fontFamily="monospace" fontWeight="600">
              {asl ? '● sleep mode' : ty ? '● standby' : wk ? '● initializing...' : an ? '● NIFTY 24800CE +32%' : '✓ trade executed'}
            </text>

            {/* Right monitor */}
            <rect x="286" y="26" width="88" height="62" rx="7" fill="url(#s0)" stroke={an || hp ? '#3b82f6' : '#1e293b'} strokeWidth="1.2" />
            {[0, 1, 2, 3, 4].map(i => <rect key={i} x={294 + i * 14} y={50 - i * 3} width="8" height={16 + i * 4} rx="1.5" fill={i % 2 ? '#38bdf8' : '#1d4ed8'} opacity={asl ? 0.25 : 0.9} />)}
            <path d="M 292 56 Q 316 72 338 52 T 366 32" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity={asl ? 0.08 : an || hp ? 0.9 : 0.3} />

            {/* Desk */}
            <ellipse cx="190" cy="178" rx="180" ry="22" fill="url(#dG)" />
            <ellipse cx="190" cy="175" rx="177" ry="8" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />

            {/* Keyboard */}
            <rect x="136" y="166" width="108" height="13" rx="4" fill="#0f1923" stroke={an ? '#1d4ed8' : '#1a2535'} strokeWidth="0.8" />
            {[0, 1, 2].map(row => [0, 1, 2, 3, 4, 5, 6, 7].map(col => <rect key={`${row}-${col}`} x={140 + col * 12} y={168 + row * 2.8} width="10" height="2" rx="0.6" fill="#1a2535" />))}

            {/* Chair */}
            <rect x="148" y="112" width="84" height="68" rx="14" fill="#0c1117" />
            <rect x="158" y="109" width="64" height="12" rx="6" fill="#151d26" />
            <rect x="142" y="130" width="14" height="32" rx="5" fill="#0c1117" />
            <rect x="224" y="130" width="14" height="32" rx="5" fill="#0c1117" />

            {/* PANDA */}
            {asl ? (
              <g transform={`translate(0,${bob})`}>
                <ellipse cx="192" cy="158" rx="52" ry="24" fill="url(#pB2)" transform="rotate(-7 192 158)" />
                <ellipse cx="188" cy="157" rx="35" ry="16" fill="#f0f0f0" transform="rotate(-7 188 157)" />
                <path d="M 143 152 Q 148 148 153 152" stroke="#222" strokeWidth="1" fill="none" opacity="0.35" />
                <path d="M 226 156 Q 231 161 236 156" stroke="#222" strokeWidth="1" fill="none" opacity="0.35" />
                <path d="M 236 163 Q 250 174 246 185 Q 240 193 232 186" stroke="#0a0a0a" strokeWidth="14" strokeLinecap="round" fill="none" />
                <path d="M 236 163 Q 250 174 246 185 Q 240 193 232 186" stroke="#161616" strokeWidth="10" strokeLinecap="round" fill="none" />
                <ellipse cx="157" cy="178" rx="24" ry="12" fill="#111" transform="rotate(-18 157 178)" />
                <ellipse cx="218" cy="180" rx="20" ry="11" fill="#111" transform="rotate(-8 218 180)" />
                <ellipse cx="167" cy="185" rx="14" ry="8" fill="#111" />
                <path d="M 158 150 Q 142 161 134 166" stroke="#0a0a0a" strokeWidth="17" strokeLinecap="round" fill="none" />
                <path d="M 164 145 Q 148 156 140 161" stroke="#141414" strokeWidth="12" strokeLinecap="round" fill="none" />
                <ellipse cx="133" cy="167" rx="9" ry="6" fill="#0a0a0a" />
                <ellipse cx="140" cy="162" rx="8" ry="5" fill="#141414" />
                <circle cx="150" cy="146" r="36" fill="url(#pH2)" />
                <circle cx="150" cy="146" r="36" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
                <circle cx="128" cy="114" r="16" fill="#0d0d0d" />
                <circle cx="128" cy="114" r="9" fill="#1d4ed8" opacity="0.8" />
                <circle cx="128" cy="114" r="5.5" fill="#3b82f6" opacity="0.4" />
                <ellipse cx="168" cy="176" rx="11" ry="7" fill="#0d0d0d" />
                <path d="M 119 135 Q 146 118 170 131" stroke="#38bdf8" strokeWidth="2.5" fill="none" opacity="0.7" />
                <rect x="114" y="131" width="10" height="14" rx="5" fill="#075985" />
                <rect x="169" y="128" width="10" height="14" rx="5" fill="#075985" />
                <ellipse cx="137" cy="142" rx="13" ry="11" fill="#0d0d0d" transform="rotate(-25 137 142)" />
                <ellipse cx="162" cy="137" rx="11" ry="10" fill="#0d0d0d" transform="rotate(15 162 137)" />
                <path d="M 130 143 Q 137 151 144 144" stroke="rgba(255,255,255,0.9)" strokeWidth="2.8" strokeLinecap="round" fill="none" />
                <path d="M 155 138 Q 162 146 169 139" stroke="rgba(255,255,255,0.9)" strokeWidth="2.8" strokeLinecap="round" fill="none" />
                <line x1="132" y1="141" x2="128" y2="137" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
                <line x1="138" y1="139" x2="138" y2="134" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
                <ellipse cx="150" cy="154" rx="5.5" ry="4" fill="#1a1a1a" />
                <ellipse cx="149" cy="152.5" rx="2.2" ry="1.3" fill="rgba(255,255,255,0.3)" />
                <path d="M 144 159 Q 150 164 156 159" stroke="#1a1a1a" strokeWidth="2" strokeLinecap="round" fill="none" />
                <ellipse cx="128" cy="154" rx="8" ry="4.5" fill="#93c5fd" opacity="0.28" />
                <ellipse cx="170" cy="148" rx="7" ry="4" fill="#93c5fd" opacity="0.28" />
                {/* ZZZ bubble */}
                <rect x="176" y="100" width="66" height="36" rx="13" fill="#0a1020" stroke="#1d4ed8" strokeWidth="1.2" opacity="0.96" />
                <path d="M 186 136 L 178 148 L 196 136" fill="#0a1020" stroke="#1d4ed8" strokeWidth="1" strokeLinejoin="round" />
                <text x="185" y="124" fill="#3b82f6" fontSize="16" fontFamily="monospace" fontWeight="700" opacity={0.5 + Math.abs(Math.sin(tick * 0.05)) * 0.5}>Z</text>
                <text x="203" y="118" fill="#60a5fa" fontSize="12" fontFamily="monospace" fontWeight="600" opacity={0.4 + Math.abs(Math.sin(tick * 0.05 + 1)) * 0.45}>z</text>
                <text x="216" y="112" fill="#93c5fd" fontSize="8" fontFamily="monospace" fontWeight="500" opacity={0.3 + Math.abs(Math.sin(tick * 0.05 + 2)) * 0.35}>z</text>
                <text x={200 + Math.sin(tick * 0.08) * 3} y={96 - zP2 * 0.24} fill="#3b82f6" fontSize="9" fontFamily="monospace" opacity={Math.max(0, zA2 - zP2 / 90)}>z</text>
              </g>
            ) : (
              <g transform={`translate(0,${hp ? -bn : wk ? Math.sin(yT * Math.PI) * -5 : 0})`}>
                <ellipse cx="190" cy="152" rx="38" ry="33" fill="url(#pB2)" />
                <ellipse cx="190" cy="154" rx="26" ry="23" fill="#f0f0f0" />
                <path d="M 155 148 Q 160 144 165 148" stroke="#222" strokeWidth="1" fill="none" opacity="0.3" />
                <path d="M 215 148 Q 220 144 225 148" stroke="#222" strokeWidth="1" fill="none" opacity="0.3" />
                <ellipse cx="170" cy="178" rx="15" ry="9" fill="#0d0d0d" />
                <ellipse cx="210" cy="178" rx="15" ry="9" fill="#0d0d0d" />
                <ellipse cx="170" cy="183" rx="10" ry="6" fill="#111" />
                <ellipse cx="210" cy="183" rx="10" ry="6" fill="#111" />
                {/* Arms */}
                {wk ? (
                  <>
                    <ellipse cx={190 - 46 - aS * 34} cy={150 - aS * 38} rx="18" ry="11" fill="#0d0d0d" transform={`rotate(${-35 - aS * 55} ${190 - 46 - aS * 34} ${150 - aS * 38})`} />
                    <ellipse cx={190 + 46 + aS * 34} cy={150 - aS * 38} rx="18" ry="11" fill="#0d0d0d" transform={`rotate(${35 + aS * 55} ${190 + 46 + aS * 34} ${150 - aS * 38})`} />
                  </>
                ) : an || hp ? (
                  <>
                    <ellipse cx="160" cy="164" rx="15" ry="10" fill="#0d0d0d" />
                    <path d="M 218 155 Q 230 140 240 127" stroke="#0d0d0d" strokeWidth="18" strokeLinecap="round" fill="none" />
                    <ellipse cx="242" cy="125" rx="11" ry="11" fill="#0d0d0d" />
                    <circle cx="242" cy="118" r="6" fill="#60a5fa" filter="url(#xg2)" />
                  </>
                ) : (
                  <>
                    <ellipse cx="160" cy="165" rx="15" ry="10" fill="#0d0d0d" />
                    <ellipse cx="220" cy="165" rx="15" ry="10" fill="#0d0d0d" />
                  </>
                )}
                <circle cx="190" cy="111" r="38" fill="url(#pH2)" />
                <circle cx="190" cy="111" r="38" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
                <circle cx="154" cy="80" r="17" fill="#0d0d0d" />
                <circle cx="154" cy="80" r="10" fill="#1d4ed8" opacity="0.82" />
                <circle cx="154" cy="80" r="6" fill="#3b82f6" opacity="0.42" />
                <circle cx="226" cy="80" r="17" fill="#0d0d0d" />
                <circle cx="226" cy="80" r="10" fill="#1d4ed8" opacity="0.82" />
                <circle cx="226" cy="80" r="6" fill="#3b82f6" opacity="0.42" />
                {wk && <circle cx="167" cy="66" r={nR} fill="#f59e0b" opacity="0.95" filter="url(#sg2)" />}
                <path d="M 151 101 Q 190 84 229 101" stroke="#38bdf8" strokeWidth="3" fill="none" />
                <rect x="146" y="97" width="11" height="17" rx="5" fill="#0369a1" />
                <rect x="223" y="97" width="11" height="17" rx="5" fill="#0369a1" />
                <path d="M 150 111 Q 163 133 178 128" stroke="#38bdf8" strokeWidth="2.5" fill="none" />
                <circle cx="179" cy="128" r="3.5" fill="#38bdf8" filter="url(#sg2)" />
                <ellipse cx="174" cy="109" rx="14" ry="16" fill="#0d0d0d" transform="rotate(-14 174 109)" />
                <ellipse cx="206" cy="109" rx="14" ry="16" fill="#0d0d0d" transform="rotate(14 206 109)" />
                {/* Eyes */}
                {eCl ? (
                  <>
                    <path d="M 165 111 Q 174 119 183 111" stroke="rgba(255,255,255,0.95)" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <path d="M 197 111 Q 206 119 215 111" stroke="rgba(255,255,255,0.95)" strokeWidth="3" strokeLinecap="round" fill="none" />
                  </>
                ) : eW ? (
                  <>
                    <circle cx="174" cy="109" r="9" fill="#fff" />
                    <circle cx="175" cy="108" r="5" fill="#1e3a8a" />
                    <circle cx="176.5" cy="106.5" r="1.8" fill="#fff" />
                    <circle cx="206" cy="109" r="9" fill="#fff" />
                    <circle cx="207" cy="108" r="5" fill="#1e3a8a" />
                    <circle cx="208.5" cy="106.5" r="1.8" fill="#fff" />
                  </>
                ) : eH ? (
                  <>
                    <path d="M 165 108 Q 174 120 183 108" stroke="#111" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                    <path d="M 197 108 Q 206 120 215 108" stroke="#111" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                  </>
                ) : (
                  <>
                    <circle cx="174" cy="109" r="7" fill="#fff" />
                    <circle cx="175" cy="108" r="4" fill="#1e3a8a" />
                    <circle cx="176.5" cy="106.5" r="1.4" fill="#fff" />
                    <circle cx="206" cy="109" r="7" fill="#fff" />
                    <circle cx="207" cy="108" r="4" fill="#1e3a8a" />
                    <circle cx="208.5" cy="106.5" r="1.4" fill="#fff" />
                  </>
                )}
                {!eCl && !eH && (
                  <>
                    <path d="M 165 101 Q 174 97 183 101" stroke={eW ? '#f59e0b' : '#2a2a2a'} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    <path d="M 197 101 Q 206 97 215 101" stroke={eW ? '#f59e0b' : '#2a2a2a'} strokeWidth="2.5" strokeLinecap="round" fill="none" />
                  </>
                )}
                <path d="M 158 105 Q 190 99 222 105" stroke="#38bdf8" strokeWidth="1.5" fill="none" opacity="0.7" />
                <rect x="160" y="101" width="28" height="15" rx="7" fill="#38bdf8" opacity={an || hp ? 0.42 : 0.12} stroke="#38bdf8" strokeWidth="0.8" />
                <rect x="192" y="101" width="28" height="15" rx="7" fill="#38bdf8" opacity={an || hp ? 0.42 : 0.12} stroke="#38bdf8" strokeWidth="0.8" />
                <ellipse cx="190" cy="125" rx="6" ry="4.5" fill="#1a1a1a" />
                <ellipse cx="189" cy="123.5" rx="2.4" ry="1.5" fill="rgba(255,255,255,0.32)" />
                {wk && yT > 0.35 ? (
                  <ellipse cx="190" cy="135" rx="7.5" ry={5 + yT * 8} fill="#111" />
                ) : eH ? (
                  <path d="M 179 132 Q 190 143 201 132" stroke="#111" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                ) : (
                  <path d="M 181 131 Q 190 138 199 131" stroke="#111" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                )}
                <ellipse cx="158" cy="122" rx="8" ry="5" fill="#93c5fd" opacity={eH ? 0.55 : 0.32} />
                <ellipse cx="222" cy="122" rx="8" ry="5" fill="#93c5fd" opacity={eH ? 0.55 : 0.32} />
                {hp && tick < 870 && <>
                  <text x="124" y="86" fontSize="14" fill="#fbbf24" filter="url(#sg2)">✨</text>
                  <text x="240" y="80" fontSize="11" fill="#fbbf24">⭐</text>
                  <text x="224" y="66" fontSize="9" fill="#60a5fa">💫</text>
                </>}
              </g>
            )}
          </svg>
        </div>

        {/* Chat UI */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '0 12px 10px', borderRadius: 16, overflow: 'hidden', background: '#0c1420', border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'rgba(10,16,32,0.9)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>🐼</div>
              <span style={{ position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', border: '2px solid #0c1420', background: onlineBg, transition: 'all 0.5s' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', letterSpacing: '-0.01em' }}>TradePanda AI</div>
              <div style={{ fontSize: 10, fontFamily: 'monospace', color: asl ? '#4b5563' : an ? '#60a5fa' : hp ? '#34d399' : '#6b7280' }}>{onlineText}</div>
            </div>
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#374151', flexShrink: 0 }}>{hm}</span>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8, overflow: 'hidden' }}>
            {sl1 && tick < 60 && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, padding: '4px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', color: '#4b5563' }}>TradePanda AI is resting 😴</span>
              </div>
            )}
            {/* User msg */}
            {uC > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ padding: '10px 16px', borderRadius: '20px 20px 5px 20px', fontSize: 12, color: 'white', lineHeight: 1.4, maxWidth: '80%', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', boxShadow: '0 2px 12px rgba(29,78,216,0.35)' }}>
                    {U.slice(0, uC)}
                    {ty && uC < U.length && <span style={{ display: 'inline-block', width: 2, height: 13, background: 'rgba(255,255,255,0.7)', marginLeft: 2, borderRadius: 1, verticalAlign: 'middle', animation: 'pulse 0.65s ease-in-out infinite' }} />}
                  </div>
                  {!ty && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#4b5563' }}><span>{hm}</span><span style={{ color: '#3b82f6' }}>✓✓</span></div>}
                </div>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 16, background: '#1f2937' }}>👤</div>
              </div>
            )}
            {/* Panda waking */}
            {wk && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 8, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' }}>🐼</div>
                <div style={{ padding: '10px 16px', borderRadius: '20px 20px 20px 5px', fontSize: 12, fontStyle: 'italic', background: 'rgba(30,58,138,0.3)', border: '1px solid rgba(59,130,246,0.2)', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🥱 waking up...
                  <span style={{ display: 'flex', gap: 2 }}>
                    {[0, 120, 240].map(d => <span key={d} style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569', display: 'inline-block', animation: `bounce 1s ${d}ms ease-in-out infinite` }} />)}
                  </span>
                </div>
              </div>
            )}
            {/* Panda scanning */}
            {an && pC === 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 8, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' }}>🐼</div>
                <div style={{ padding: '10px 16px', borderRadius: '20px 20px 20px 5px', fontSize: 12, background: 'rgba(12,31,94,0.6)', border: '1px solid rgba(59,130,246,0.2)', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚡ scanning 5,200 symbols
                  <span style={{ display: 'flex', gap: 2 }}>
                    {[0, 120, 240].map(d => <span key={d} style={{ width: 4, height: 4, borderRadius: '50%', background: '#38bdf8', display: 'inline-block', animation: `bounce 1s ${d}ms ease-in-out infinite` }} />)}
                  </span>
                </div>
              </div>
            )}
            {/* Panda answer */}
            {pC > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, marginBottom: 14, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' }}>🐼</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '80%' }}>
                  <div style={{ padding: '10px 16px', borderRadius: '20px 20px 20px 5px', fontSize: 12, color: 'white', lineHeight: 1.4, background: 'linear-gradient(135deg,#0f2352,#1a3a8a)', border: '1px solid rgba(59,130,246,0.28)', boxShadow: '0 2px 16px rgba(29,78,216,0.25)' }}>
                    {P.slice(0, pC)}
                    {an && pC < P.length && <span style={{ display: 'inline-block', width: 2, height: 13, background: 'rgba(96,165,250,0.8)', marginLeft: 2, borderRadius: 1, verticalAlign: 'middle', animation: 'pulse 0.5s ease-in-out infinite' }} />}
                  </div>
                  {hp && <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, paddingLeft: 4, color: '#4b5563' }}><span>{hm}</span><span style={{ color: '#34d399' }}>✓✓</span><span style={{ color: '#3b82f6' }}>· Live Market API</span></div>}
                </div>
              </div>
            )}
            {sl2 && tick > 980 && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, padding: '4px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', color: '#374151' }}>TradePanda AI went back to sleep 😴 zzz</span>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(8,14,28,0.8)' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 999, padding: '8px 16px', fontSize: 11, background: 'rgba(255,255,255,0.06)', color: asl ? '#374151' : '#6b7280' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {asl ? 'Panda is sleeping...' : ty ? U.slice(0, uC) : 'Message TradePanda...'}
              </span>
              <span style={{ color: '#374151' }}>🎙️</span>
            </div>
            <button style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, transition: 'all 0.3s', background: hp ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' : 'rgba(30,58,138,0.35)', boxShadow: hp ? '0 0 18px rgba(59,130,246,0.65)' : 'none', transform: hp ? 'scale(1.1)' : 'scale(1)' }}>
              {hp ? '🚀' : '↑'}
            </button>
          </div>
        </div>

        {/* Scrubber */}
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ width: '100%', height: 3, borderRadius: 999, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', borderRadius: 999, transition: 'width 75ms linear', width: `${(tick / T) * 100}%`, background: 'linear-gradient(90deg,#1d4ed8,#38bdf8,#0ea5e9)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 9, fontFamily: 'monospace', color: '#374151' }}>
            <span>{sl1 ? 'Sleeping' : ty ? 'Trader typing' : wk ? 'Waking up' : an ? 'Analyzing' : hp ? 'Answered!' : 'Sleeping'}</span>
            <span>{Math.floor((tick / T) * 30)}s / 30s</span>
          </div>
        </div>
      </div>
    </div>
  );
}
