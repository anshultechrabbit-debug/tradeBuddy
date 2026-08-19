/**
 * MarketDataProvider — interface contract for market-data vendors.
 *
 * The Radar engine, feature engine and dashboard consume normalized data
 * through this interface. Concrete providers (Development, Zerodha,
 * Licensed) are selected by MARKET_DATA_PROVIDER and are swappable without
 * rewriting the Radar engine.
 *
 * Every record carries a `dataSource` field so consumers can distinguish
 * development-generated data (dataSource === 'development') from licensed
 * production data.
 */
export class MarketDataProvider {
  constructor(name, environment) {
    this.name = name;
    this.environment = environment || 'production';
    this.dataSource = 'live';
  }

  async getInstruments() {
    throw new Error(`${this.name}: getInstruments() not implemented`);
  }

  async getQuote(symbol, exchange = 'NSE') {
    throw new Error(`${this.name}: getQuote() not implemented`);
  }

  async getQuotes() {
    throw new Error(`${this.name}: getQuotes() not implemented`);
  }

  async getCandles(symbol, timeframe = '1d', limit = 100, exchange = 'NSE') {
    throw new Error(`${this.name}: getCandles() not implemented`);
  }

  async getIndexData() {
    throw new Error(`${this.name}: getIndexData() not implemented`);
  }

  async getMarketBreadth() {
    throw new Error(`${this.name}: getMarketBreadth() not implemented`);
  }

  async getVolatility(symbol) {
    throw new Error(`${this.name}: getVolatility() not implemented`);
  }

  describe() {
    return { provider: this.name, environment: this.environment, dataSource: this.dataSource };
  }
}