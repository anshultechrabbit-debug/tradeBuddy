import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Paginated, SavedOpportunity, ScanResult, Signal } from '../lib/types';

export interface RadarState {
  scanning: boolean;
  scanResult: ScanResult | null;
  lastScannedAt: string | null;
  opportunities: Paginated<SavedOpportunity> | null;
  signals: Paginated<Signal> | null;
  loading: boolean;
  signalsLoading: boolean;
  error: string | null;
}

const initialState: RadarState = {
  scanning: false,
  scanResult: null,
  lastScannedAt: null,
  opportunities: null,
  signals: null,
  loading: false,
  signalsLoading: false,
  error: null,
};

export const runScan = createAsyncThunk<ScanResult, number | undefined>('radar/scan', async (limit = 0) => {
  const { data } = await apiClient.post<ScanResult>('/radar/scan', { limit });
  return data;
});

export const fetchLatestScan = createAsyncThunk<ScanResult & { lastScannedAt: string }>('radar/latest', async () => {
  const { data } = await apiClient.get('/radar/latest');
  return data;
});

export const fetchOpportunities = createAsyncThunk(
  'radar/opportunities',
  async (params?: { page?: number; limit?: number; signal?: string; outlook?: string; minConviction?: number; symbol?: string }) => {
    const { data } = await apiClient.get<Paginated<SavedOpportunity>>('/radar/opportunities', { params });
    return data;
  },
);

export const fetchSignals = createAsyncThunk(
  'radar/signals',
  async (params?: { page?: number; limit?: number; signal?: string; outlook?: string; minConviction?: number; symbol?: string }) => {
    const { data } = await apiClient.get<Paginated<Signal>>('/radar/signals', { params });
    return data;
  },
);

const radarSlice = createSlice({
  name: 'radar',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runScan.pending, (state) => {
        state.scanning = true;
        state.error = null;
      })
      .addCase(runScan.fulfilled, (state, action) => {
        state.scanning = false;
        state.scanResult = action.payload;
        state.lastScannedAt = action.payload.lastScannedAt ?? null;
      })
      .addCase(runScan.rejected, (state, action) => {
        state.scanning = false;
        state.error = action.error.message ?? 'Scan failed';
      })
      .addCase(fetchLatestScan.fulfilled, (state, action) => {
        state.scanResult = action.payload;
        state.lastScannedAt = action.payload.lastScannedAt ?? null;
        state.scanning = false;
      })
      .addCase(fetchLatestScan.rejected, (_state) => {
        // no scan yet (404) or transient failure — keep whatever we have
      })
      .addCase(fetchOpportunities.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchOpportunities.fulfilled, (state, action) => {
        state.loading = false;
        state.opportunities = action.payload;
      })
      .addCase(fetchOpportunities.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load opportunities';
      })
      .addCase(fetchSignals.pending, (state) => {
        state.signalsLoading = true;
      })
      .addCase(fetchSignals.fulfilled, (state, action) => {
        state.signalsLoading = false;
        state.signals = action.payload;
      })
      .addCase(fetchSignals.rejected, (state, action) => {
        state.signalsLoading = false;
        state.error = action.error.message ?? 'Failed to load signals';
      });
  },
});

export const { clearError } = radarSlice.actions;
export default radarSlice.reducer;
