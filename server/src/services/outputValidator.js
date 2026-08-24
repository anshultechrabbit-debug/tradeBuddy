/**
 * outputValidator — the mandatory final consistency gate for stock analysis output.
 *
 * Runs after `computeAnalysis()` builds a result (including `result.engine`,
 * the single scoring/trade-decision authority — see predictionEngine.js) and
 * before that result is ever sent to a client. If any check fails, the caller
 * must not publish the analysis: return VALIDATION FAILED with the exact
 * failed checks instead (spec CHECK 15).
 */

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const BUY_CLASSES = new Set(['STRONG BUY CANDIDATE', 'BUY CANDIDATE']);
const AVOID_CLASSES = new Set(['AVOID / SELL BIAS', 'STRONG AVOID']);

export function validateAnalysis(result) {
  const failed = [];
  const fail = (id, title, detail) => failed.push({ id, title, detail });

  const e = result?.engine;
  if (!e) {
    fail('CHECK_ENGINE', 'Engine result missing', 'result.engine is required to validate output.');
    return { passed: false, failedChecks: failed };
  }

  // CHECK 1: exactly one user-facing overall score.
  if (num(result.overallScore) == null || result.overallScore !== e.totalScore) {
    fail('CHECK_1', 'Not exactly one overall score', `result.overallScore (${result.overallScore}) must equal the engine's single score, engine.totalScore (${e.totalScore}).`);
  }

  // CHECK 2: exactly one user-facing signal.
  if (!result.finalSignal || result.finalSignal !== e.signal) {
    fail('CHECK_2', 'Not exactly one signal', `result.finalSignal (${result.finalSignal}) must equal the engine's single signal, engine.signal (${e.signal}).`);
  }

  // CHECK 3: signal must correspond to the overall score classification.
  const isBuyClass = BUY_CLASSES.has(e.classification);
  const isAvoidClass = AVOID_CLASSES.has(e.classification);
  if (isBuyClass && !['STRONG BUY', 'BUY', 'WATCH', 'NO TRADE'].includes(e.signal)) {
    fail('CHECK_3', 'Signal does not match classification', `Classification "${e.classification}" cannot pair with signal "${e.signal}".`);
  }
  if (isAvoidClass && e.signal !== 'AVOID') {
    fail('CHECK_3', 'Signal does not match classification', `Classification "${e.classification}" cannot pair with signal "${e.signal}".`);
  }
  if (e.classification === 'HOLD / NO TRADE' && !['NO TRADE', 'HOLD', 'WATCH'].includes(e.signal)) {
    fail('CHECK_3', 'Signal does not match classification', `Classification "${e.classification}" cannot pair with signal "${e.signal}".`);
  }

  // SIGNAL LANGUAGE RULE: the word BUY may never appear in the directional
  // outlook field (BULLISH/NEUTRAL/BEARISH only), and STRONG BUY/BUY may
  // only appear as the trading signal when the trade decision is actually
  // EXECUTABLE for a buy-class score. A directional read of "BULLISH" next
  // to a WATCH/HOLD/NO TRADE signal is fine; the word BUY appearing next to
  // anything other than an executable BUY signal is not.
  if (/\bBUY\b/.test(String(e.directionalOutlook ?? ''))) {
    fail('CHECK_LANGUAGE', 'BUY leaked into directional outlook', `directionalOutlook is "${e.directionalOutlook}" — this field must only ever read BULLISH, NEUTRAL, or BEARISH.`);
  }
  if (/\bBUY\b/.test(String(e.signal ?? '')) && !(e.signal === 'BUY' || e.signal === 'STRONG BUY')) {
    fail('CHECK_LANGUAGE', 'BUY used outside the trading signal field', `signal is "${e.signal}" — BUY wording is only valid as the exact values "BUY" or "STRONG BUY".`);
  }
  if ((e.signal === 'BUY' || e.signal === 'STRONG BUY') && e.tradeStatus !== 'EXECUTABLE') {
    fail('CHECK_LANGUAGE', 'BUY signal without an executable trade decision', `signal is "${e.signal}" but tradeStatus is "${e.tradeStatus}" — BUY/STRONG BUY may only be shown when the trade decision is EXECUTABLE.`);
  }

  // CHECK 4: UNKNOWN data must never have a numeric score.
  // CHECK 5: a factor marked "data unavailable" must score UNKNOWN.
  const availabilityPairs = [
    { name: 'fundamentals', available: result.fundamentals?.available === true, score: e.subScores?.fundamentals },
    { name: 'market', available: result.market?.available === true, score: e.subScores?.marketSector },
    { name: 'relativeStrength', available: result.market?.available === true, score: e.subScores?.relativeStrength },
    {
      name: 'news',
      available: result.news?.available === true && (result.news?.materialEvents ?? 0) > 0,
      score: e.subScores?.news,
    },
  ];
  for (const p of availabilityPairs) {
    if (!p.available && p.score != null) {
      fail('CHECK_4', 'UNKNOWN data has a numeric score', `Factor "${p.name}" is unavailable but scored ${p.score} instead of UNKNOWN.`);
      fail('CHECK_5', 'Unavailable factor not marked UNKNOWN', `Factor "${p.name}" reports data unavailable but its score is ${p.score}, not UNKNOWN.`);
    }
  }
  const legacyPairs = [
    { name: 'valuation', available: result.valuation?.available === true, score: result.factorScores?.valuation },
  ];
  for (const p of legacyPairs) {
    if (!p.available && p.score != null) {
      fail('CHECK_4', 'UNKNOWN data has a numeric score', `Factor "${p.name}" is unavailable but scored ${p.score} instead of UNKNOWN.`);
      fail('CHECK_5', 'Unavailable factor not marked UNKNOWN', `Factor "${p.name}" reports data unavailable but its score is ${p.score}, not UNKNOWN.`);
    }
  }

  // CHECK 6: deep pullback must never be sold as an actionable BUY at current price.
  if (e.gates?.deepPullback) {
    const note = e.buy?.entryNote ?? '';
    if (!/^DEEP PULLBACK \/ WAIT/.test(note)) {
      fail('CHECK_6', 'Deep pullback not labeled', 'Entry is >10% below current price but entryNote is missing the "DEEP PULLBACK / WAIT" label.');
    }
    if (e.tradeStatus === 'EXECUTABLE') {
      fail('CHECK_6', 'Deep pullback marked executable', 'A deep-pullback setup must not be tradeStatus EXECUTABLE.');
    }
  }

  // CHECK 7: for a LONG trade, Stop < Entry < Target 1 < Target 2.
  if (e.buy) {
    if (e.gates?.structureOk !== true) {
      fail('CHECK_7', 'Trade structure invalid', 'Buy plan present but Stop < Entry < Target1 < Target2 does not hold (gates.structureOk is false).');
    }
  }

  // CHECK 8: risk/reward must be >= 2.0 for an executable trade.
  if (e.tradeStatus === 'EXECUTABLE') {
    const rr = num(e.buy?.riskReward);
    if (rr == null || rr < 2) {
      fail('CHECK_8', 'Risk/reward below 2.0', `Executable trade has risk/reward ${e.buy?.riskReward ?? 'null'}, must be >= 2.0.`);
    }
  }

  // CHECK 9: expected range must satisfy Bear < Base < Bull.
  const { bear, base, bull } = e.closingRange ?? {};
  if (bear != null && base != null && bull != null && !(bear < base && base < bull)) {
    fail('CHECK_9', 'Expected range not ordered', `closingRange bear=${bear}, base=${base}, bull=${bull} must satisfy bear < base < bull.`);
  }

  // CHECK 10: news score must reflect independent underlying events, not article count.
  if (e.subScores?.news != null) {
    if (result.news?.independentEvents == null || result.news?.materialEvents == null) {
      fail('CHECK_10', 'News score not based on independent events', 'News is scored but independentEvents/materialEvents (deduped, price-action-filtered counts) are missing.');
    } else if (result.news.materialEvents === 0) {
      fail('CHECK_10', 'News score not based on independent events', 'News is scored despite zero independent material events — should be UNKNOWN.');
    }
  }

  // CHECK 11: partially-available market data must report field-level UNKNOWN, not fabricate values.
  if (result.market && result.market.available === true && result.market.partial === true) {
    if (result.market.relativeStrength != null) {
      fail('CHECK_11', 'Partial market data not marked UNKNOWN', 'Market data is partial (index snapshot only) but relativeStrength holds a fabricated value instead of null/UNKNOWN.');
    }
  }

  // CHECK 12: confidence is not probability.
  const confScore = e.closingRange?.confidenceScore;
  const probability = e.closingRange?.probability;
  if (typeof probability === 'number' || (typeof confScore !== 'number')) {
    fail('CHECK_12', 'Confidence/probability conflated', 'confidenceScore must be numeric and probability must remain a distinct, non-numeric label — they must never be the same field.');
  }

  // CHECK 13: probability must read NOT CALIBRATED unless calibrated on historical out-of-sample data.
  if (e.closingRange?.probability !== 'NOT CALIBRATED') {
    fail('CHECK_13', 'Probability presented as calibrated', `closingRange.probability is "${e.closingRange?.probability}" — this build has no historical out-of-sample calibration, so it must read "NOT CALIBRATED".`);
  }
  if (e.buy && e.buy.probabilityTarget1 !== 'NOT CALIBRATED') {
    fail('CHECK_13', 'Probability presented as calibrated', `buy.probabilityTarget1 is "${e.buy.probabilityTarget1}" — must read "NOT CALIBRATED".`);
  }

  // CHECK 14: prediction and trade decision must be separate fields (never collapsed into one).
  if (!e.classification || !e.tradeStatus) {
    fail('CHECK_14', 'Prediction/trade decision not separated', 'engine.classification (prediction) and engine.tradeStatus (trade decision) must both be present as independent fields.');
  }

  return { passed: failed.length === 0, failedChecks: failed };
}

export function formatValidationFailure(result, validation) {
  const failedChecks = validation.failedChecks.map((f) => `${f.id}: ${f.title} — ${f.detail}`);
  return {
    ok: false,
    symbol: result?.symbol,
    validation: 'VALIDATION FAILED',
    failedChecks,
    // Matches the app's standard ApiError shape so existing error-message
    // extraction on the client surfaces this without special-casing it.
    error: {
      code: 'VALIDATION_FAILED',
      message: `VALIDATION FAILED — ${failedChecks.join('; ')}`,
    },
  };
}
