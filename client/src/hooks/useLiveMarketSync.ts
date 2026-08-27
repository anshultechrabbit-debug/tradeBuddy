import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchIndices, fetchBreadth, fetchTopStocks } from '../store/marketSlice';
import { fetchSummary } from '../store/portfolioSlice';
import { fetchLatestScan } from '../store/radarSlice';
import { fetchWatchlist } from '../store/watchlistSlice';

/**
 * Global Live Market Sync Engine (Optimized)
 * 
 * Synchronizes market indices and essentials from a single coordinated,
 * non-overlapping tick loop.
 */
export function useLiveMarketSync() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const syncLock = useRef(false);
  const cycleCount = useRef(0);

  useEffect(() => {
    // 1. Single initial load on startup
    dispatch(fetchIndices());
    dispatch(fetchTopStocks());
    dispatch(fetchBreadth());
    if (token) {
      dispatch(fetchSummary());
      dispatch(fetchWatchlist());
      dispatch(fetchLatestScan());
    }

    // 2. Single Unified Heartbeat (~8-10s interval)
    const syncTimer = setInterval(async () => {
      if (document.hidden || syncLock.current) return;
      syncLock.current = true;
      cycleCount.current += 1;

      try {
        // Fast cycle: Live Indices & Top Movers (every tick ~10s)
        await Promise.allSettled([
          dispatch(fetchIndices()),
          dispatch(fetchTopStocks()),
        ]);

        // Medium cycle: Breadth & Watchlist (every 2nd tick ~20s)
        if (cycleCount.current % 2 === 0) {
          await Promise.allSettled([
            dispatch(fetchBreadth()),
            token ? dispatch(fetchWatchlist()) : Promise.resolve(),
            token ? dispatch(fetchSummary()) : Promise.resolve(),
          ]);
        }

        // Slow cycle: Radar Scan (every 4th tick ~40s)
        if (token && cycleCount.current % 4 === 0) {
          await dispatch(fetchLatestScan()).catch(() => {});
        }
      } finally {
        syncLock.current = false;
      }
    }, 10000);

    // 3. Tab visibility / window focus listener
    const handleFocus = () => {
      if (!document.hidden && !syncLock.current) {
        dispatch(fetchIndices());
        dispatch(fetchTopStocks());
        if (token) {
          dispatch(fetchSummary());
        }
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
