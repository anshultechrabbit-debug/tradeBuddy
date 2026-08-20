import { prisma } from '../config/prisma.js';
import { audit } from '../utils/helpers.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export const CONSENT_SCOPES = ['holdings', 'positions', 'orders', 'funds'];
const CONSENT_VERSION = 'v1';

export function assertValidScopes(scopes) {
  const unique = [...new Set(scopes)];
  const invalid = unique.filter((s) => !CONSENT_SCOPES.includes(s));
  if (invalid.length) {
    throw new BadRequestError(`Invalid consent scopes: ${invalid.join(', ')}`);
  }
  return unique;
}

export async function grantConsent(userId, { broker, scopes, purpose }, { ip } = {}) {
  assertValidScopes(scopes);
  const normalizedPurpose = purpose?.trim() || 'Broker data synchronisation';
  const results = [];
  for (const scope of scopes) {
    const row = await prisma.consentLedger.upsert({
      where: { userId_broker_scope: { userId, broker, scope } },
      create: {
        userId, broker, scope, purpose: normalizedPurpose,
        consentVersion: CONSENT_VERSION, status: 'ACTIVE',
      },
      update: {
        purpose: normalizedPurpose,
        consentVersion: CONSENT_VERSION,
        status: 'ACTIVE',
        revokedAt: null,
      },
    });
    results.push(row);
  }
  await audit(userId, 'CONSENT_GRANT', 'consent', null, { broker, scopes }, ip);
  return results.map((r) => ({
    broker: r.broker, scope: r.scope, status: r.status,
    consentVersion: r.consentVersion, createdAt: r.createdAt,
  }));
}

/**
 * One-click revoke: mark consent revoked, disable broker sync, remove stored
 * credentials for the affected connection, and write an audit event.
 */
export async function revokeConsent(userId, { broker, scopes }, { ip } = {}) {
  assertValidScopes(scopes);
  const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker } } });

  for (const scope of scopes) {
    await prisma.consentLedger.updateMany({
      where: { userId, broker, scope, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  const remaining = await prisma.consentLedger.count({
    where: { userId, broker, status: 'ACTIVE' },
  });

  if (conn) {
    if (remaining === 0) {
      // All consents gone → disable synchronization and drop credentials.
      await prisma.$transaction([
        prisma.brokerToken.deleteMany({ where: { connectionId: conn.id } }),
        prisma.brokerConnection.update({
          where: { id: conn.id },
          data: { status: 'REVOKED', lastSyncAt: null },
        }),
      ]);
    } else if (scopes.includes('holdings') || scopes.includes('positions')) {
      await prisma.brokerConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: null },
      });
    }
  }

  await audit(userId, 'CONSENT_REVOKE', 'consent', null, { broker, scopes }, ip);
  return { revoked: scopes, broker, disabledSync: remaining === 0 };
}

export async function isConsentActive(userId, broker, scope) {
  const row = await prisma.consentLedger.findUnique({
    where: { userId_broker_scope: { userId, broker, scope } },
  });
  return row?.status === 'ACTIVE';
}

export async function listConsents(userId) {
  return prisma.consentLedger.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listAllConsents() {
  return prisma.consentLedger.findMany({
    include: { user: { select: { email: true, fullName: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

// ---------------------------------------------------------------------------
// Data subject requests (access/erasure/portability/rectification)
// ---------------------------------------------------------------------------

export const DSR_TYPES = ['ACCESS', 'ERASURE', 'PORTABILITY', 'RECTIFICATION'];

/** Collects every piece of personal data held for a user (ACCESS/PORTABILITY). */
async function buildUserExport(userId) {
  const [
    user,
    watchlist,
    consents,
    holdings,
    positions,
    snapshots,
    alerts,
    alertEvents,
    notifications,
    orders,
    journal,
    prefs,
    connections,
    signals,
    opportunities,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, phone: true, status: true, subscriptionStatus: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.watchlist.findUnique({ where: { userId }, include: { items: true } }),
    prisma.consentLedger.findMany({ where: { userId } }),
    prisma.portfolioHolding.findMany({ where: { userId } }),
    prisma.portfolioPosition.findMany({ where: { userId } }),
    prisma.portfolioSnapshot.findMany({ where: { userId } }),
    prisma.alert.findMany({ where: { userId } }),
    prisma.alertEvent.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId } }),
    prisma.order.findMany({ where: { userId } }),
    prisma.tradeJournal.findMany({ where: { userId } }),
    prisma.userScannerPref.findUnique({ where: { userId } }),
    prisma.brokerConnection.findMany({ where: { userId }, include: { tokens: { select: { tokenType: true, createdAt: true, expiresAt: true } } } }),
    prisma.scanSignal.findMany({ where: { userId } }),
    prisma.radarOpportunity.findMany({ where: { userId } }),
  ]);
  return {
    generatedAt: new Date().toISOString(),
    subject: { id: user?.id, email: user?.email, fullName: user?.fullName, createdAt: user?.createdAt },
    data: {
      profile: user,
      watchlist,
      consents,
      portfolio: { holdings, positions, snapshots },
      alerts: { alerts, alertEvents },
      notifications,
      orders,
      tradeJournal: journal,
      scannerPreferences: prefs,
      brokerConnections: connections,
      radar: { scanSignals: signals, opportunities },
    },
  };
}

/** Erases all personal data for a user while preserving the DSR proof record. */
async function eraseUserData(userId) {
  await prisma.$transaction([
    prisma.tradeJournal.deleteMany({ where: { userId } }),
    prisma.order.deleteMany({ where: { userId } }),
    prisma.watchlist.deleteMany({ where: { userId } }),
    prisma.portfolioHolding.deleteMany({ where: { userId } }),
    prisma.portfolioPosition.deleteMany({ where: { userId } }),
    prisma.portfolioSnapshot.deleteMany({ where: { userId } }),
    prisma.alertEvent.deleteMany({ where: { userId } }),
    prisma.alert.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.consentLedger.deleteMany({ where: { userId } }),
    prisma.brokerConnection.deleteMany({ where: { userId } }),
    prisma.scanSignal.deleteMany({ where: { userId } }),
    prisma.radarOpportunity.deleteMany({ where: { userId } }),
    prisma.userRole.deleteMany({ where: { userId } }),
    prisma.userScannerPref.deleteMany({ where: { userId } }),
    prisma.dataSubjectRequest.deleteMany({ where: { userId, type: { not: 'ERASURE' } } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        email: `erased-${userId}@invalid.tradebuddy.local`,
        fullName: 'Erased User',
        phone: null,
        passwordHash: '!erased!',
        status: 'ERASED',
        tokenVersion: { increment: 1 },
      },
    }),
  ]);
}

async function markDsrFulfilled(dsrId, { payload, notes }) {
  await prisma.$executeRaw`
    UPDATE "data_subject_requests"
    SET "response_payload" = ${payload ? JSON.stringify(payload) : null}::jsonb,
        "resolution_notes" = ${notes},
        "status" = 'COMPLETED',
        "resolved_at" = ${new Date()}
    WHERE "id" = ${dsrId}
  `;
}

export async function createDsr(userId, { type, notes }, { ip } = {}) {
  if (!DSR_TYPES.includes(type)) throw new BadRequestError(`Invalid request type: ${type}`);
  const dsr = await prisma.dataSubjectRequest.create({
    data: { userId, type, notes: notes ?? null },
  });
  await audit(userId, 'DSR_CREATE', 'data_subject_request', dsr.id, { type }, ip);
  return dsr;
}

export async function listDsrs({ userId, admin = false } = {}) {
  return prisma.dataSubjectRequest.findMany({
    where: userId != null && !admin ? { userId } : {},
    include: admin ? { user: { select: { email: true, fullName: true } } } : undefined,
    orderBy: { submittedAt: 'desc' },
  });
}

/** Reads the stored export payload for a fulfilled ACCESS/PORTABILITY request. */
export async function getDsrExport(dsrId) {
  const rows = await prisma.$queryRaw`
    SELECT "response_payload" FROM "data_subject_requests" WHERE "id" = ${dsrId}
  `;
  return rows?.[0]?.response_payload ?? null;
}

export async function resolveDsr(adminId, dsrId, { status }) {
  if (!['COMPLETED', 'REJECTED'].includes(status)) {
    throw new BadRequestError('Status must be COMPLETED or REJECTED');
  }
  const existing = await prisma.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  if (!existing) throw new NotFoundError('Request not found');
  if (existing.status !== 'PENDING') {
    throw new BadRequestError('Request has already been resolved');
  }

  if (status === 'COMPLETED') {
    if (existing.type === 'ACCESS' || existing.type === 'PORTABILITY') {
      const payload = await buildUserExport(existing.userId);
      await markDsrFulfilled(dsrId, {
        payload,
        notes: `${existing.type} fulfilled — structured export of all personal data.`,
      });
    } else if (existing.type === 'ERASURE') {
      await eraseUserData(existing.userId);
      await markDsrFulfilled(dsrId, { payload: null, notes: 'All personal data erased; account anonymised.' });
    } else {
      await markDsrFulfilled(dsrId, { payload: null, notes: 'RECTIFICATION acknowledged — corrected data not supplied.' });
    }
  } else {
    await prisma.$executeRaw`
      UPDATE "data_subject_requests"
      SET "status" = 'REJECTED', "resolved_at" = ${new Date()}
      WHERE "id" = ${dsrId}
    `;
  }

  const updated = await prisma.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  await audit(adminId, 'DSR_RESOLVE', 'data_subject_request', dsrId, { status }, null);
  return updated;
}