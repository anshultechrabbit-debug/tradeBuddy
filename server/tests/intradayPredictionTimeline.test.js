import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectMaterialChanges, getIntradaySchedule, recordIntradayPrediction } from '../src/services/intradayPredictionTimeline.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '..', 'src', 'data', 'intradayPredictions.json');

const base = {
  signal: 'WATCH', expectedDirection: 'NEUTRAL', confidence: 70, price: 100,
  predictedClose: 100.2, targetZone: [98, 102],
  stopLoss: 96, majorFactors: [{ name: 'trend', score: 70 }],
};

describe('dynamic intraday prediction schedule', () => {
  it('shows the next checkpoint during an open session', () => {
    const schedule = getIntradaySchedule(new Date('2026-09-02T10:00:00+05:30'));
    expect(schedule.session).toBe('OPEN');
    expect(schedule.nextPredictionLabel).toBe('11:30 IST');
  });

  it('targets the next valid session on an NSE holiday', () => {
    const schedule = getIntradaySchedule(new Date('2026-09-14T10:00:00+05:30'));
    expect(schedule.session).toBe('HOLIDAY');
    expect(schedule.nextPredictionLabel).toBe('09:20 IST on 2026-09-15');
  });

  it('does not version insignificant noise', () => {
    expect(detectMaterialChanges(base, { ...base, price: 100.2, confidence: 74 })).toEqual([]);
  });

  it('versions signal, evidence, price, and factor changes', () => {
    const changes = detectMaterialChanges(base, {
      ...base, signal: 'BUY', expectedDirection: 'BULLISH', confidence: 82,
      price: 101, majorFactors: [{ name: 'trend', score: 85 }],
    });
    expect(changes.length).toBeGreaterThanOrEqual(4);
  });

  it('versions a material predicted-close or target-zone change', () => {
    const changes = detectMaterialChanges(base, { ...base, predictedClose: 101, targetZone: [98, 103] });
    expect(changes.some((change) => change.includes('Predicted close'))).toBe(true);
    expect(changes.some((change) => change.includes('Target zone'))).toBe(true);
  });
});

describe('recordIntradayPrediction shape', () => {
  it('includes every field the multi-timeframe display spec requires', () => {
    const originalContent = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : null;
    try {
      fs.writeFileSync(DATA_FILE, '[]');
      const result = {
        symbol: 'SPECTEST',
        price: 100,
        dataTimestamp: '2026-09-02T04:20:00.000Z',
        positiveFactors: ['Price is in an uptrend', 'Volume confirms the move'],
        entry: { stopLoss: 96 },
        engine: {
          signal: 'BUY',
          totalScore: 76,
          evidenceQualityScore: 78,
          directionalOutlook: 'BULLISH',
          closingRange: { base: 102, range: [99, 104], expectedMovePct: 2.0 },
          buy: { stopLoss: 96, riskReward: 2.4, reasonSetupCouldFail: 'Breaks if price closes below ₹96 support' },
          subScores: { momentum: 80, trend: 70, volume: 65 },
        },
      };
      const timeline = recordIntradayPrediction(result, new Date('2026-09-02T09:20:00+05:30'));
      const current = timeline.current;
      expect(current.timeframe).toBe('INTRADAY');
      expect(current.signal).toBe('BUY');
      expect(current.score).toBe(76);
      expect(current.confidence).toBe(78);
      expect(current.price).toBe(100);
      expect(current.predictedClose).toBe(102);
      expect(current.targetZone).toEqual([99, 104]);
      expect(current.expectedReturnPct).toBe(2.0);
      expect(current.riskReward).toBe(2.4);
      expect(current.generatedAt).toBeDefined();
      expect(current.lastCheckedAt).toBeDefined();
      expect(current.confirmationConditions).toEqual(['Price is in an uptrend', 'Volume confirms the move']);
      expect(current.invalidationCondition).toBe('Breaks if price closes below ₹96 support');
    } finally {
      if (originalContent != null) fs.writeFileSync(DATA_FILE, originalContent);
      else if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    }
  });
});
