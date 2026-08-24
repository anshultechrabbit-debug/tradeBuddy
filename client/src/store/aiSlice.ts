import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient, apiErrorMessage } from '../api/client';
import type { AiAnalysis, AiAnalyzeManyResponse, AiAnalyzeResponse, MarketPredictionResponse, PredictedRiser, PredictedRisersResponse } from '../lib/types';

type RawAnalysis = Record<string, any>;

export function normalizeAnalysis(raw: RawAnalysis): AiAnalysis {
  const t = raw.technical ?? {};
  const n = raw.news ?? {};
  const e = raw.entry ?? {};
  const v = raw.valuation ?? {};
  const r = raw.risk ?? {};
  const m = raw.market ?? {};
  const f = raw.fundamentals ?? {};
  const scores = raw.factorScores ?? raw.scores ?? {};
  const price = raw.quote?.lastPrice ?? raw.price;
  const candles = t.candleCount ?? raw.candleCount ?? 0;

  const technical: AiAnalysis['technical'] = {
    price: raw.quote?.lastPrice ?? raw.price ?? 0,
    sma20: t.sma20 ?? null,
    sma50: t.sma50 ?? null,
    sma200: t.sma200 ?? null,
    ema20: t.ema20 ?? null,
    rsi: t.rsi ?? null,
    macdValue: t.macdValue ?? t.macd?.value ?? null,
    macdSignal: t.macdSignal ?? t.macd?.signal ?? null,
    roc20: t.roc20 ?? null,
    atr: t.atr ?? t.atrPct ?? null,
    volRatio: t.volRatio ?? t.volumeRatio ?? null,
    avgVolume20: t.avgVolume20 ?? null,
    primarySupport: t.primarySupport ?? t.support ?? null,
    primaryResistance: t.primaryResistance ?? t.resistance ?? null,
    high52w: t.high52w ?? null,
    low52w: t.low52w ?? null,
    drawdownFromHigh: t.drawdownFromHigh ?? t.drawdownFromHighPct ?? null,
    candleCount: candles,
    trend: t.trend ?? 'Neutral',
  };

  const oneLiner =
    raw.oneLiner ??
    `${raw.finalSignal ?? 'N/A'} (score ${raw.overallScore ?? 0}) — strongest factor is ${
      Object.keys(scores).sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0))[0] ?? 'n/a'
    }. ${t.trend ?? 'Neutral'} trend, RSI ${t.rsi ?? 'n/a'}.`;

  return {
    ok: Boolean(raw.ok),
    symbol: raw.symbol ?? '',
    companyName: raw.companyName ?? raw.symbol ?? '',
    quote: {
      symbol: raw.symbol ?? '',
      lastPrice: price ?? 0,
      changePct: raw.quote?.changePct ?? null,
      volume: raw.quote?.volume ?? null,
      dataSource: raw.quote?.dataSource ?? raw.quote?.source ?? null,
    },
    finalSignal: raw.finalSignal ?? 'HOLD',
    overallScore: raw.overallScore ?? 0,
    confidence: raw.confidence ?? 'LOW',
    flags: Array.isArray(raw.flags) ? raw.flags : [],
    factorScores: {
      news: scores.news ?? 50,
      technical: scores.technical ?? 50,
      fundamentals: scores.fundamentals ?? 50,
      valuation: scores.valuation ?? 50,
      market: scores.market ?? 50,
      risk: scores.risk ?? 50,
    },
    reasons: {
      news: raw.reasons?.news ?? '',
      technical: raw.reasons?.technical ?? '',
      fundamentals: raw.reasons?.fundamentals ?? '',
      valuation: raw.reasons?.valuation ?? '',
      market: raw.reasons?.market ?? '',
      risk: raw.reasons?.risk ?? '',
    },
    news: {
      positive: n.positive ?? 0,
      neutral: n.neutral ?? 0,
      negative: n.negative ?? 0,
      overall: n.overall ?? 'Neutral',
      sentimentScore: n.sentimentScore ?? 50,
      available: Boolean(n.available),
      articles: n.articles ?? [],
      positiveCatalysts: n.positiveCatalysts ?? [],
      negativeCatalysts: n.negativeCatalysts ?? [],
    },
    technical,
    fundamentals: {
      pe: f.pe ?? null,
      adjustedPe: f.adjustedPe ?? null,
      tradeDate: f.tradeDate ?? null,
      note: f.note ?? '',
    },
    valuation: {
      score: v.score ?? scores.valuation ?? 50,
      pe: v.pe ?? null,
      flag: v.flag ?? null,
      note: v.note ?? '',
    },
    market: {
      regime: m.regime ?? 'NEUTRAL',
      relativeStrength: m.relativeStrength ?? null,
      niftyLevel: m.niftyLevel ?? null,
      note: m.note ?? '',
    },
    risk: {
      score: r.score ?? scores.risk ?? 50,
      volatilityPct: r.volatilityPct ?? r.atrPct ?? null,
      drawdownPct: r.drawdownFromHighPct ?? r.drawdownPct ?? null,
      volRatio: r.volRatio ?? t.volumeRatio ?? null,
      note: r.note ?? '',
    },
    entry: {
      zoneLow: e.zoneLow ?? 0,
      zoneHigh: e.zoneHigh ?? 0,
      stopLoss: e.stopLoss ?? 0,
      note: e.note ?? '',
      reason: e.reason ?? '',
      overbought: Boolean(e.overbought),
    },
    positiveFactors: raw.positiveFactors ?? [],
    negativeFactors: raw.negativeFactors ?? [],
    oneLiner,
    simpleNote: raw.simpleNote ?? '',
    prediction: raw.prediction ?? '',
    expectedClose: raw.expectedClose ?? null,
    expectedPct: raw.expectedPct ?? null,
    dataTimestamp: raw.dataTimestamp ?? new Date().toISOString(),
    disclaimer: raw.disclaimer ?? '',
  };
}

export interface InstrumentSuggestion {
  symbol: string;
  name: string | null;
  sector: string | null;
}

export interface AiState {
  picks: AiAnalysis[];
  bySymbol: Record<string, AiAnalysis>;
  analyzing: boolean;
  error: string | null;
  lastUpdated: number | null;
  suggestions: InstrumentSuggestion[];
  searching: boolean;
  marketPrediction: MarketPredictionResponse | null;
  predictedRisers: PredictedRiser[];
}

const initialState: AiState = {
  picks: [],
  bySymbol: {},
  analyzing: false,
  error: null,
  lastUpdated: null,
  suggestions: [],
  searching: false,
  marketPrediction: null,
  predictedRisers: [],
};

export const searchSymbols = createAsyncThunk<InstrumentSuggestion[], string>('ai/searchSymbols', async (q) => {
  const query = q.trim();
  if (!query) return [];
  const { data } = await apiClient.get<{ instruments: InstrumentSuggestion[] }>('/market/search', {
    params: { q: query, limit: 8 },
  });
  return data.instruments;
});

export const analyzeSymbol = createAsyncThunk<AiAnalysis, string>('ai/analyze', async (symbol) => {
  const { data } = await apiClient.post<AiAnalyzeResponse>('/ai/analyze', { symbol });
  return normalizeAnalysis(data.analysis);
});

export const analyzeMany = createAsyncThunk<AiAnalysis[], string[]>('ai/analyzeMany', async (symbols) => {
  if (!symbols.length) return [];
  const { data } = await apiClient.post<AiAnalyzeManyResponse>('/ai/analyze-many', { symbols });
  return data.results.map((r) => (r?.analysis ? normalizeAnalysis(r.analysis) : undefined)).filter((a): a is AiAnalysis => Boolean(a));
});

export const suggestMarket = createAsyncThunk<AiAnalysis[], number>('ai/suggestMarket', async (n) => {
  const { data } = await apiClient.post<AiAnalyzeManyResponse>('/ai/suggest-market', { n });
  return data.results.map((r) => (r?.analysis ? normalizeAnalysis(r.analysis) : undefined)).filter((a): a is AiAnalysis => Boolean(a));
});

export const fetchMarketPrediction = createAsyncThunk<MarketPredictionResponse>('ai/marketPrediction', async () => {
  const { data } = await apiClient.get<MarketPredictionResponse>('/ai/market-prediction');
  return data;
});

export const fetchPredictedRisers = createAsyncThunk<PredictedRiser[]>('ai/predictedRisers', async () => {
  const { data } = await apiClient.post<PredictedRisersResponse>('/ai/predicted-risers', { limit: 5 });
  return data.risers;
});

function mergeAnalyses(state: AiState, payload: AiAnalysis[]) {
  const seen = new Set<string>();
  const picks: AiAnalysis[] = [];
  for (const a of payload) {
    state.bySymbol[a.symbol] = a;
    if (!seen.has(a.symbol)) {
      seen.add(a.symbol);
      picks.push(a);
    }
  }
  // Keep last-known-good picks for any symbol this batch could not score
  // (e.g. transient feed throttling), so nothing flickers out mid-refresh.
  for (const prev of state.picks) {
    if (!seen.has(prev.symbol)) {
      state.bySymbol[prev.symbol] = prev;
      seen.add(prev.symbol);
      picks.push(prev);
    }
  }
  picks.sort((a, b) => b.overallScore - a.overallScore);
  state.picks = picks;
  state.lastUpdated = Date.now();
}

const aiSlice = createSlice({
  name: 'ai',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(analyzeMany.pending, (state) => {
        state.analyzing = true;
        state.error = null;
      })
      .addCase(analyzeMany.fulfilled, (state, action) => {
        state.analyzing = false;
        mergeAnalyses(state, action.payload);
      })
      .addCase(analyzeMany.rejected, (state, action) => {
        state.analyzing = false;
        state.error = apiErrorMessage(action.error) ?? 'Failed to run AI analysis';
      })
      .addCase(analyzeSymbol.pending, (state) => {
        state.analyzing = true;
        state.error = null;
      })
      .addCase(analyzeSymbol.fulfilled, (state, action) => {
        state.analyzing = false;
        state.bySymbol[action.payload.symbol] = action.payload;
        const idx = state.picks.findIndex((p) => p.symbol === action.payload.symbol);
        const updated = [...state.picks];
        if (idx >= 0) updated[idx] = action.payload;
        else updated.push(action.payload);
        updated.sort((a, b) => b.overallScore - a.overallScore);
        state.picks = updated;
        state.lastUpdated = Date.now();
      })
      .addCase(analyzeSymbol.rejected, (state, action) => {
        state.analyzing = false;
        state.error = apiErrorMessage(action.error) ?? 'Failed to analyze symbol';
      })
      .addCase(suggestMarket.pending, (state) => {
        state.analyzing = true;
        state.error = null;
      })
      .addCase(suggestMarket.fulfilled, (state, action) => {
        state.analyzing = false;
        mergeAnalyses(state, action.payload);
      })
      .addCase(suggestMarket.rejected, (state, action) => {
        state.analyzing = false;
        state.error = apiErrorMessage(action.error) ?? 'Failed to get market suggestions';
      })
      .addCase(searchSymbols.pending, (state) => {
        state.searching = true;
      })
      .addCase(searchSymbols.fulfilled, (state, action) => {
        state.searching = false;
        state.suggestions = action.payload;
      })
      .addCase(searchSymbols.rejected, (state) => {
        state.searching = false;
        state.suggestions = [];
      })
      .addCase(fetchMarketPrediction.fulfilled, (state, action) => {
        state.marketPrediction = action.payload;
      })
      .addCase(fetchPredictedRisers.fulfilled, (state, action) => {
        state.predictedRisers = action.payload;
      });
  },
});

export default aiSlice.reducer;