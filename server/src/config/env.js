import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config();

export const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

function required(name, { testFallback } = {}) {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (IS_TEST && testFallback) return testFallback;
  throw new Error(`Missing required environment variable: ${name}`);
}

const dbUrl =
  process.env.DATABASE_URL ||
  (IS_TEST ? 'postgresql://postgres:TechRabbit@localhost:5432/tradingtest' : null);

if (!dbUrl) {
  throw new Error('Missing required environment variable: DATABASE_URL');
}

export const config = Object.freeze({
  appEnv: process.env.APP_ENV || 'development',
  isProduction: process.env.APP_ENV === 'production',
  isTest: IS_TEST,
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  databaseUrl: dbUrl,
  brokerProvider: process.env.BROKER_PROVIDER || 'mock',
  marketDataProvider: process.env.MARKET_DATA_PROVIDER || 'development',
  marketDataMode: process.env.MARKET_DATA_MODE || 'external',
  maxScanSymbols: Number(process.env.MAX_SCAN_SYMBOLS || 5000),
  notificationProvider: process.env.NOTIFICATION_PROVIDER || 'development',
  encryptionKey: required('ENCRYPTION_KEY', { testFallback: 'a'.repeat(64) }),
  jwtSecret: required('JWT_SECRET', { testFallback: 'test-jwt-secret' }),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  zerodha: {
    apiKey: process.env.ZERODHA_API_KEY || '',
    apiSecret: process.env.ZERODHA_API_SECRET || '',
    redirectUri: process.env.ZERODHA_REDIRECT_URI || '',
  },
  upstox: {
    clientId: process.env.UPSTOX_CLIENT_ID || '',
    clientSecret: process.env.UPSTOX_CLIENT_SECRET || '',
    redirectUri: process.env.UPSTOX_REDIRECT_URI || '',
  },
  marketDataLicenseKey: process.env.MARKET_DATA_LICENSE_KEY || '',
  externalMarketData: {
    baseUrl: process.env.MARKET_DATA_EXTERNAL_BASE_URL || '',
    timeoutMs: Number(process.env.MARKET_DATA_TIMEOUT_MS || 30000),
    retries: Number(process.env.MARKET_DATA_RETRIES || 1),
    rateLimitPerMinute: Number(process.env.MARKET_DATA_RATE_LIMIT_PER_MINUTE || 30),
    cacheTtlMs: Number(process.env.MARKET_DATA_CACHE_TTL_MS || 60 * 60 * 1000),
    staleAfterMs: Number(process.env.MARKET_DATA_STALE_AFTER_MS || 72 * 60 * 60 * 1000),
    liveTtlMs: Number(process.env.MARKET_DATA_LIVE_TTL_MS || 2 * 1000),
    pythonBin: process.env.PYTHON_BIN || 'python3.12',
  },
  llm: {
    provider: process.env.LLM_PROVIDER || '',
    apiKey: process.env.LLM_API_KEY || '',
  },
  radar: {
    liveIntervalMs: Number(process.env.RADAR_LIVE_INTERVAL_MS || 15000),
  },
  email: {
    provider: process.env.EMAIL_PROVIDER || '',
    apiKey: process.env.EMAIL_API_KEY || '',
    from: process.env.EMAIL_FROM || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  },
});