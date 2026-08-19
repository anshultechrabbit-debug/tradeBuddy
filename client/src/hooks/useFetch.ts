import { useState } from 'react';

export function useFetch<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, error, load };
}