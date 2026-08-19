import crypto from 'node:crypto';
import { config } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';

function normalizeKey(raw) {
  if (typeof raw === 'string' && raw.length === 64 && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  if (typeof raw === 'string' && raw.length === 44) {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 32) return buf;
  }
  return crypto.createHash('sha256').update(String(raw)).digest();
}

const KEY = normalizeKey(config.encryptionKey);

export function encryptString(plaintext) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    encryptedToken: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptString({ encryptedToken, iv, authTag }) {
  if (!encryptedToken || !iv || !authTag) return null;
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    KEY,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedToken, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}