export function BrokersBar() {
  const brokers = [
    { name: 'ZERODHA KITE', tag: 'Fastest F&O' },
    { name: 'GROWW API', tag: 'Direct Stocks' },
    { name: 'ANGELONE', tag: 'SmartAPI' },
    { name: 'UPSTOX PRO', tag: 'NSE & BSE' },
    { name: 'DHAN HQ', tag: 'Superfast API' },
    { name: 'INTERACTIVE BROKERS', tag: 'Global US/EU' },
    { name: 'TRADINGVIEW', tag: 'Webhooks' },
    { name: 'ALPACA MARKETS', tag: '0-Commission' },
  ];

  // Duplicate the list so the animation can loop seamlessly
  const items = [...brokers, ...brokers];

  return (
    <section
      id="brokers"
      className="relative border-b border-[#e5e5e0]/30 bg-[#f4f4f0] py-12 px-4 sm:px-6 overflow-hidden"
      aria-labelledby="brokers-heading"
    >
      {/* subtle top highlight line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c4c0b5] to-transparent opacity-60" />

      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <p className="text-[10px] sm:text-[11px] font-medium tracking-[0.18em] uppercase text-[#78716c] font-mono">
            Direct OAuth2 Execution
          </p>
          <h2
            id="brokers-heading"
            className="text-sm sm:text-base font-semibold tracking-tight text-[#1c1917]"
          >
            India &amp; Global Premier Brokers
          </h2>
        </div>

        {/* Infinite slider */}
        <div className="relative overflow-hidden">
          {/* Soft edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-24 bg-gradient-to-r from-[#f4f4f0] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-24 bg-gradient-to-l from-[#f4f4f0] to-transparent" />

          <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
            {items.map((b, i) => (
              <div
                key={`${b.name}-${i}`}
                className="
                  group mx-2 sm:mx-3
                  flex-shrink-0
                  w-[140px] sm:w-[160px]
                "
              >
                <div
                  className="
                    relative h-full
                    bg-white/90 backdrop-blur-sm
                    rounded-2xl px-3 py-4
                    border border-[#e8e4d9]
                    shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.04)]
                    transition-all duration-300 ease-out
                    hover:border-electric-500/80
                    hover:shadow-[0_8px_24px_rgba(0,0,0,0.08),0_0_0_1px_rgba(var(--electric-500),0.25)]
                    hover:-translate-y-1.5
                    hover:bg-white
                    flex flex-col items-center justify-center text-center
                    cursor-default
                  "
                >
                  {/* top accent line on hover */}
                  <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-electric-500/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  <span className="tracking-tight text-[10px] sm:text-[11px] font-bold text-[#1c1917] leading-snug group-hover:text-electric-600 transition-colors duration-300">
                    {b.name}
                  </span>
                  <span className="mt-1.5 text-[9px] text-[#78716c] font-medium tracking-wide group-hover:text-electric-500/80 transition-colors duration-300">
                    {b.tag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tailwind animation (add this to your global CSS / tailwind.config) */}
      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animate-marquee {
          animation: marquee 35s linear infinite;
        }
      `}</style>
    </section>
  );
}