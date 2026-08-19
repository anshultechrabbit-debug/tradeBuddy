import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient } from '../api/client';
import type { BrokerConnection, ComplianceConsent, DsrRequest, Paginated, ScanUniverseEntry, SystemHealth, User } from '../lib/types';

export interface AdminState {
  users: Paginated<User> | null;
  connections: BrokerConnection[];
  consents: ComplianceConsent[];
  requests: DsrRequest[];
  scanUniverse: Paginated<ScanUniverseEntry> | null;
  health: SystemHealth | null;
  loading: boolean;
  error: string | null;
}

const initialState: AdminState = {
  users: null,
  connections: [],
  consents: [],
  requests: [],
  scanUniverse: null,
  health: null,
  loading: false,
  error: null,
};

export const fetchUsers = createAsyncThunk('admin/users', async (params?: { page?: number; limit?: number; search?: string }) => {
  const { data } = await apiClient.get<Paginated<User>>('/admin/users', { params });
  return data;
});

export const createUser = createAsyncThunk(
  'admin/users/create',
  async (payload: { email: string; password: string; fullName?: string; role?: string; status?: string }) => {
    const { data } = await apiClient.post<{ user: User }>('/admin/users', payload);
    return data.user;
  }
);

export const updateUser = createAsyncThunk(
  'admin/users/update',
  async ({ id, payload }: { id: number; payload: Partial<User> }) => {
    const { data } = await apiClient.patch<{ user: User }>(`/admin/users/${id}`, payload);
    return data.user;
  }
);

export const deleteUser = createAsyncThunk('admin/users/delete', async (id: number) => {
  await apiClient.delete(`/admin/users/${id}`);
  return id;
});

export const fetchConnections = createAsyncThunk('admin/brokers', async () => {
  const { data } = await apiClient.get<{ connections: BrokerConnection[] }>('/admin/brokers');
  return data.connections;
});

export const setConnectionStatus = createAsyncThunk(
  'admin/brokers/status',
  async ({ id, status }: { id: number; status: string }) => {
    const { data } = await apiClient.patch<{ connection: BrokerConnection }>(`/admin/brokers/${id}/status`, { status });
    return data.connection;
  }
);

export const fetchConsents = createAsyncThunk('admin/compliance/consents', async () => {
  const { data } = await apiClient.get<{ consents: ComplianceConsent[] }>('/admin/compliance/consents');
  return data.consents;
});

export const fetchRequests = createAsyncThunk('admin/compliance/requests', async () => {
  const { data } = await apiClient.get<{ requests: DsrRequest[] }>('/admin/compliance/requests');
  return data.requests;
});

export const createRequest = createAsyncThunk(
  'admin/compliance/requests/create',
  async (payload: { userId: number; type: string; notes?: string }) => {
    const { data } = await apiClient.post<{ request: DsrRequest }>('/admin/compliance/requests', payload);
    return data.request;
  }
);

export const resolveRequest = createAsyncThunk(
  'admin/compliance/requests/resolve',
  async ({ id, status }: { id: number; status: string }) => {
    const { data } = await apiClient.patch<{ request: DsrRequest }>(`/admin/compliance/requests/${id}/resolve`, { status });
    return data.request;
  }
);

export const fetchScanUniverse = createAsyncThunk('admin/universe', async (params?: { page?: number; limit?: number }) => {
  const { data } = await apiClient.get<Paginated<ScanUniverseEntry>>('/admin/scan-universe', { params });
  return data;
});

export const updateScanUniverse = createAsyncThunk(
  'admin/universe/update',
  async ({ id, payload }: { id: number; payload: Partial<ScanUniverseEntry> }) => {
    const { data } = await apiClient.patch<{ entry: ScanUniverseEntry }>(`/admin/scan-universe/${id}`, payload);
    return data.entry;
  }
);

export const deleteScanUniverse = createAsyncThunk('admin/universe/delete', async (id: number) => {
  await apiClient.delete(`/admin/scan-universe/${id}`);
  return id;
});

export interface UniverseSyncResult {
  total: number;
  created: number;
  updated: number;
  niftyMembers: number;
}

export const syncUniverse = createAsyncThunk('admin/universe/sync', async () => {
  const { data } = await apiClient.post<UniverseSyncResult>('/admin/scan-universe/sync');
  return data;
});

export const fetchHealth = createAsyncThunk('admin/health', async () => {
  const { data } = await apiClient.get<SystemHealth>('/admin/system-health');
  return data;
});

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload;
      })
      .addCase(fetchConnections.fulfilled, (state, action) => {
        state.connections = action.payload;
      })
      .addCase(fetchConsents.fulfilled, (state, action) => {
        state.consents = action.payload;
      })
      .addCase(fetchRequests.fulfilled, (state, action) => {
        state.requests = action.payload;
      })
      .addCase(fetchScanUniverse.fulfilled, (state, action) => {
        state.scanUniverse = action.payload;
      })
      .addCase(fetchHealth.fulfilled, (state, action) => {
        state.health = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load users';
      })
      .addCase(fetchConnections.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load broker connections';
      })
      .addCase(fetchConsents.rejected, (state, action) => {
        state.error = action.error.message ?? 'Failed to load consents';
      });
  },
});

export default adminSlice.reducer;