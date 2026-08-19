import { verifyToken } from '../utils/jwt.js';
import { prisma } from '../config/prisma.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/**
 * Validates the JWT and checks that the token version still matches (logout
 * and password changes bump tokenVersion, invalidating old tokens).
 */
export async function authenticate(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedError();
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new UnauthorizedError();
    if (user.tokenVersion !== payload.version) throw new UnauthorizedError('Token has been invalidated');
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Account is suspended', 'ACCOUNT_SUSPENDED');
    }
    const roles = user.roles.map((r) => r.role.name);
    req.user = {
      id: user.id,
      email: user.email,
      role: roles.includes('ADMIN') ? 'ADMIN' : 'USER',
      roles,
    };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return next(err);
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Admin access required'));
    }
    return next();
  };
}