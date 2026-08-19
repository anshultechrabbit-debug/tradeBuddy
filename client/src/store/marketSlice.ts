import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Breadth, IndexQuote, Instrument, MarketQuote, TopMovers } from '../lib/types';

export interface MarketState {
  breadth: Breadth | null;
  indices: IndexQuote[];
  instruments: Instrument[];
  quotes: MarketQuote[];
  allQuotes: MarketQuote[];
  liveDetail: Record<string, MarketQuote>;
  top: TopMovers | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

const initialState: MarketState = {
  breadth: null,
  indices: [],
  instruments: [],
  quotes: [],
  allQuotes: [],
  liveDetail: {},
  top: null,
  loading: false,
  error: null,
  lastUpdated: null,
};

export const fetchBreadth = createAsyncThunk('market/breadth', async () => {
  const { data } = await apiClient.get<Breadth>('/market/breadth');
  return data;
});

export const fetchIndices = createAsyncThunk('market/indices', async () => {
  const { data } = await apiClient.get<{ indices: IndexQuote[] }>('/market/indices');
  return data.indices;
});

export const fetchQuotes = createAsyncThunk('market/quotes', async (limit: number = 100) => {
  const { data } = await apiClient.get<{ quotes: MarketQuote[] }>('/market/quotes', { params: { limit } });
  return data.quotes;
});

export const fetchQuotesBySymbols = createAsyncThunk('market/quotesBySymbols', async (symbols: string[]) => {
  const { data } = await apiClient.get<{ quotes: MarketQuote[] }>('/market/quotes', {
    params: { symbols: symbols.join(',') },
  });
  return data.quotes;
});

export const fetchLiveBySymbols = createAsyncThunk('market/liveBySymbols', async (symbols: string[]) => {
  const { data } = await apiClient.get<{ quotes: MarketQuote[] }>('/market/quotes', {
    params: { symbols: symbols.join(',') },
  });
  return data.quotes;
});

export const fetchAllQuotes = createAsyncThunk('market/allQuotes', async () => {
  const { data } = await apiClient.get<{ quotes: MarketQuote[] }>('/market/quotes', { params: { all: true } });
  return data.quotes;
});

export const fetchTopStocks = createAsyncThunk('market/top', async () => {
  const { data } = await apiClient.get<TopMovers>('/market/top');
  return data;
});

export const fetchInstruments = createAsyncThunk('market/instruments', async (q?: string) => {
  const { data } = await apiClient.get<{ instruments: Instrument[] }>('/market/instruments', { params: { q, limit: 50 } });
  return data.instruments;
});

const marketSlice = createSlice({
  name: 'market',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchBreadth.fulfilled, (state, action) => {
        state.breadth = action.payload;
      })
      .addCase(fetchBreadth.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load breadth';
      })
      .addCase(fetchIndices.fulfilled, (state, action) => {
        state.indices = action.payload;
      })
      .addCase(fetchIndices.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load indices';
      })
      .addCase(fetchQuotes.fulfilled, (state, action) => {
        state.quotes = action.payload;
        state.lastUpdated = Date.now();
      })
      .addCase(fetchQuotes.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load quotes';
      })
      .addCase(fetchQuotesBySymbols.fulfilled, (state, action) => {
        state.quotes = action.payload;
        state.lastUpdated = Date.now();
      })
      .addCase(fetchQuotesBySymbols.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load quotes';
      })
      .addCase(fetchLiveBySymbols.fulfilled, (state, action) => {
        for (const q of action.payload) {
          if (q?.symbol) state.liveDetail[q.symbol] = q;
        }
        state.lastUpdated = Date.now();
      })
      .addCase(fetchLiveBySymbols.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load live quotes';
      })
      .addCase(fetchAllQuotes.fulfilled, (state, action) => {
        state.allQuotes = action.payload;
      })
      .addCase(fetchAllQuotes.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load all quotes';
      })
      .addCase(fetchTopStocks.fulfilled, (state, action) => {
        state.top = action.payload;
      })
      .addCase(fetchTopStocks.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load top movers';
      })
      .addCase(fetchInstruments.fulfilled, (state, action) => {
        state.instruments = action.payload;
      })
      .addCase(fetchInstruments.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load instruments';
      });
  },
});

export default marketSlice.reducer;