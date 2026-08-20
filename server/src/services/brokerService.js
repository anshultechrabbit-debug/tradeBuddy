import { prisma } from '../config/prisma.js';
import { getBrokerProvider, getBrokerConfig, BROKER_NAMES } from '../providers/broker/index.js';
import { encryptString, decryptString } from '../utils/crypto.js';
import { audit, logInfra } from '../utils/helpers.js';
import { BadRequestError, NotFoundError, ConflictError } from '../utils/errors.js';
import { isConsentActive } from './consentService.js';

const CONNECTION_STATUSES = ['CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR', 'REVOKED'];

export function assertSupportedBroker(broker) {
  if (!BROKER_NAMES.includes(broker)) {
    throw new BadRequestError(`Unsupported broker: ${broker}`, 'UNSUPPORTED_BROKER');
  }
}

export async function listConnections(userId) {
  const rows = await prisma.brokerConnection.findMany({
    where: { userId },
    orderBy: { broker: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    broker: r.broker,
    status: r.status,
    displayName: r.displayName,
    lastSyncAt: r.lastSyncAt,
    lastError: r.lastError,
    expiryAt: r.expiryAt,
    createdAt: r.createdAt,
    config: getBrokerConfig(r.broker),
  }));
}

export async function getConnection(userId, broker) {
  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId, broker } },
  });
  if (!conn) throw new NotFoundError(`No ${broker} connection`);
  return conn;
}

export async function connect(userId, broker, { ip } = {}) {
  assertSupportedBroker(broker);

  const provider = getBrokerProvider();
  const isMock = broker === 'mock';

  if (!isMock && provider.name !== broker) {
    throw new BadRequestError(
      `Broker '${broker}' is not the active provider. Set BROKER_PROVIDER=${broker} to enable it.`,
      'BROKER_NOT_CONFIGURED',
    );
  }

  const config = getBrokerConfig(broker);
  if (!config.configured) {
    throw new BadRequestError(
      `${broker} API is not configured. Purchase production access and set the environment variables.`,
      'BROKER_NOT_CONFIGURED',
    );
  }

  const session = await provider.connect({});
  const expiry = session.expiry ? new Date(session.expiry) : new Date(Date.now() + 365 * 24 * 3600 * 1000);

  const conn = await prisma.brokerConnection.upsert({
    where: { userId_broker: { userId, broker } },
    create: {
      userId,
      broker,
      status: 'CONNECTED',
      displayName: broker === 'mock' ? 'Mock Broker (development)' : `Real ${broker}`,
      expiryAt: expiry,
    },
    update: {
      status: 'CONNECTED',
      displayName: broker === 'mock' ? 'Mock Broker (development)' : `Real ${broker}`,
      expiryAt: expiry,
      lastError: null,
    },
  });

  if (session.token) {
    const encrypted = encryptString(session.token);
    const existing = await prisma.brokerToken.findUnique({
      where: { connectionId_tokenType: { connectionId: conn.id, tokenType: 'access' } },
    });
    if (existing) {
      await prisma.brokerToken.update({
        where: { id: existing.id },
        data: {
          encryptedToken: encrypted.encryptedToken,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          expiresAt: expiry,
        },
      });
    } else {
      await prisma.brokerToken.create({
        data: {
          connectionId: conn.id,
          userId,
          tokenType: 'access',
          encryptedToken: encrypted.encryptedToken,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          expiresAt: expiry,
        },
      });
    }
  }

  await audit(userId, 'BROKER_CONNECT', 'broker_connection', conn.id, { broker }, ip);
  logInfra('info', 'broker', `User ${userId} connected ${broker} (${provider.name}, ${provider.environment})`);

  return {
    id: conn.id,
    broker,
    status: 'CONNECTED',
    displayName: conn.displayName,
    expiryAt: expiry,
    provider: provider.name,
    environment: provider.environment,
  };
}

export async function disconnect(userId, broker, { ip } = {}) {
  assertSupportedBroker(broker);
  const conn = await getConnection(userId, broker);
  await prisma.$transaction([
    prisma.brokerToken.deleteMany({ where: { connectionId: conn.id } }),
    prisma.brokerConnection.update({
      where: { id: conn.id },
      data: { status: 'DISCONNECTED', lastError: null },
    }),
  ]);
  await audit(userId, 'BROKER_DISCONNECT', 'broker_connection', conn.id, { broker }, ip);
  return { ok: true, status: 'DISCONNECTED' };
}

/**
 * Syncs broker data into portfolio/orders/journal. Skips scopes for which
 * consent is not active, and records a REVOKED/disabled state when a consent
 * revocation has disabled the connection.
 */
export async function sync(userId, broker, { ip } = {}) {
  assertSupportedBroker(broker);
  const conn = await getConnection(userId, broker);
  if (conn.status === 'EXPIRED' || (conn.expiryAt && conn.expiryAt < new Date())) {
    await markConnectionStatus(userId, broker, 'EXPIRED', ip);
    throw new BadRequestError('Broker connection has expired', 'BROKER_TOKEN_EXPIRED');
  }
  if (conn.status !== 'CONNECTED') {
    throw new BadRequestError(`Broker connection is ${conn.status}`, 'BROKER_NOT_CONNECTED');
  }

  const provider = getBrokerProvider();
  const started = Date.now();
  const summary = {};

  if (await isConsentActive(userId, broker, 'holdings')) {
    const holdings = await provider.getHoldings({ seedKey: String(userId) });
    const holdingSymbols = [...new Set(holdings.map((h) => h.symbol))];
    const holdingInstruments = await prisma.instrument.findMany({
      where: { symbol: { in: holdingSymbols }, exchange: 'NSE' },
    });
    const holdingInstrumentMap = new Map(holdingInstruments.map((i) => [i.symbol, i.id]));
    for (const h of holdings) {
      const instrumentId = holdingInstrumentMap.get(h.symbol) ?? null;
      await prisma.portfolioHolding.upsert({
        where: { userId_broker_symbol: { userId, broker, symbol: h.symbol } },
        create: {
          userId, broker, symbol: h.symbol, exchange: h.exchange,
          instrumentId,
          quantity: h.quantity, averagePrice: h.averagePrice,
          currentPrice: h.currentPrice, costValue: h.costValue,
          currentValue: h.currentValue, pnl: h.pnl, pnlPct: h.pnlPct,
          source: 'broker',
        },
        update: {
          instrumentId,
          quantity: h.quantity, averagePrice: h.averagePrice,
          currentPrice: h.currentPrice, costValue: h.costValue,
          currentValue: h.currentValue, pnl: h.pnl, pnlPct: h.pnlPct,
          syncedAt: new Date(),
        },
      });
    }
    summary.holdings = holdings.length;
  } else {
    summary.holdings = 'skipped (no consent)';
  }

  if (await isConsentActive(userId, broker, 'positions')) {
    const positions = await provider.getPositions({ seedKey: String(userId) });
    const positionSymbols = [...new Set(positions.map((p) => p.symbol))];
    const positionInstruments = await prisma.instrument.findMany({
      where: { symbol: { in: positionSymbols }, exchange: 'NSE' },
    });
    const positionInstrumentMap = new Map(positionInstruments.map((i) => [i.symbol, i.id]));
    for (const p of positions) {
      await prisma.portfolioPosition.upsert({
        where: { userId_broker_symbol: { userId, broker, symbol: p.symbol } },
        create: {
          userId, broker, symbol: p.symbol, exchange: p.exchange,
          instrumentId: positionInstrumentMap.get(p.symbol) ?? null,
          quantity: p.quantity, averagePrice: p.averagePrice,
          lastPrice: p.lastPrice, dayQuantity: p.dayQuantity,
          dayAvgPrice: p.dayAvgPrice, pnl: p.pnl, product: p.product,
        },
        update: {
          quantity: p.quantity, averagePrice: p.averagePrice,
          lastPrice: p.lastPrice, dayQuantity: p.dayQuantity,
          dayAvgPrice: p.dayAvgPrice, pnl: p.pnl, product: p.product,
          syncedAt: new Date(),
        },
      });
    }
    summary.positions = positions.length;
  } else {
    summary.positions = 'skipped (no consent)';
  }

  if (await isConsentActive(userId, broker, 'funds')) {
    const funds = await provider.getFunds({ seedKey: String(userId) });
    summary.funds = funds;
  } else {
    summary.funds = 'skipped (no consent)';
  }

  if (await isConsentActive(userId, broker, 'orders')) {
    const orders = await provider.getOrders({ seedKey: String(userId) });
    let imported = 0;
    for (const o of orders) {
      const existing = await prisma.order.findUnique({
        where: { broker_brokerOrderId: { broker, brokerOrderId: o.brokerOrderId } },
      });
      if (existing) continue;
      const order = await prisma.order.create({
        data: {
          userId, broker, brokerOrderId: o.brokerOrderId, symbol: o.symbol,
          exchange: o.exchange, side: o.side, orderType: o.orderType,
          product: o.product ?? 'CNC', quantity: o.quantity, price: o.price ?? null,
          averagePrice: o.averagePrice ?? null, status: o.status,
          filledQuantity: o.filledQuantity ?? null, timestamp: o.timestamp,
        },
      });
      await prisma.orderEvent.create({
        data: { orderId: order.id, status: o.status, message: 'Imported from broker' },
      });
      await prisma.tradeJournal.upsert({
        where: { orderId: order.id },
        create: {
          userId, orderId: order.id, symbol: o.symbol, exchange: o.exchange,
          side: o.side, quantity: o.filledQuantity ?? o.quantity, price: o.averagePrice ?? o.price,
          timestamp: o.timestamp, status: o.status,
        },
        update: {},
      });
      imported += 1;
    }
    summary.ordersImported = imported;
  } else {
    summary.orders = 'skipped (no consent)';
  }

  await prisma.brokerConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date(), lastError: null },
  });

  const durationMs = Date.now() - started;
  await audit(userId, 'BROKER_SYNC', 'broker_connection', conn.id, { broker, summary, durationMs }, ip);
  logInfra('info', 'broker', `Sync ${broker} for user ${userId} done in ${durationMs}ms`);

  return { broker, status: conn.status, summary, syncedAt: new Date() };
}

export async function adminListConnections() {
  return prisma.brokerConnection.findMany({
    include: {
      user: { select: { email: true, fullName: true } },
      tokens: { select: { tokenType: true, createdAt: true, expiresAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function markConnectionStatus(id, status) {
  if (!CONNECTION_STATUSES.includes(status)) {
    throw new BadRequestError(`Invalid status: ${status}`);
  }
  const conn = await prisma.brokerConnection.findUnique({ where: { id } });
  if (!conn) throw new NotFoundError('Broker connection not found');
  return prisma.brokerConnection.update({ where: { id }, data: { status } });
}

export { CONNECTION_STATUSES, decryptString };