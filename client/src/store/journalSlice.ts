import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { JournalEntry, Paginated } from '../lib/types';

export interface JournalState {
  entries: Paginated<JournalEntry> | null;
  importResult: { orders: number; trades: number; imported: number } | null;
  loading: boolean;
  error: string | null;
}

const initialState: JournalState = {
  entries: null,
  importResult: null,
  loading: false,
  error: null,
};

export const fetchJournal = createAsyncThunk('journal/list', async (params?: { page?: number; limit?: number }) => {
  const { data } = await apiClient.get<Paginated<JournalEntry>>('/journal', { params });
  return data;
});

export const importJournal = createAsyncThunk<{ orders: number; trades: number; imported: number }, string>('journal/import', async (broker = 'mock') => {
  const { data } = await apiClient.post<{ orders: number; trades: number; imported: number }>('/journal/import', { broker });
  return data;
});

export const updateNotes = createAsyncThunk(
  'journal/notes',
  async ({ id, notes }: { id: number; notes: string | null }) => {
    const { data } = await apiClient.patch(`/journal/${id}/notes`, { notes });
    return data;
  }
);

const journalSlice = createSlice({
  name: 'journal',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchJournal.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchJournal.fulfilled, (state, action) => {
        state.loading = false;
        state.entries = action.payload;
      })
      .addCase(fetchJournal.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load journal';
      })
      .addCase(importJournal.fulfilled, (state, action) => {
        state.importResult = action.payload;
      })
      .addCase(importJournal.rejected, (state, action) => {
        state.error = action.error.message ?? 'Import failed';
      });
  },
});

export default journalSlice.reducer;