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
    // A single call takes ~1.5-3s in isolation but the CLI spawns a fresh
    // Python process + NSE session per call, so it needs headroom once a few
    // calls are queued behind the concurrency cap below.
    timeoutMs: Number(process.env.MARKET_DATA_TIMEOUT_MS || 8000),
    // yfinance fundamentals takes ~15-20s (full financial statements)
    yfFundamentalsTimeoutMs: Number(process.env.MARKET_DATA_YF_FUNDAMENTALS_TIMEOUT_MS || 35000),
    // Dedicated timeout for batch live_quotes calls (many symbols, parallel
    // Python fetch). Measured directly: the ~60-symbol universe batch takes
    // ~14.5s with ZERO other load — 15000 gave it essentially no margin, so
    // it failed outright under any real contention (which then trips the
    // circuit breaker and blocks every OTHER quote/candle/fundamentals call
    // for 5 minutes too, since the breaker is global). This is almost
    // certainly the single biggest cause of app-wide slowness/fallback data.
    liveBatchTimeoutMs: Number(process.env.MARKET_DATA_LIVE_BATCH_TIMEOUT_MS || 30000),
    retries: Number(process.env.MARKET_DATA_RETRIES || 0),
    rateLimitPerMinute: Number(process.env.MARKET_DATA_RATE_LIMIT_PER_MINUTE || 30),
    // Max Python CLI processes spawned at once. Each call shells out to a new
    // python process + NSE session; firing many concurrently (e.g. scoring 10-60
    // symbols in parallel) makes every one of them slow enough to blow past
    // timeoutMs even though each is individually fine — this caps the burst so
    // calls queue briefly instead of all contending for CPU/network at once.
    // Tried bumping this to 6 to speed up batch endpoints, but the real
    // constraint turned out to be NSE's OWN rate-limiting, not local CPU —
    // more simultaneous NSE sessions triggered empty/malformed responses
    // (classic anti-scraping behavior) across every source at once, which
    // went away the moment concurrency dropped back down. Local capacity
    // isn't the bottleneck here; staying gentle with the upstream is.
    maxConcurrency: Number(process.env.MARKET_DATA_MAX_CONCURRENCY || 4),
    cacheTtlMs: Number(process.env.MARKET_DATA_CACHE_TTL_MS || 60 * 60 * 1000),
    staleAfterMs: Number(process.env.MARKET_DATA_STALE_AFTER_MS || 72 * 60 * 60 * 1000),
    liveTtlMs: Number(process.env.MARKET_DATA_LIVE_TTL_MS || 2 * 1000),
    // How often the background live-quote poller refreshes all Nifty symbols (ms).
    livePollerIntervalMs: Number(process.env.MARKET_DATA_LIVE_POLLER_INTERVAL_MS || 15000),
    pythonBin: process.env.PYTHON_BIN || 'python3.12',
  },
  llm: {
    provider: process.env.AI_PROVIDER || process.env.LLM_PROVIDER || 'groq',
    apiKey: process.env.AI_API_KEY || process.env.LLM_API_KEY || '',
    model: process.env.AI_MODEL || process.env.LLM_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.AI_BASE_URL || (
      (process.env.AI_PROVIDER || process.env.LLM_PROVIDER || 'groq') === 'openai'
        ? 'https://api.openai.com/v1'
        : 'https://api.groq.com/openai/v1'
    ),
  },
  radar: {
    // Full-universe (thousands of symbols) background rescans are expensive
    // against a rate-sensitive external source — 15s was too aggressive for
    // that scope; the frontend also gets live pushes via SSE in between ticks.
    liveIntervalMs: Number(process.env.RADAR_LIVE_INTERVAL_MS || 30000),
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