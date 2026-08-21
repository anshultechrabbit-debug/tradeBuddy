import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../../config/env.js';
import { RateLimiter, withRetry } from './client.js';
import { logInfra } from '../../../utils/helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * PythonBridge — spawns the market-data Python CLI and parses its JSON output.
 *
 * All three external development sources (nselib, jugaad-data,
 * indian-market-data) are Python-only, so Node adapters shell out to
 * `server/python/market_data.py`. Each call is protected by timeout, retry
 * with backoff and a token-bucket rate limiter so NSE is not hammered.
 */

const SCRIPT = path.resolve(__dirname, '../../../../python/market_data.py');

let _pythonBin = null;

export function pythonBin() {
  if (_pythonBin) return _pythonBin;
  const candidates = [
    process.env.PYTHON_BIN,
    'python3.12',
    'python',
  ].filter(Boolean);
  _pythonBin = candidates[0];
  return _pythonBin;
}

function runPython(args, { timeoutMs, retries, rateLimitPerMinute } = {}) {
  return new Promise((resolve, reject) => {
    const limiter = new RateLimiter(rateLimitPerMinute ?? config.externalMarketData.rateLimitPerMinute);
    const doRun = () =>
      new Promise((res, rej) => {
        limiter.acquire().then(() => {
          execFile(
            pythonBin(),
            [SCRIPT, ...args],
            {
              timeout: timeoutMs ?? config.externalMarketData.timeoutMs,
              maxBuffer: 64 * 1024 * 1024,
              windowsHide: true,
              encoding: 'utf8',
            },
            (err, stdout, stderr) => {
              if (err) {
                const detail = (stderr || '').trim().split('\n').slice(-4).join(' | ');
                rej(new Error(`python ${args.join(' ')}: ${err.message}${detail ? ` (${detail})` : ''}`));
                return;
              }
              try {
                res(JSON.parse(stdout));
              } catch (parseErr) {
                rej(new Error(`python output parse failed: ${parseErr.message}`));
              }
            },
          );
        });
      });
    withRetry(doRun, { retries, timeoutMs }).then(resolve, reject);
  });
}

export class PythonClient {
  constructor(source, name) {
    this.source = source;
    this.name = name;
    this.stats = { lastSuccess: null, lastError: null, errors: 0, successes: 0 };
  }

  _recordError(err, op) {
    this.stats.errors += 1;
    this.stats.lastError = { at: new Date(), op, message: err.message };
  }

  _recordSuccess() {
    this.stats.successes += 1;
    this.stats.lastSuccess = new Date();
  }

  async call(command, args = {}, opts = {}) {
    const argv = [this.source, command];
    for (const [k, v] of Object.entries(args)) {
      if (v == null) continue;
      argv.push(`--${k}`, String(v));
    }
    // Batch live_quotes calls benefit from a longer timeout because they fan out
    // in parallel Python threads — cap at liveBatchTimeoutMs instead of timeoutMs.
    const isBatch = command === 'live_quotes';
    try {
      const timeoutMs = isBatch
        ? (opts.timeoutMs ?? config.externalMarketData.liveBatchTimeoutMs)
        : (opts.timeoutMs ?? config.externalMarketData.timeoutMs);
      const payload = await runPython(argv, { ...config.externalMarketData, timeoutMs });
      if (!payload.ok) throw new Error(payload.error || 'unknown python error');
      this._recordSuccess();
      return payload.data;
    } catch (err) {
      this._recordError(err, command);
      logInfra('info', 'market-data-external', `${this.name}.${command}: ${err.message}`);
      throw err;
    }
  }

  async health() {
    try {
      const data = await runPython([this.source, 'health'], { retries: 0 });
      return {
        name: this.name,
        available: data?.data?.available ?? false,
        modules: data?.data?.modules ?? {},
        lastSuccess: this.stats.lastSuccess,
        lastError: this.stats.lastError,
        errors: this.stats.errors,
        successes: this.stats.successes,
      };
    } catch (err) {
      return {
        name: this.name,
        available: false,
        lastSuccess: this.stats.lastSuccess,
        lastError: { at: new Date(), op: 'health', message: err.message },
        errors: this.stats.errors,
        successes: this.stats.successes,
      };
    }
  }
}