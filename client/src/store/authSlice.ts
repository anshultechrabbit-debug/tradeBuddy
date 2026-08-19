import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { apiClient, clearToken, setToken } from '../api/client';
import type { AuthResponse, User } from '../lib/types';

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  token: localStorage.getItem('tradebuddy_token'),
  loading: false,
  error: null,
};

export const login = createAsyncThunk('auth/login', async (creds: { email: string; password: string }) => {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', creds);
  return data;
});

export const register = createAsyncThunk(
  'auth/register',
  async (payload: { email: string; password: string; fullName?: string }) => {
    const { data } = await apiClient.post<AuthResponse>('/auth/register', payload);
    return data;
  }
);

export const fetchMe = createAsyncThunk('auth/me', async () => {
  const { data } = await apiClient.get<{ user: User }>('/auth/me');
  return data.user;
});

export const logout = createAsyncThunk('auth/logout', async () => {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    /* ignore */
  }
});

export const changePassword = createAsyncThunk(
  'auth/changePassword',
  async (payload: { currentPassword: string; newPassword: string }) => {
    await apiClient.post('/auth/change-password', payload);
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    localLogout: (state) => {
      state.user = null;
      state.token = null;
      clearToken();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        setToken(action.payload.token);
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Login failed';
      })
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        setToken(action.payload.token);
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Registration failed';
      })
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.user = action.payload;
      })
      .addCase(fetchMe.rejected, (state) => {
        state.user = null;
        state.token = null;
        clearToken();
      })
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        clearToken();
      });
  },
});

export const { clearError, localLogout } = authSlice.actions;
export default authSlice.reducer;