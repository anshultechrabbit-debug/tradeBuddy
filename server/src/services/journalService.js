import { prisma } from '../config/prisma.js';
import { getBrokerProvider } from '../providers/broker/index.js';
import { audit } from '../utils/helpers.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { isConsentActive } from './consentService.js';

/**
 * Imports broker order history (via BrokerProvider.getOrders()/getTrades())
 * into orders, order_events and trade_journal. Later real brokers plug in
 * behind the same interface — nothing else changes.
 */
export async function importFromBroker(userId, broker, { ip } = {}) {
  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId, broker } },
  });
  if (!conn || conn.status !== 'CONNECTED') {
    throw new BadRequestError('No connected broker', 'BROKER_NOT_CONNECTED');
  }
  if (!(await isConsentActive(userId, broker, 'orders'))) {
    throw new BadRequestError('Consent for "orders" scope is required to import order history', 'CONSENT_REQUIRED');
  }

  const provider = getBrokerProvider();
  const orders = await provider.getOrders({ seedKey: String(userId), limit: 30 });
  const trades = await provider.getTrades({ seedKey: String(userId), limit: 30 });

  let imported = 0;
  for (const o of orders) {
    const existing = await prisma.order.findUnique({
      where: { broker_brokerOrderId: { broker, brokerOrderId: o.brokerOrderId } },
    });
    if (existing) continue;
    const order = await prisma.order.create({
      data: {
        userId,
        broker,
        brokerOrderId: o.brokerOrderId,
        symbol: o.symbol,
        exchange: o.exchange,
        side: o.side,
        orderType: o.orderType ?? 'MARKET',
        product: o.product ?? 'CNC',
        quantity: o.quantity,
        price: o.price ?? null,
        averagePrice: o.averagePrice ?? null,
        status: o.status,
        filledQuantity: o.filledQuantity ?? null,
        timestamp: o.timestamp,
      },
    });
    await prisma.orderEvent.create({
      data: { orderId: order.id, status: o.status, message: 'Imported from broker' },
    });
    await prisma.tradeJournal.upsert({
      where: { orderId: order.id },
      create: {
        userId,
        orderId: order.id,
        symbol: o.symbol,
        exchange: o.exchange,
        side: o.side,
        quantity: o.filledQuantity ?? o.quantity,
        price: o.averagePrice ?? o.price ?? 0,
        timestamp: o.timestamp,
        status: o.status,
      },
      update: {},
    });
    imported += 1;
  }

  await audit(userId, 'JOURNAL_IMPORT', 'journal', null, { broker, orders: orders.length, trades: trades.length, imported }, ip);
  return { orders: orders.length, trades: trades.length, imported };
}

export async function listJournal(userId, { page = 1, limit = 20 } = {}) {
  const [total, rows] = await Promise.all([
    prisma.tradeJournal.count({ where: { userId } }),
    prisma.tradeJournal.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return {
    rows: rows.map((j) => ({
      id: j.id,
      symbol: j.symbol,
      exchange: j.exchange,
      side: j.side,
      quantity: j.quantity,
      price: Number(j.price),
      timestamp: j.timestamp,
      status: j.status,
      pnl: j.pnl != null ? Number(j.pnl) : null,
      notes: j.notes,
    })),
    total,
    page,
    limit,
  };
}

export async function listOrders(userId, { page = 1, limit = 20 } = {}) {
  const [total, rows] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return { rows, total, page, limit };
}

export async function updateNotes(userId, journalId, { notes }) {
  const entry = await prisma.tradeJournal.findFirst({ where: { id: journalId, userId } });
  if (!entry) throw new NotFoundError('Journal entry not found');
  return prisma.tradeJournal.update({
    where: { id: journalId },
    data: { notes: notes ?? null },
  });
}