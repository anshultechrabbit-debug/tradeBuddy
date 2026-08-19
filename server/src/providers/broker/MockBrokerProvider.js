import { BrokerProvider } from './BrokerProvider.js';
import { seededRng, hashString } from '../../utils/random.js';
import { round2, round4 } from '../../utils/helpers.js';

const DEFAULT_PORTFOLIO = [
  { symbol: 'RELIANCE', exchange: 'NSE', quantity: 40, averagePrice: 2450 },
  { symbol: 'TCS', exchange: 'NSE', quantity: 20, averagePrice: 3250 },
  { symbol: 'HDFCBANK', exchange: 'NSE', quantity: 30, averagePrice: 1480 },
  { symbol: 'INFY', exchange: 'NSE', quantity: 25, averagePrice: 1350 },
  { symbol: 'ITC', exchange: 'NSE', quantity: 200, averagePrice: 355 },
  { symbol: 'LT', exchange: 'NSE', quantity: 15, averagePrice: 3210 },
  { symbol: 'SBIN', exchange: 'NSE', quantity: 60, averagePrice: 660 },
  { symbol: 'TATAMOTORS', exchange: 'NSE', quantity: 50, averagePrice: 780 },
  { symbol: 'BHARTIARTL', exchange: 'NSE', quantity: 25, averagePrice: 1120 },
  { symbol: 'ASIANPAINT', exchange: 'NSE', quantity: 10, averagePrice: 2960 },
];

const ORDER_TYPES = ['MARKET', 'LIMIT'];
const SIDES = ['BUY', 'SELL'];
const STATUSES = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'OPEN', 'CANCELLED'];

/**
 * MockBrokerProvider — deterministic development broker.
 *
 * provider=mock, environment=development. Produces realistic seeded data
 * (multiple holdings, positions, orders, trades, funds, average prices,
 * current prices, P&L). Prices come from the injected MarketDataProvider so
 * portfolio P&L stays consistent with the Radar and quotes.
 */
export class MockBrokerProvider extends BrokerProvider {
  constructor(marketDataProvider) {
    super('mock', 'development');
    this.marketData = marketDataProvider;
    this._seedPrefix = 'mock-broker';
  }

  _seedKey(seedKey) {
    return seedKey ? `${this._seedPrefix}:${seedKey}` : this._seedPrefix;
  }

  _orderId(seedKey, i) {
    const tag = Math.abs(hashString(this._seedKey(seedKey) || 'default')).toString(16).slice(0, 6);
    return `MOCK-${tag}-${1000 + i}`;
  }

  _quoteCache = new Map();

  async _currentPrices(symbols, seedKey) {
    const missing = symbols.filter((s) => !this._quoteCache.has(`${seedKey}:${s}`));
    const quotes = await this.marketData.getQuotes({ symbols: missing, seedKey });
    for (const q of quotes) {
      this._quoteCache.set(`${seedKey}:${q.symbol}`, q);
    }
    return symbols.map((s) => this._quoteCache.get(`${seedKey}:${s}`) ?? null);
  }

  async connect() {
    const token = `mock-access-${Math.floor(Date.now() / 1000)}`;
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return {
      token,
      refreshToken: `mock-refresh-${Math.floor(Date.now() / 1000)}`,
      expiry,
      provider: 'mock',
      environment: 'development',
    };
  }

  async disconnect() {
    return { disconnected: true };
  }

  async getHoldings({ seedKey } = {}) {
    const rng = seededRng(this._seedKey(seedKey) + ':holdings');
    const symbols = DEFAULT_PORTFOLIO.map((h) => h.symbol);
    const quotes = await this._currentPrices(symbols, seedKey);

    const holdings = DEFAULT_PORTFOLIO.map((h, i) => {
      const currentPrice = quotes[i] ? Number(quotes[i].lastPrice) : h.averagePrice;
      const costValue = round2(h.quantity * h.averagePrice);
      const currentValue = round2(h.quantity * currentPrice);
      const pnl = round2(currentValue - costValue);
      return {
        symbol: h.symbol,
        exchange: h.exchange,
        quantity: h.quantity,
        averagePrice: h.averagePrice,
        currentPrice: round2(currentPrice),
        costValue,
        currentValue,
        pnl,
        pnlPct: round2((pnl / costValue) * 100),
        provider: 'mock',
        environment: 'development',
      };
    });

    const noise = Array.from({ length: 3 }, (_, i) => {
      const sym = pickOther(symbols, i);
      return {
        symbol: sym,
        exchange: 'NSE',
        quantity: 5 + Math.floor(rng() * 20),
        averagePrice: 500 + rng() * 2000,
        currentPrice: 500 + rng() * 2000,
        costValue: 0,
        currentValue: 0,
        pnl: 0,
        pnlPct: 0,
        provider: 'mock',
        environment: 'development',
      };
    });

    return [...holdings, ...noise];
  }

  async getPositions({ seedKey } = {}) {
    const holdings = await this.getHoldings({ seedKey });
    const rng = seededRng(this._seedKey(seedKey) + ':positions');
    return holdings.map((h) => ({
      symbol: h.symbol,
      exchange: h.exchange,
      quantity: h.quantity,
      averagePrice: h.averagePrice,
      lastPrice: h.currentPrice,
      dayQuantity: rng() > 0.5 ? Math.floor(rng() * 10) : 0,
      dayAvgPrice: round2(h.averagePrice * (1 + (rng() - 0.5) * 0.01)),
      pnl: h.pnl,
      product: 'CNC',
      provider: 'mock',
      environment: 'development',
    }));
  }

  async getOrders({ seedKey, limit = 30 } = {}) {
    const rng = seededRng(this._seedKey(seedKey) + ':orders');
    const now = Date.now();
    const orders = [];
    for (let i = 0; i < limit; i += 1) {
      const base = DEFAULT_PORTFOLIO[Math.floor(rng() * DEFAULT_PORTFOLIO.length)];
      const side = SIDES[Math.floor(rng() * SIDES.length)];
      const quantity = Math.max(1, Math.floor(rng() * 20 + 1)) * 5;
      const price = round2(base.averagePrice * (1 + (rng() - 0.5) * 0.1));
      const status = STATUSES[Math.floor(rng() * STATUSES.length)];
      const ts = new Date(now - Math.floor(rng() * 90 * 24 * 60 * 60 * 1000));
      orders.push({
        brokerOrderId: this._orderId(seedKey, i),
        symbol: base.symbol,
        exchange: 'NSE',
        side,
        orderType: ORDER_TYPES[Math.floor(rng() * 2)],
        quantity,
        price: side === 'SELL' ? round2(price * 1.02) : price,
        averagePrice: status === 'COMPLETED' ? price : null,
        status,
        filledQuantity: status === 'COMPLETED' ? quantity : status === 'OPEN' ? 0 : 0,
        timestamp: ts,
        provider: 'mock',
        environment: 'development',
      });
    }
    return orders.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getTrades({ seedKey, limit = 20 } = {}) {
    const orders = await this.getOrders({ seedKey, limit: limit + 10 });
    return orders
      .filter((o) => o.status === 'COMPLETED')
      .slice(0, limit)
      .map((o) => ({
        tradeId: `TR-${o.brokerOrderId}`,
        orderId: o.brokerOrderId,
        symbol: o.symbol,
        exchange: o.exchange,
        side: o.side,
        quantity: o.filledQuantity ?? o.quantity,
        price: o.averagePrice,
        timestamp: o.timestamp,
        provider: 'mock',
        environment: 'development',
      }));
  }

  async getFunds({ seedKey } = {}) {
    const holdings = await this.getHoldings({ seedKey });
    const rng = seededRng(this._seedKey(seedKey) + ':funds');
    const holdingsValue = round2(
      holdings.reduce((acc, h) => acc + h.currentValue, 0),
    );
    const invested = round2(holdings.reduce((acc, h) => acc + h.costValue, 0));
    const cash = round2(250000 + rng() * 200000);
    const unrealisedPnl = round2(holdingsValue - invested);
    return {
      availableCash: cash,
      holdingsValue,
      invested,
      unrealisedPnl,
      totalBalance: round2(cash + holdingsValue),
      provider: 'mock',
      environment: 'development',
    };
  }

  async getQuotes({ symbols = [], seedKey } = {}) {
    return this._currentPrices(symbols, seedKey);
  }

  async getPortfolio({ seedKey } = {}) {
    const [holdings, funds] = await Promise.all([
      this.getHoldings({ seedKey }),
      this.getFunds({ seedKey }),
    ]);
    const invested = round2(
      holdings.reduce((acc, h) => acc + h.costValue, 0),
    );
    const current = round2(holdings.reduce((acc, h) => acc + h.currentValue, 0));
    const pnl = round2(current - invested);
    return {
      invested,
      currentValue: current,
      totalPnl: pnl,
      pnlPct: invested > 0 ? round2((pnl / invested) * 100) : 0,
      holdingsCount: holdings.length,
      cash: funds.availableCash,
      provider: 'mock',
      environment: 'development',
    };
  }
}

function pickOther(symbols, i) {
  const extras = [
    'WIPRO',
    'HCLTECH',
    'TECHM',
    'TITAN',
    'ULTRACEMCO',
    'MARUTI',
    'NESTLEIND',
    'SUNPHARMA',
    'DIVISLAB',
    'HINDUNILVR',
  ];
  const sym = extras[i % extras.length];
  if (symbols.includes(sym)) return `${sym}EQ`;
  return sym;
}