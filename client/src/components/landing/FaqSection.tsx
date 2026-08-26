import { useState } from 'react';

export function FaqSection() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const faqs = [
    {
      q: 'How does TradeBuddy connect to Zerodha, Groww, and other brokers without storing passwords?',
      a: 'We use official OAuth 2.0 API tokens (such as Zerodha Kite Connect, AngelOne SmartAPI, Upstox Developer API, and Interactive Brokers Gateway). Your passwords never touch our servers.',
    },
    {
      q: 'Can the Capital Shield circuit breaker flatten positions automatically?',
      a: 'Yes. When armed, Capital Shield operates directly at the gateway layer to instantly submit market exit orders if your predefined daily loss threshold is breached.',
    },
    {
      q: 'Does TradeBuddy support Indian markets (NSE & BSE NIFTY/BANKNIFTY) as well as US equities?',
      a: 'Yes! We provide full coverage for NSE Equities, NIFTY & BANKNIFTY Options Flow, Stock Futures, as well as US Equities (NYSE/NASDAQ) via Zerodha, Groww, AngelOne, Upstox, Dhan, Fyers, and IBKR.',
    },
    {
      q: 'Can I connect my TradingView alerts and Python bots?',
      a: 'Yes. Every TradeBuddy account includes dedicated webhook endpoints with signature authentication for automated webhook-to-broker execution.',
    },
    {
      q: 'What is TradePanda AI and how does it assist my trading?',
      a: 'TradePanda is your 24/7 AI trading companion. It continuously scans 5,200+ symbols across 15+ technical indicators (RSI, VWAP, Supertrend, MACD, Volume Spikes), alerts you to high-probability setups, and enforces strict risk management rules.',
    },
  ];

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto border-t border-[#e5e5e0]">
      <h2 className="text-2xl sm:text-3xl font-normal tracking-tight text-slate-900 text-center mb-12">
        Frequently asked{' '}
        <span className="font-serif italic text-electric-600">questions.</span>
      </h2>

      <div className="space-y-3">
        {faqs.map((item, idx) => {
          const isOpen = faqOpen === idx;

          return (
            <div
              key={idx}
              onClick={() => setFaqOpen(isOpen ? null : idx)}
              className={`
                group relative rounded-2xl border bg-[#f0eee6]
                transition-all duration-200 ease-out cursor-pointer
                ${isOpen
                  ? 'border-[#d6d0c2] shadow-sm'
                  : 'border-[#e2decfa0] hover:border-[#d6d0c2] hover:shadow-sm'
                }
              `}
            >
              <button
                type="button"
                className="w-full flex items-start justify-between gap-4 p-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f0eee6] rounded-2xl"
                aria-expanded={isOpen}
              >
                <span className="text-sm font-semibold text-slate-900 leading-snug pr-2">
                  {item.q}
                </span>

                <span
                  className={`
                    flex-shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center
                    rounded-full text-[#78716c] text-lg font-light
                    transition-transform duration-200
                    ${isOpen ? 'rotate-45' : 'group-hover:text-slate-700'}
                  `}
                >
                  +
                </span>
              </button>

              <div
                className={`
                  grid transition-all duration-200 ease-out
                  ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}
                `}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-0">
                    <div className="border-t border-[#dfdbcf] pt-4">
                      <p className="text-sm text-[#78716c] leading-relaxed">
                        {item.a}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}