import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../../config/env.js';
import { RateLimiter } from './client.js';
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

// Circuit breaker: once an external data source fails a few times in a row,
// stop shelling out to Python for that source for a cooldown window. This
// avoids hanging on timeouts and spamming error logs every poll.
//
// Per-source, not global: nselib is currently broken outright (NSE changed
// its response schema and the nselib package hasn't caught up — a real bug
// in that package, not something transient) and fails on essentially every
// call. With one shared breaker, nselib's constant failures kept tripping
// the circuit for jugaad and nse-archives too, even though those work fine
// — one broken source was taking two working ones down with it every few
// minutes. Each source now trips (and recovers) independently.
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000;
const _circuits = new Map(); // source → { fails, openUntil }

function circuitFor(source) {
  let c = _circuits.get(source);
  if (!c) {
    c = { fails: 0, openUntil: 0 };
    _circuits.set(source, c);
  }
  return c;
}
function circuitOpen(source) {
  return Date.now() < circuitFor(source).openUntil;
}
function circuitNoteFailure(source) {
  const c = circuitFor(source);
  c.fails += 1;
  if (c.fails >= CIRCUIT_THRESHOLD && c.openUntil === 0) {
    c.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    logInfra(
      'info',
      'market-data-external',
      `${source} circuit opened after ${c.fails} consecutive failures; using fallback for ${CIRCUIT_COOLDOWN_MS / 60000}min`,
    );
  }
}
function circuitNoteSuccess(source) {
  const c = circuitFor(source);
  c.fails = 0;
  c.openUntil = 0;
}

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

// Rate limiters must be shared/persistent across calls to actually throttle
// anything — a limiter created fresh per call always starts with an empty
// bucket, so `.acquire()` resolves instantly and the "limit" is a no-op.
// One limiter per source (nselib/jugaad/nse_archives) so they don't throttle
// each other.
const _limiters = new Map();
function getLimiter(source, perMinute) {
  let limiter = _limiters.get(source);
  if (!limiter) {
    limiter = new RateLimiter(perMinute);
    _limiters.set(source, limiter);
  }
  return limiter;
}

// Concurrency cap on simultaneous `python market_data.py` spawns. Each call
// starts a fresh interpreter + NSE session, so firing a burst of them at once
// (e.g. scoring 10-60 symbols in parallel) makes every single one slow enough
// to blow past the per-call timeout even though each is fine in isolation.
// This queues calls past the cap instead of letting them all contend at once.
const MAX_CONCURRENT_PYTHON = Math.max(1, config.externalMarketData.maxConcurrency);
let _activeSlots = 0;
const _slotQueue = [];
function acquireSlot() {
  if (_activeSlots < MAX_CONCURRENT_PYTHON) {
    _activeSlots += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => _slotQueue.push(resolve));
}
function releaseSlot() {
  const next = _slotQueue.shift();
  if (next) {
    next();
  } else {
    _activeSlots = Math.max(0, _activeSlots - 1);
  }
}

// Runs the actual `python market_data.py ...` process. `execFile`'s own
// `timeout` option bounds this to the real process runtime — it only starts
// once the process is spawned, so time spent waiting for a concurrency slot
// (below) never eats into it.
function spawnPython(args, timeoutMs) {
  return new Promise((res, rej) => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseSlot();
    };
    const child = execFile(
      pythonBin(),
      [SCRIPT, ...args],
      {
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
      },
      (err, stdout, stderr) => {
        release();
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
    child.on('error', release);
  });
}

// Queueing for rate-limit/concurrency slots is unbounded on purpose — it's
// just waiting its turn behind other local calls, not a network stall, so it
// must not burn the same timeout budget used to detect a genuinely hung
// process (spawnPython's execFile `timeout` already bounds that separately).
async function runPython(args, { timeoutMs, retries = 0, rateLimitPerMinute } = {}) {
  const effectiveTimeout = timeoutMs ?? config.externalMarketData.timeoutMs;
  const limiter = getLimiter(args[0], rateLimitPerMinute ?? config.externalMarketData.rateLimitPerMinute);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await limiter.acquire();
    await acquireSlot();
    try {
      return await spawnPython(args, effectiveTimeout);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw lastError;
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
    // Circuit open → fail fast without shelling out (no hang, no log spam).
    if (circuitOpen(this.source)) {
      throw new Error(`external circuit open (cooldown) — using fallback [${this.source}]`);
    }
    const argv = [this.source, command];
    for (const [k, v] of Object.entries(args)) {
      if (v == null) continue;
      argv.push(`--${k}`, String(v));
    }
    const timeoutMs = opts.timeoutMs ?? (command === 'live_quotes'
      ? config.externalMarketData.liveBatchTimeoutMs
      : config.externalMarketData.timeoutMs);
    try {
      const payload = await runPython(argv, { ...config.externalMarketData, timeoutMs, retries: 0 });
      if (!payload.ok) throw new Error(payload.error || 'unknown python error');
      circuitNoteSuccess(this.source);
      this._recordSuccess();
      return payload.data;
    } catch (err) {
      circuitNoteFailure(this.source);
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