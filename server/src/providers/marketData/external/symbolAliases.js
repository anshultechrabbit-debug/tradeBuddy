/**
 * Ticker-rename aliases for external live-data calls.
 *
 * A company can rename its NSE ticker (e.g. Zomato Ltd → Eternal Ltd,
 * ticker ZOMATO → ETERNAL in 2024). jugaad-data's HISTORICAL endpoint keeps
 * resolving the old ticker transparently, but its LIVE endpoints (quote,
 * intraday, live_quotes) and nselib's fundamentals lookup do not — they
 * return nothing for the retired symbol.
 *
 * Our canonical symbol (scanUniverse, watchlists, saved predictions, this
 * whole app's DB) stays whatever it already is — renaming that has a much
 * bigger blast radius than fixing a data-source quirk. This module only
 * substitutes the ticker on the outgoing call to jugaad/nselib; callers map
 * the response back onto the original requested symbol so nothing downstream
 * needs to know the alias exists.
 */

const LIVE_SYMBOL_ALIASES = {
  ZOMATO: 'ETERNAL', // Zomato Ltd renamed to Eternal Ltd on NSE (Jul 2024)
};

// Reverse map, for relabeling batch (symbol-keyed) responses back to the
// canonical symbol callers actually asked for.
const REVERSE_ALIASES = Object.fromEntries(
  Object.entries(LIVE_SYMBOL_ALIASES).map(([canonical, live]) => [live, canonical]),
);

/** The ticker to actually send to jugaad/nselib's live-data commands. */
export function resolveLiveSymbol(symbol) {
  const key = String(symbol).toUpperCase();
  return LIVE_SYMBOL_ALIASES[key] ?? symbol;
}

/** Canonical symbol for a ticker that came back from a live-data response. */
export function canonicalSymbol(liveSymbol) {
  const key = String(liveSymbol).toUpperCase();
  return REVERSE_ALIASES[key] ?? liveSymbol;
}
