import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluatePrediction,
  evaluatePredictions,
  calculatePredictionStats,
  calculateDailyStats,
  recordPrediction,
  freezeDailyPredictions,
  getPredictions,
} from '../src/services/predictionTracker.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_FILE = path.resolve(__dirname, '..', 'src', 'data', 'predictions.json');

describe('predictionTracker validation & evaluation system', () => {

  // Test 1: Bullish prediction and stock closes higher => CORRECT
  it('1. Bullish prediction and stock closes higher => CORRECT', () => {
    const pred = {
      symbol: 'TEST1',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      baseCase: 102,
    };
    const session = { close: 105, high: 106, low: 99 };
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(true);
    expect(res.predictionResult).toBe('CORRECT');
    expect(res.actualReturnPct).toBe(5);
  });

  // Test 2: Bullish prediction and stock closes lower => WRONG
  it('2. Bullish prediction and stock closes lower => WRONG', () => {
    const pred = {
      symbol: 'TEST2',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      baseCase: 102,
    };
    const session = { close: 95, high: 101, low: 94 };
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(false);
    expect(res.predictionResult).toBe('WRONG');
    expect(res.actualReturnPct).toBe(-5);
  });

  // Test 3: Bearish prediction and stock closes lower => CORRECT
  it('3. Bearish prediction and stock closes lower => CORRECT', () => {
    const pred = {
      symbol: 'TEST3',
      predictionPrice: 100,
      directionalOutlook: 'BEARISH',
      baseCase: 98,
    };
    const session = { close: 95, high: 101, low: 94 };
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(true);
    expect(res.predictionResult).toBe('CORRECT');
    expect(res.actualReturnPct).toBe(-5);
  });

  // Test 4: Bearish prediction and stock closes higher => WRONG
  it('4. Bearish prediction and stock closes higher => WRONG', () => {
    const pred = {
      symbol: 'TEST4',
      predictionPrice: 100,
      directionalOutlook: 'BEARISH',
      baseCase: 98,
    };
    const session = { close: 105, high: 106, low: 99 };
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(false);
    expect(res.predictionResult).toBe('WRONG');
    expect(res.actualReturnPct).toBe(5);
  });

  // Test 5: Neutral prediction with movement inside neutral band => NEUTRAL_CORRECT
  it('5. Neutral prediction with movement inside neutral band (<= 0.25%) => NEUTRAL_CORRECT', () => {
    const pred = {
      symbol: 'TEST5',
      predictionPrice: 100,
      directionalOutlook: 'NEUTRAL',
      baseCase: 100,
    };
    const session = { close: 100.20, high: 100.5, low: 99.8 }; // +0.20% move
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(true);
    expect(res.predictionResult).toBe('NEUTRAL_CORRECT');
  });

  // Test 6: Neutral prediction with large movement => NEUTRAL_WRONG
  it('6. Neutral prediction with large movement (> 0.25%) => NEUTRAL_WRONG', () => {
    const pred = {
      symbol: 'TEST6',
      predictionPrice: 100,
      directionalOutlook: 'NEUTRAL',
      baseCase: 100,
    };
    const session = { close: 102, high: 102.5, low: 99.8 }; // +2.0% move
    const res = evaluatePrediction(pred, session);

    expect(res.directionCorrect).toBe(false);
    expect(res.predictionResult).toBe('NEUTRAL_WRONG');
  });

  // Test 7: Bullish target reached intraday => target1Hit true
  it('7. Bullish target reached intraday (high >= target1) => target1Hit true', () => {
    const pred = {
      symbol: 'TEST7',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      target1: 105,
      target2: 110,
    };
    const session = { close: 103, high: 107, low: 99 }; // high 107 >= target1 105
    const res = evaluatePrediction(pred, session);

    expect(res.target1Hit).toBe(true);
    expect(res.target2Hit).toBe(false);
  });

  // Test 8: Bullish invalidation hit intraday => invalidationHit true
  it('8. Bullish invalidation hit intraday (low <= invalidationPrice) => invalidationHit true', () => {
    const pred = {
      symbol: 'TEST8',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      target1: 105,
      invalidationPrice: 96,
    };
    const session = { close: 102, high: 106, low: 95 }; // low 95 <= invalidation 96
    const res = evaluatePrediction(pred, session);

    expect(res.invalidationHit).toBe(true);
  });

  // Test 9: Missing official close => AWAITING_VERIFIED_CLOSE
  it('9. Missing official close => AWAITING_VERIFIED_CLOSE', () => {
    const pred = {
      symbol: 'TEST9',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
    };
    const session = null; // close unavailable
    const res = evaluatePrediction(pred, session);

    expect(res.predictionResult).toBe('AWAITING_VERIFIED_CLOSE');
    expect(res.validationStatus).toBe('AWAITING_VERIFIED_CLOSE');
  });

  // Test 10: Synthetic close => DATA_INVALID
  it('10. Synthetic close data => DATA_INVALID', () => {
    const pred = {
      symbol: 'TEST10',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
    };
    const session = { close: 105, source: 'synthetic-mock-data' };
    const res = evaluatePrediction(pred, session);

    expect(res.predictionResult).toBe('DATA_INVALID');
    expect(res.validationStatus).toBe('DATA_INVALID');
  });

  // Test 11: Multiple predictions for same stock => all snapshots preserved
  it('11. Multiple predictions for same stock => all snapshots preserved', () => {
    const p1 = recordPrediction({
      symbol: 'MULTIPRED',
      date: '2026-08-25',
      predictionTimestamp: '2026-08-25T09:30:00.000Z',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
    });
    const p2 = recordPrediction({
      symbol: 'MULTIPRED',
      date: '2026-08-25',
      predictionTimestamp: '2026-08-25T13:00:00.000Z',
      predictionPrice: 102,
      directionalOutlook: 'NEUTRAL',
    });

    expect(p1.id).not.toBe(p2.id);
    const all = getPredictions().filter((p) => p.symbol === 'MULTIPRED');
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  // Test 12: Daily final prediction => only final prediction used for daily accuracy
  it('12. Daily final prediction => only final prediction used for daily accuracy', () => {
    const date = '2026-08-20';
    const pEarly = {
      date,
      symbol: 'FINALTEST',
      predictionPrice: 100,
      directionalOutlook: 'BEARISH',
      isFinalForDay: false,
      predictionResult: 'WRONG',
    };
    const pFinal = {
      date,
      symbol: 'FINALTEST',
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      isFinalForDay: true,
      predictionResult: 'CORRECT',
    };

    const stats = calculateDailyStats([pEarly, pFinal], date);
    // When isFinalForDay exists, daily stats filters to only final predictions
    expect(stats.evaluatedPredictions).toBe(1);
    expect(stats.correct).toBe(1);
    expect(stats.accuracyPct).toBe(100);
  });

  // Test 13: Sample size enforcement (never claims 70% without minimum N=30)
  it('13. Sample size enforcement => returns null accuracy if sample < 30', () => {
    const smallSample = Array.from({ length: 15 }, (_, i) => ({
      symbol: `STOCK_${i}`,
      predictionPrice: 100,
      directionalOutlook: 'BULLISH',
      predictionResult: i < 10 ? 'CORRECT' : 'WRONG',
    }));

    const stats = calculatePredictionStats(smallSample, { minSample: 30 });
    expect(stats.sampleSize).toBe(15);
    expect(stats.sufficientSample).toBe(false);
    expect(stats.directionAccuracyPct).toBe(null);
    expect(stats.directionAccuracyLabel).toContain('Insufficient sample size');
  });

});
