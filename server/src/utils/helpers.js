import { prisma } from '../config/prisma.js';

export function round2(value) {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Math.round(Number(value) * 100) / 100;
}

export function round4(value) {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Math.round(Number(value) * 10000) / 10000;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function toNumber(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function logInfra(level, component, message, metadata = undefined) {
  const log = level === 'error' ? console.error : console.log;
  log(`[${component}] ${message}`);
  try {
    await prisma.infraLog.create({
      data: { level, component, message, metadata: metadata ?? undefined },
    });
  } catch {
    /* infra logging must never crash requests */
  }
}

export async function audit(userId, action, entityType, entityId, metadata, ip) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        action,
        entityType: entityType ?? null,
        entityId: entityId != null ? String(entityId) : null,
        metadata: metadata ?? undefined,
        ip: ip ?? null,
      },
    });
  } catch {
    /* audit logging must never crash requests */
  }
}

export function toSafeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function normalizeRoles(user) {
  if (!user) return null;
  const roles = user.roles ? user.roles.map((r) => r.role.name) : [];
  return {
    ...user,
    role: roles.includes('ADMIN') ? 'ADMIN' : 'USER',
    roles,
  };
}