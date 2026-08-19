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

export async function resolveDsr(adminId, dsrId, { status }) {
  if (!['COMPLETED', 'REJECTED'].includes(status)) {
    throw new BadRequestError('Status must be COMPLETED or REJECTED');
  }
  const existing = await prisma.dataSubjectRequest.findUnique({ where: { id: dsrId } });
  if (!existing) throw new NotFoundError('Request not found');
  const updated = await prisma.dataSubjectRequest.update({
    where: { id: dsrId },
    data: { status, resolvedAt: new Date() },
  });
  await audit(adminId, 'DSR_RESOLVE', 'data_subject_request', dsrId, { status }, null);
  return updated;
}