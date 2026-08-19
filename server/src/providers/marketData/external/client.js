import { config } from '../../../config/env.js';

/**
 * External data client utilities: timeout, retry with backoff and a simple
 * token-bucket rate limiter. Keeps the RealDevelopmentMarketDataProvider from
 * hammering unofficial/free data sources.
 */

export function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function withRetry(fn, { retries = 2, baseDelayMs = 500, timeoutMs = 10000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Minimal token-bucket rate limiter. Ensures at most `perMinute` calls in any
 * rolling 60-second window.
 */
export class RateLimiter {
  constructor(perMinute = 60) {
    this.perMinute = Math.max(1, perMinute);
    this.calls = [];
  }

  async acquire() {
    const now = Date.now();
    this.calls = this.calls.filter((t) => now - t < 60000);
    if (this.calls.length >= this.perMinute) {
      const waitMs = 60000 - (now - this.calls[0]) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.calls = this.calls.filter((t) => now - t < 60000);
    }
    this.calls.push(Date.now());
  }

  get pending() {
    return this.calls.length;
  }
}

/**
 * Creates a configured fetcher bound to external-data settings. Returns
 * `(url, options) => Promise<Response>` with timeout, retry and rate limiting
 * applied. Use for HTTP/REST external sources.
 */
export function createExternalFetcher() {
  const limiter = new RateLimiter(config.externalMarketData.rateLimitPerMinute);
  const { retries, timeoutMs } = config.externalMarketData;

  return async function externalFetch(url, options = {}) {
    await limiter.acquire();
    return withRetry(() => fetch(url, options), { retries, timeoutMs });
  };
}