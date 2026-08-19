import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Breadth, IndexQuote, Instrument, MarketQuote } from '../lib/types';

export interface MarketState {
  breadth: Breadth | null;
  indices: IndexQuote[];
  instruments: Instrument[];
  quotes: MarketQuote[];
  loading: boolean;
  error: string | null;
}

const initialState: MarketState = {
  breadth: null,
  indices: [],
  instruments: [],
  quotes: [],
  loading: false,
  error: null,
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
      })
      .addCase(fetchQuotes.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load quotes';
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