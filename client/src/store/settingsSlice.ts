import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Settings } from '../lib/types';

export interface SettingsState {
  prefs: Settings | null;
  loading: boolean;
  error: string | null;
}

const initialState: SettingsState = {
  prefs: null,
  loading: false,
  error: null,
};

export const fetchSettings = createAsyncThunk('settings/get', async () => {
  const { data } = await apiClient.get<{ prefs: Settings }>('/settings');
  return data.prefs;
});

export const updateSettings = createAsyncThunk('settings/update', async (payload: Partial<Settings>) => {
  const { data } = await apiClient.patch<{ prefs: Settings }>('/settings', payload);
  return data.prefs;
});

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.prefs = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load settings';
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.prefs = action.payload;
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to save settings';
      });
  },
});

export default settingsSlice.reducer;