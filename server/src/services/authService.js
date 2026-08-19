import { prisma } from '../config/prisma.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signToken } from '../utils/jwt.js';
import { toSafeUser, normalizeRoles, audit } from '../utils/helpers.js';
import { BadRequestError, UnauthorizedError, ForbiddenError, ConflictError } from '../utils/errors.js';

async function userWithRoles(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  return user ? normalizeRoles(user) : null;
}

async function ensureDefaults(userId) {
  await prisma.watchlist.upsert({
    where: { userId },
    create: { userId, name: 'My Watchlist' },
    update: {},
  });
  await prisma.userScannerPref.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function register({ email, password, fullName = '', phone = null, ip }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }
  const passwordHash = await hashPassword(password);
  const userRole = await prisma.role.findUnique({ where: { name: 'USER' } });
  if (!userRole) throw new Error('USER role is not seeded');

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      fullName,
      phone,
      roles: { create: { roleId: userRole.id } },
    },
  });
  await ensureDefaults(user.id);
  await audit(user.id, 'USER_REGISTER', 'user', user.id, { email: normalizedEmail }, ip);

  const rich = await userWithRoles(user.id);
  return { user: toSafeUser(rich), token: signToken(rich) };
}

export async function login({ email, password, ip }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { roles: { include: { role: true } } },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new UnauthorizedError('Invalid email or password');
  }
  if (user.status === 'SUSPENDED') {
    throw new ForbiddenError('Account is suspended', 'ACCOUNT_SUSPENDED');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit(user.id, 'USER_LOGIN', 'user', user.id, null, ip);

  const rich = normalizeRoles(user);
  return { user: toSafeUser(rich), token: signToken(rich) };
}

export async function logout(userId, ip) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
  await audit(userId, 'USER_LOGOUT', 'user', userId, null, ip);
  return { ok: true, tokenVersion: user.tokenVersion };
}

export async function getMe(userId) {
  const user = await userWithRoles(userId);
  if (!user) throw new UnauthorizedError();
  return toSafeUser(user);
}

export async function getUserById(id) {
  return userWithRoles(id);
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedError();
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new BadRequestError('Current password is incorrect');
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, tokenVersion: { increment: 1 } } });
  await audit(userId, 'USER_CHANGE_PASSWORD', 'user', userId, null, null);
  return { ok: true };
}

export { userWithRoles };