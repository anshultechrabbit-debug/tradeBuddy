import { prisma } from '../config/prisma.js';
import { BadRequestError } from '../utils/errors.js';

const RISK_PROFILES = ['conservative', 'moderate', 'aggressive'];
const VISIBILITY = ['default', 'high_priority', 'all'];
const CHANNELS = ['in_app', 'push', 'email'];
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeChannels(channels) {
  return Array.isArray(channels) ? channels.map((c) => String(c).trim().toLowerCase()) : channels;
}

function validatePrefs(input) {
  if (input.riskProfile != null && !RISK_PROFILES.includes(input.riskProfile)) {
    throw new BadRequestError(`risk_profile must be one of: ${RISK_PROFILES.join(', ')}`);
  }
  if (input.universeVisibility != null && !VISIBILITY.includes(input.universeVisibility)) {
    throw new BadRequestError(`universe_visibility must be one of: ${VISIBILITY.join(', ')}`);
  }
  if (input.notificationChannels != null) {
    const channels = normalizeChannels(input.notificationChannels);
    if (!Array.isArray(channels) || !channels.length) {
      throw new BadRequestError('notification_channels must be a non-empty array');
    }
    for (const c of channels) {
      if (!CHANNELS.includes(c)) throw new BadRequestError(`Invalid channel: ${c}`);
    }
  }
  if (input.quietHoursEnabled != null && typeof input.quietHoursEnabled !== 'boolean') {
    throw new BadRequestError('quiet_hours_enabled must be a boolean');
  }
  for (const key of ['quietHoursStart', 'quietHoursEnd']) {
    if (input[key] != null && !TIME_RE.test(input[key])) {
      throw new BadRequestError(`${key} must be in HH:MM format`);
    }
  }
}

export async function getPrefs(userId) {
  return prisma.userScannerPref.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function updatePrefs(userId, input) {
  const normalized = { ...input };
  if (input.notificationChannels != null) {
    normalized.notificationChannels = normalizeChannels(input.notificationChannels);
  }
  validatePrefs(normalized);
  return prisma.userScannerPref.upsert({
    where: { userId },
    create: { userId, ...normalized },
    update: normalized,
  });
}