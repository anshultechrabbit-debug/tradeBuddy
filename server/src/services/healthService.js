import { prisma } from '../config/prisma.js';
import { ping } from '../config/prisma.js';
import { config } from '../config/env.js';
import { getBrokerProvider } from '../providers/broker/index.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { getNotificationProvider } from '../providers/notification/index.js';

const STARTED_AT = Date.now();

export function getUptime() {
  return Math.floor((Date.now() - STARTED_AT) / 1000);
}

export async function getSystemHealth() {
  let dbOk = false;
  let dbError = null;
  try {
    dbOk = await ping();
  } catch (err) {
    dbError = err.message;
  }

  const marketProvider = getMarketDataProvider();
  const brokerProvider = getBrokerProvider();
  const notificationProvider = getNotificationProvider();

  const [recentAudits, recentErrors, errorCounts, userCount, connectionCount] = await Promise.all([
    prisma.marketDataAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.infraLog.findMany({
      where: { level: 'error' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.infraLog.groupBy({
      by: ['component'],
      where: { level: 'error' },
      _count: { _all: true },
    }),
    prisma.user.count(),
    prisma.brokerConnection.count(),
  ]);

  return {
    application: {
      status: 'UP',
      environment: config.appEnv,
      uptimeSeconds: getUptime(),
      startedAt: new Date(STARTED_AT),
      version: '0.1.0',
    },
    database: {
      status: dbOk ? 'UP' : 'DOWN',
      error: dbError,
    },
    marketData: {
      provider: marketProvider.name,
      dataSource: marketProvider.dataSource,
      environment: marketProvider.environment,
      status: 'UP',
      mode: config.marketDataMode,
      external: typeof marketProvider.health === 'function' ? await marketProvider.health() : null,
      recentAudits: recentAudits.map((a) => ({
        id: a.id,
        operation: a.operation,
        status: a.status,
        instrumentCount: a.instrumentCount,
        message: a.message,
        createdAt: a.createdAt,
      })),
    },
    brokerProvider: {
      provider: brokerProvider.name,
      environment: brokerProvider.environment,
      status: 'UP',
      connections: connectionCount,
    },
    notificationProvider: {
      provider: notificationProvider.name,
      environment: notificationProvider.environment,
    },
    errors: {
      recent: recentErrors.map((e) => ({
        id: e.id,
        level: e.level,
        component: e.component,
        message: e.message,
        createdAt: e.createdAt,
      })),
      counts: errorCounts.map((g) => ({ component: g.component, count: g._count._all })),
    },
    statistics: { users: userCount, brokerConnections: connectionCount },
  };
}