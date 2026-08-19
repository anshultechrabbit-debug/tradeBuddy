import { prisma } from '../config/prisma.js';
import { hashPassword } from '../utils/password.js';
import { toSafeUser, audit } from '../utils/helpers.js';
import { getBrokerProvider } from '../providers/broker/index.js';
import { getMarketDataProvider } from '../providers/marketData/index.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

const USER_STATUSES = ['ACTIVE', 'SUSPENDED'];

export async function listUsers({ page = 1, limit = 20, search } = {}) {
  const where = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {};
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return {
    rows: rows.map((u) => {
      const roles = u.roles.map((r) => r.role.name);
      return {
        ...toSafeUser(u),
        role: roles.includes('ADMIN') ? 'ADMIN' : 'USER',
        roles,
      };
    }),
    total,
    page,
    limit,
  };
}

export async function getUserAdmin(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw new NotFoundError('User not found');
  const roles = user.roles.map((r) => r.role.name);
  return { ...toSafeUser(user), role: roles.includes('ADMIN') ? 'ADMIN' : 'USER', roles };
}

export async function createUserAdmin({ email, password, fullName = '', role = 'USER', status = 'ACTIVE' }) {
  if (!USER_STATUSES.includes(status)) throw new BadRequestError('Invalid status');
  if (!['USER', 'ADMIN'].includes(role)) throw new BadRequestError('Invalid role');
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) throw new BadRequestError('Email already in use');
  const roleRow = await prisma.role.findUnique({ where: { name: role } });
  if (!roleRow) throw new BadRequestError('Role not seeded');
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName,
      status,
      roles: { create: { roleId: roleRow.id } },
    },
  });
  await prisma.watchlist.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  await prisma.userScannerPref.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
  return getUserAdmin(user.id);
}

export async function updateUserAdmin(adminId, userId, input) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  const data = {};
  if (input.fullName != null) data.fullName = input.fullName;
  if (input.phone !== undefined) data.phone = input.phone ?? null;
  if (input.status != null) {
    if (!USER_STATUSES.includes(input.status)) throw new BadRequestError('Invalid status');
    data.status = input.status;
  }
  if (input.subscriptionStatus != null) {
    data.subscriptionStatus = String(input.subscriptionStatus);
  }
  if (input.role != null) {
    if (!['USER', 'ADMIN'].includes(input.role)) throw new BadRequestError('Invalid role');
    const roleRow = await prisma.role.findUnique({ where: { name: input.role } });
    if (!roleRow) throw new BadRequestError('Role not seeded');
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.userRole.create({ data: { userId, roleId: roleRow.id } });
  }
  if (input.password) {
    data.passwordHash = await hashPassword(input.password);
    data.tokenVersion = { increment: 1 };
  }
  const updated = await prisma.user.update({ where: { id: userId }, data });
  await audit(adminId, 'ADMIN_USER_UPDATE', 'user', userId, input, null);
  return getUserAdmin(updated.id);
}

export async function deleteUserAdmin(adminId, userId) {
  if (adminId === userId) throw new BadRequestError('Admins cannot delete their own account');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User not found');
  await prisma.user.delete({ where: { id: userId } });
  await audit(adminId, 'ADMIN_USER_DELETE', 'user', userId, null, null);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scan universe admin CRUD
// ---------------------------------------------------------------------------

export async function listScanUniverse({ page = 1, limit = 50 } = {}) {
  const [total, rows] = await Promise.all([
    prisma.scanUniverse.count(),
    prisma.scanUniverse.findMany({
      include: { instrument: true },
      orderBy: [{ priority: 'asc' }, { symbol: 'asc' }],
      take: limit,
      skip: (page - 1) * limit,
    }),
  ]);
  return {
    rows: rows.map((u) => ({
      id: u.id,
      instrumentId: u.instrumentId,
      symbol: u.symbol,
      exchange: u.exchange,
      instrumentType: u.instrumentType,
      enabled: u.enabled,
      priority: u.priority,
      excluded: u.excluded,
      exclusionReason: u.exclusionReason,
      name: u.instrument.name,
      sector: u.instrument.sector,
    })),
    total,
    page,
    limit,
  };
}

export async function createScanUniverseEntry({ symbol, exchange = 'NSE', instrumentType = 'EQUITY', enabled = true, priority = 100, excluded = false, exclusionReason = null }) {
  const instrument = await prisma.instrument.findFirst({
    where: { symbol, exchange, instrumentType },
  });
  if (!instrument) {
    throw new NotFoundError(`Instrument ${symbol} (${exchange}, ${instrumentType}) not found`);
  }
  const existing = await prisma.scanUniverse.findUnique({ where: { instrumentId: instrument.id } });
  if (existing) throw new BadRequestError('Instrument is already in the scan universe');
  return prisma.scanUniverse.create({
    data: {
      instrumentId: instrument.id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      instrumentType: instrument.instrumentType,
      enabled,
      priority,
      excluded,
      exclusionReason,
    },
  });
}

export async function updateScanUniverseEntry(entryId, input) {
  const existing = await prisma.scanUniverse.findUnique({ where: { id: entryId } });
  if (!existing) throw new NotFoundError('Scan universe entry not found');
  const data = {};
  if (input.enabled != null) data.enabled = Boolean(input.enabled);
  if (input.priority != null) {
    const p = Number(input.priority);
    if (Number.isNaN(p)) throw new BadRequestError('priority must be a number');
    data.priority = p;
  }
  if (input.excluded != null) data.excluded = Boolean(input.excluded);
  if (input.exclusionReason !== undefined) data.exclusionReason = input.exclusionReason ?? null;
  if (data.excluded && !data.exclusionReason && existing.exclusionReason == null) {
    throw new BadRequestError('exclusion_reason is required when excluding an instrument');
  }
  return prisma.scanUniverse.update({ where: { id: entryId }, data });
}

export async function deleteScanUniverseEntry(entryId) {
  const existing = await prisma.scanUniverse.findUnique({ where: { id: entryId } });
  if (!existing) throw new NotFoundError('Scan universe entry not found');
  await prisma.scanUniverse.delete({ where: { id: entryId } });
  return { ok: true };
}

export async function searchInstruments({ q, limit = 20 } = {}) {
  const where = q
    ? {
        OR: [
          { symbol: { contains: q.toUpperCase(), mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      }
    : {};
  return prisma.instrument.findMany({
    where,
    orderBy: { symbol: 'asc' },
    take: limit,
  });
}

export async function syncScanUniverseExternal() {
  const provider = getMarketDataProvider();
  if (typeof provider.syncInstrumentMaster !== 'function') {
    throw new BadRequestError('Current MARKET_DATA_PROVIDER does not support external universe sync');
  }
  const result = await provider.syncInstrumentMaster();
  await audit(null, 'ADMIN_SYNC_UNIVERSE', 'scan_universe', null, result, null);
  return result;
}