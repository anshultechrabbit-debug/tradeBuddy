import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Holding, PortfolioSummary, SectorExposure } from '../lib/types';

export interface PortfolioState {
  summary: PortfolioSummary | null;
  holdings: Holding[];
  sectors: SectorExposure[];
  loading: boolean;
  error: string | null;
}

const initialState: PortfolioState = {
  summary: null,
  holdings: [],
  sectors: [],
  loading: false,
  error: null,
};

export const fetchSummary = createAsyncThunk('portfolio/summary', async () => {
  const { data } = await apiClient.get<{ portfolio: PortfolioSummary }>('/portfolio/summary');
  return data.portfolio;
});

export const fetchHoldings = createAsyncThunk('portfolio/holdings', async () => {
  const { data } = await apiClient.get<{ holdings: Holding[] }>('/portfolio/holdings');
  return data.holdings;
});

export const fetchSectors = createAsyncThunk('portfolio/sectors', async () => {
  const { data } = await apiClient.get<{ sectors: SectorExposure[] }>('/portfolio/sectors');
  return data.sectors;
});

export const syncPortfolio = createAsyncThunk('portfolio/sync', async (broker: string = 'mock') => {
  const { data } = await apiClient.post(`/portfolio/sync`, { broker });
  return data;
});

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSummary.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSummary.fulfilled, (state, action) => {
        state.loading = false;
        state.summary = action.payload;
      })
      .addCase(fetchSummary.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load portfolio';
      })
      .addCase(fetchHoldings.fulfilled, (state, action) => {
        state.holdings = action.payload;
      })
      .addCase(fetchHoldings.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load holdings';
      })
      .addCase(fetchSectors.fulfilled, (state, action) => {
        state.sectors = action.payload;
      })
      .addCase(fetchSectors.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load sectors';
      });
  },
});

export default portfolioSlice.reducer;