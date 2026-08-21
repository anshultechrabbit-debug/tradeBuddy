import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Holding, PortfolioSummary, SectorExposure } from '../lib/types';

export interface PortfolioHoldingReview {
  symbol: string;
  action: 'BUY_MORE' | 'HOLD' | 'TRIM' | 'SELL';
  reason: string;
}

export interface PortfolioReview {
  overallNarrative: string;
  portfolioScore: number | null;
  rebalancing: string;
  holdings: PortfolioHoldingReview[];
}

export interface PortfolioState {
  summary: PortfolioSummary | null;
  holdings: Holding[];
  sectors: SectorExposure[];
  loading: boolean;
  error: string | null;
  review: PortfolioReview | null;
  reviewLoading: boolean;
  reviewError: string | null;
  chatAnswer: string | null;
  chatLoading: boolean;
}

const initialState: PortfolioState = {
  summary: null,
  holdings: [],
  sectors: [],
  loading: false,
  error: null,
  review: null,
  reviewLoading: false,
  reviewError: null,
  chatAnswer: null,
  chatLoading: false,
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

export const fetchPortfolioReview = createAsyncThunk('portfolio/review', async () => {
  const { data } = await apiClient.post<{ review: PortfolioReview }>('/ai/portfolio-review');
  return data.review;
});

export const askPortfolioQuestion = createAsyncThunk('portfolio/chat', async (question: string) => {
  const { data } = await apiClient.post<{ answer: string }>('/ai/ask', { question });
  return data.answer;
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
      })
      .addCase(fetchPortfolioReview.pending, (state) => {
        state.reviewLoading = true;
        state.reviewError = null;
      })
      .addCase(fetchPortfolioReview.fulfilled, (state, action) => {
        state.reviewLoading = false;
        state.review = action.payload;
      })
      .addCase(fetchPortfolioReview.rejected, (state, action) => {
        state.reviewLoading = false;
        state.reviewError = action.error.message ?? 'AI review failed';
      })
      .addCase(askPortfolioQuestion.pending, (state) => {
        state.chatLoading = true;
        state.chatAnswer = null;
      })
      .addCase(askPortfolioQuestion.fulfilled, (state, action) => {
        state.chatLoading = false;
        state.chatAnswer = action.payload;
      })
      .addCase(askPortfolioQuestion.rejected, (state) => {
        state.chatLoading = false;
      });
  },
});

export default portfolioSlice.reducer;