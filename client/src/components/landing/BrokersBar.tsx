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

  return (
    <section id="brokers" className="border-b border-[#e5e5e0] bg-[#f4f4f0] py-8 px-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="text-center text-xs font-medium text-[#78716c] tracking-tight uppercase font-mono">
          Direct OAuth2 Execution with India &amp; Global Premier Brokers
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono font-bold text-xs text-[#141414]">
          {brokers.map((b, idx) => (
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
  );
}
