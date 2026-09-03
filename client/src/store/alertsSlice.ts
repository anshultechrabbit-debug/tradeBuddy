import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { Alert, AlertEvent, Notification, Paginated } from '../lib/types';

export interface AlertsState {
  alerts: Alert[];
  events: Paginated<AlertEvent> | null;
  notifications: Paginated<Notification> | null;
  loading: boolean;
  error: string | null;
}

const initialState: AlertsState = {
  alerts: [],
  events: null,
  notifications: null,
  loading: false,
  error: null,
};

export const fetchAlerts = createAsyncThunk('alerts/list', async () => {
  const { data } = await apiClient.get<{ alerts: Alert[] }>('/alerts');
  return data.alerts;
});

export const createAlert = createAsyncThunk(
  'alerts/create',
  async (payload: {
    name: string;
    alertType: string;
    threshold: number;
    symbol?: string;
    channels?: string[];
  }) => {
    const { data } = await apiClient.post<{ alert: Alert }>('/alerts', payload);
    return data.alert;
  }
);

export const updateAlert = createAsyncThunk(
  'alerts/update',
  async ({ id, payload }: { id: number; payload: Partial<Alert> }) => {
    const { data } = await apiClient.patch<{ alert: Alert }>(`/alerts/${id}`, payload);
    return data.alert;
  }
);

export const deleteAlert = createAsyncThunk('alerts/delete', async (id: number) => {
  await apiClient.delete(`/alerts/${id}`);
  return id;
});

export const fetchEvents = createAsyncThunk<Paginated<AlertEvent>, number | undefined>('alerts/events', async (page = 1) => {
  const { data } = await apiClient.get<Paginated<AlertEvent>>('/alerts/events', { params: { page, limit: 20 } });
  return data;
});

export const fetchNotifications = createAsyncThunk('alerts/notifications', async () => {
  const { data } = await apiClient.get<Paginated<Notification>>('/alerts/notifications', { params: { limit: 20 } });
  return data;
});

export const evaluateAlerts = createAsyncThunk('alerts/evaluate', async () => {
  const { data } = await apiClient.get<{ triggered: AlertEvent[] }>('/alerts/evaluate');
  return data.triggered;
});

const alertsSlice = createSlice({
  name: 'alerts',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading = false;
        state.alerts = action.payload;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load alerts';
      })
      .addCase(createAlert.fulfilled, (state, action) => {
        state.alerts = [action.payload, ...state.alerts];
      })
      .addCase(deleteAlert.fulfilled, (state, action) => {
        state.alerts = state.alerts.filter((a) => a.id !== action.payload);
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.events = action.payload;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
      });
  },
});

export default alertsSlice.reducer;