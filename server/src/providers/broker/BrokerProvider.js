/**
 * BrokerProvider — interface contract for all broker integrations.
 *
 * Business logic must depend ONLY on this interface. Concrete providers
 * (Mock, Zerodha, Upstox) are selected by the BROKER_PROVIDER env var in
 * src/providers/broker/index.js and are swappable at runtime without
 * touching Radar, Portfolio, Watchlist, Strategy, Alerts, Journal or Admin.
 *
 * All methods must return normalized, plain-JSON objects.
 */
export class BrokerProvider {
  constructor(name, environment) {
    this.name = name;
    this.environment = environment || 'production';
  }

  async connect(_credentials) {
    throw new Error(`${this.name}: connect() not implemented`);
  }

  async disconnect() {
    throw new Error(`${this.name}: disconnect() not implemented`);
  }

  async getHoldings() {
    throw new Error(`${this.name}: getHoldings() not implemented`);
  }

  async getPositions() {
    throw new Error(`${this.name}: getPositions() not implemented`);
  }

  async getOrders() {
    throw new Error(`${this.name}: getOrders() not implemented`);
  }

  async getTrades() {
    throw new Error(`${this.name}: getTrades() not implemented`);
  }

  async getFunds() {
    throw new Error(`${this.name}: getFunds() not implemented`);
  }

  async getQuotes(_symbols) {
    throw new Error(`${this.name}: getQuotes() not implemented`);
  }

  async getPortfolio() {
    throw new Error(`${this.name}: getPortfolio() not implemented`);
  }

  describe() {
    return { provider: this.name, environment: this.environment };
  }
}