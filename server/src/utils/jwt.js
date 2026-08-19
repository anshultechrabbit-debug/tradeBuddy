import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
      role: user.role,
      version: user.tokenVersion ?? user.token_version ?? 0,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}