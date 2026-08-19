import axios from 'axios';

const TOKEN_KEY = 'tradebuddy_token';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let redirecting = false;
apiClient.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const hasToken = Boolean(getToken());
    if (hasToken && (status === 401 || code === 'ACCOUNT_SUSPENDED') && !redirecting) {
      redirecting = true;
      clearToken();
      window.location.href = '/login';
      setTimeout(() => {
        redirecting = false;
      }, 500);
    }
    return Promise.reject(error);
  }
);

export function apiErrorMessage(error: unknown): string {
  const e = error as { response?: { data?: { error?: { message?: string; code?: string } } } };
  return e.response?.data?.error?.message ?? e.response?.data?.error?.code ?? 'Something went wrong.';
}