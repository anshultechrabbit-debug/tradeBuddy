import axios from 'axios';

const TOKEN_KEY = 'tradebuddy_token';

export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 300000,
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// In-flight GET request deduplication cache to eliminate duplicate network calls
const inFlightGets = new Map<string, Promise<any>>();

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Wrap axios get with request deduplication
const originalGet = apiClient.get.bind(apiClient);
apiClient.get = function <T = any, R = axios.AxiosResponse<T>, D = any>(url: string, config?: axios.AxiosRequestConfig<D>): Promise<R> {
  const method = (config?.method || 'get').toLowerCase();
  if (method === 'get') {
    const key = `${url}?${JSON.stringify(config?.params || {})}`;
    if (inFlightGets.has(key)) {
      return inFlightGets.get(key)!;
    }
    const reqPromise = originalGet<T, R, D>(url, config).finally(() => {
      // Clear after request completes
      setTimeout(() => inFlightGets.delete(key), 300);
    });
    inFlightGets.set(key, reqPromise);
    return reqPromise;
  }
  return originalGet<T, R, D>(url, config);
} as any;

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
  const e = error as {
    response?: {
      data?: {
        error?: {
          message?: string;
          code?: string;
          details?: { field?: string; message?: string }[];
        };
      };
    };
  };
  const err = e.response?.data?.error;
  if (!err) return 'Something went wrong.';
  if (err.details && err.details.length > 0) {
    return err.details.map((d) => `${d.field ?? ''} ${d.message ?? ''}`.trim()).filter(Boolean).join(', ');
  }
  return err.message ?? err.code ?? 'Something went wrong.';
}