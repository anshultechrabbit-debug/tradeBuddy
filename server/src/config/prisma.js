import { PrismaClient } from '@prisma/client';
import { IS_TEST } from './env.js';

export const prisma = new PrismaClient({
  log: IS_TEST ? [] : ['warn', 'error'],
});

export async function ping() {
  await prisma.$queryRaw`SELECT 1`;
  return true;
}

export async function disconnect() {
  await prisma.$disconnect();
}

export async function withTransaction(fn) {
  return prisma.$transaction(fn);
}