import { NselibAdapter } from './NselibAdapter.js';
import { JugaadAdapter } from './JugaadAdapter.js';
import { NseArchivesAdapter } from './NseArchivesAdapter.js';

/**
 * External adapter registry.
 *
 * `getExternalAdapters()` returns `{ primary, fallback, backfill }`:
 *   - primary   nselib          — real NSE equities, indices, F&O, option chains
 *   - fallback  jugaad-data     — live quotes + historical when nselib fails
 *   - backfill  indian-market-data / nse-archives — bulk bhavcopy + history
 *
 * The RealDevelopmentMarketDataProvider tries primary first, falls back to the
 * fallback source, and if both fail it serves cached Postgres data (never
 * synthetic).
 */
export function getExternalAdapters() {
  return {
    primary: new JugaadAdapter(),
    fallback: new NselibAdapter(),
    backfill: new NseArchivesAdapter(),
  };
}