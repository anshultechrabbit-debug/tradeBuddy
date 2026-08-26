import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/password.js';
import { logInfra } from '../utils/helpers.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { config } from '../config/env.js';
import { encryptString } from '../utils/crypto.js';
import { connect, sync } from '../services/brokerService.js';
import { grantConsent } from '../services/consentService.js';

const ADMIN_EMAIL = 'admin@tradebuddy.dev';
const DEMO_EMAIL = 'demo@tradebuddy.dev';

async function seedRolesAndUsers() {
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    create: { name: 'ADMIN' },
    update: {},
  });
  const userRole = await prisma.role.upsert({
    where: { name: 'USER' },
    create: { name: 'USER' },
    update: {},
  });

  const adminPassword = await hashPassword('admin12345');
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminPassword,
      fullName: 'TradeBuddy Admin',
      subscriptionStatus: 'pro',
      roles: { create: { roleId: adminRole.id } },
    },
    update: {},
  });
  await prisma.watchlist.upsert({ where: { userId: admin.id }, create: { userId: admin.id }, update: {} });
  await prisma.userScannerPref.upsert({ where: { userId: admin.id }, create: { userId: admin.id }, update: {} });

  const demoPassword = await hashPassword('demo12345');
  const demo = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: {
      email: DEMO_EMAIL,
      passwordHash: demoPassword,
      fullName: 'Demo User',
      roles: { create: { roleId: userRole.id } },
    },
    update: {},
  });
  await prisma.watchlist.upsert({ where: { userId: demo.id }, create: { userId: demo.id }, update: {} });
  await prisma.userScannerPref.upsert({ where: { userId: demo.id }, create: { userId: demo.id }, update: {} });

  return { admin, demo };
}

async function syncExternalMarketData() {
  const provider = getMarketDataProvider();
  if (typeof provider.syncInstrumentMaster !== 'function') {
    logInfra(
      'warn',
      'seed',
      `MARKET_DATA_PROVIDER=${config.marketDataProvider} cannot sync instruments externally; run with development/external mode`,
    );
    return null;
  }
  const result = await provider.syncInstrumentMaster();
  logInfra('info', 'seed', `External universe synced: ${result.total} equities (${result.created} created, ${result.updated} updated, ${result.niftyMembers} NIFTY 100 enabled)`);
  return result;
}

async function connectDemoBroker(demo) {
  const conn = await prisma.brokerConnection.findUnique({
    where: { userId_broker: { userId: demo.id, broker: 'mock' } },
  });
  if (!conn || conn.status !== 'CONNECTED') {
    const encrypted = encryptString(`demo-mock-token-${Date.now()}`);
    const connection = await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId: demo.id, broker: 'mock' } },
      create: {
        userId: demo.id,
        broker: 'mock',
        status: 'CONNECTED',
        displayName: 'Mock Broker (development)',
        expiryAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      update: { status: 'CONNECTED', lastError: null },
    });
    await prisma.brokerToken.create({
      data: {
        connectionId: connection.id,
        userId: demo.id,
        tokenType: 'access',
        encryptedToken: encrypted.encryptedToken,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
    });
  }
  await grantConsent(demo.id, {
    broker: 'mock',
    scopes: ['holdings', 'positions', 'orders', 'funds'],
    purpose: 'Seeded development demo',
  });
  try {
    await sync(demo.id, 'mock');
  } catch (err) {
    logInfra('warn', 'seed', `Demo sync skipped: ${err.message}`);
  }
  return true;
}

export async function seed() {
  logInfra('info', 'seed', 'Starting seed...');
  const { admin, demo } = await seedRolesAndUsers();
  const marketData = await syncExternalMarketData();

  await connectDemoBroker(demo);

  logInfra('info', 'seed', 'Seed complete');
  return {
    roles: ['ADMIN', 'USER'],
    users: { admin: admin.email, demo: demo.email },
    marketData,
  };
}

const isCli =
  process.argv[1] &&
  import.meta.url ===
    `file:///${process.argv[1].replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1:')}`;

if (isCli) {
  seed()
    .then((result) => {
      console.log('Seed complete:', JSON.stringify(result, null, 2));
      return prisma.$disconnect();
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      return prisma.$disconnect().finally(() => process.exit(1));
    });
}
