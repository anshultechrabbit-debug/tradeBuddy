import { describe, expect, it } from 'vitest';
import { applyAiDecision } from '../src/services/radarService.js';

function candidate(signal = 'WATCH') {
  return {
    symbol: 'TCS',
    signal,
    convictionScore: 68,
    reason: 'Technical screen result',
    features: { rsi14: 58 },
  };
}

function analysis(finalSignal, overallScore = 76) {
  return {
    ok: true,
    finalSignal,
    overallScore,
    oneLiner: `${finalSignal} after full validation`,
    finalValidation: { passed: true },
    engine: { directionalOutlook: 'BULLISH', tradeStatus: 'EXECUTABLE' },
  };
}

describe('Radar full-engine decision alignment', () => {
  it('promotes a technical WATCH when full analysis says BUY', () => {
    const result = applyAiDecision(candidate(), analysis('BUY', 78));
    expect(result.signal).toBe('BUY');
    expect(result.convictionScore).toBe(78);
    expect(result.features.technicalSignal).toBe('WATCH');
    expect(result.features.aiStrategy.signal).toBe('BUY');
  });

  it('normalizes STRONG BUY while preserving the full signal', () => {
    const result = applyAiDecision(candidate(), analysis('STRONG BUY', 84));
    expect(result.signal).toBe('BUY');
    expect(result.features.aiStrategy.signal).toBe('STRONG BUY');
  });

  it('downgrades a technical BUY when full analysis says WATCH', () => {
    const result = applyAiDecision(candidate('BUY'), analysis('WATCH', 64));
    expect(result.signal).toBe('WATCH');
    expect(result.features.technicalSignal).toBe('BUY');
  });

  it('downgrades an unvalidated BUY but leaves WATCH unchanged', () => {
    const invalid = { ok: true, finalValidation: { passed: false } };
    const buy = applyAiDecision(candidate('BUY'), invalid);
    const watch = applyAiDecision(candidate(), null);
    expect(buy.signal).toBe('WATCH');
    expect(buy.reason).toContain('validation unavailable');
    expect(watch.signal).toBe('WATCH');
    expect(watch.reason).toBe('Technical screen result');
  });
});
