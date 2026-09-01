import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchIndices, fetchBreadth, fetchTopStocks } from '../store/marketSlice';
import { fetchSummary } from '../store/portfolioSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchWatchlist } from '../store/watchlistSlice';

/**
 * Global Live Market Sync Engine (Optimized)
 *
 * Synchronizes market data from a single coordinated, non-overlapping tick loop.
 * Polling is intentionally relaxed (30s) to prevent request pile-ups when the
 * server's external market-data provider is slow (NSE/jugaad can take 40s+).
 */
export function useLiveMarketSync() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const syncLock = useRef(false);
  const cycleCount = useRef(0);
  const lastPollAt = useRef(0);

  useEffect(() => {
    // 1. Single initial load on mount
    dispatch(fetchIndices());
    dispatch(fetchTopStocks());
    dispatch(fetchBreadth());
    if (token) {
      dispatch(fetchSummary());
      dispatch(fetchWatchlist());
      dispatch(fetchLatestScan());
    }

    // 2. Coordinated heartbeat — 30s interval to avoid hammering a slow provider.
    //    syncLock ensures we never have two concurrent sync cycles.
    const syncTimer = setInterval(async () => {
      if (document.hidden || syncLock.current) return;
      syncLock.current = true;
      cycleCount.current += 1;
      lastPollAt.current = Date.now();

      try {
        // Every 30s: indices only (lightest call)
        await dispatch(fetchIndices()).catch(() => {});

        // Every 2nd tick (~60s): add top movers + breadth
        if (cycleCount.current % 2 === 0) {
          await Promise.allSettled([
            dispatch(fetchTopStocks()),
            dispatch(fetchBreadth()),
            token ? dispatch(fetchWatchlist()) : Promise.resolve(),
            token ? dispatch(fetchSummary()) : Promise.resolve(),
          ]);
        }

        // Every 4th tick (~120s): radar scan
        if (token && cycleCount.current % 4 === 0) {
          await dispatch(fetchLatestScan()).catch(() => {});
        }
      } finally {
        syncLock.current = false;
      }
    }, 30000);

    // 3. Refetch on tab focus — only if last poll was > 25s ago
    const handleFocus = () => {
      if (!document.hidden && !syncLock.current && Date.now() - lastPollAt.current > 25000) {
        lastPollAt.current = Date.now();
        dispatch(fetchIndices());
        if (token) dispatch(fetchSummary());
      }
    };

    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    };
  }, [dispatch, token]);
}
