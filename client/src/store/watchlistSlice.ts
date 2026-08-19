import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Watchlist } from '../lib/types';

export interface WatchlistState {
  watchlist: Watchlist | null;
  loading: boolean;
  error: string | null;
}

const initialState: WatchlistState = {
  watchlist: null,
  loading: false,
  error: null,
};

export const fetchWatchlist = createAsyncThunk('watchlist/list', async () => {
  const { data } = await apiClient.get<Watchlist>('/watchlist');
  return data;
});

export const addToWatchlist = createAsyncThunk('watchlist/add', async (symbol: string) => {
  const { data } = await apiClient.post('/watchlist', { symbol });
  return data;
});

export const removeFromWatchlist = createAsyncThunk('watchlist/remove', async (symbol: string) => {
  const { data } = await apiClient.delete(`/watchlist/${symbol}`);
  return data;
});

const watchlistSlice = createSlice({
  name: 'watchlist',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchWatchlist.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWatchlist.fulfilled, (state, action) => {
        state.loading = false;
        state.watchlist = action.payload;
      })
      .addCase(fetchWatchlist.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load watchlist';
      });
  },
});

export default watchlistSlice.reducer;