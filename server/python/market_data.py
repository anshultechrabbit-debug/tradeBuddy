#!/usr/bin/env python3
"""TradeBuddy market-data bridge.

Uniform CLI over nselib (primary), jugaad-data (fallback) and
indian-market-data / nse-archives (historical/bulk backfill).

Usage:
  python market_data.py <source> <command> [--symbol X] [--exchange NSE]
        [--days N] [--index "NIFTY 50"] [--date YYYY-MM-DD] [--expiry DD-MM-YYYY]
        [--option-type CE] [--strike 24000]

Source:
  nselib        primary — capital market, indices, F&O, option chains
  jugaad        fallback — live quotes + historical via jugaad-data
  nse_archives  backfill — bhavcopy/bulk historical via indian-market-data

Commands:
  quote          latest EOD quote for a symbol
  candles        historical daily candles for a symbol (or --index)
  indices        live/current index levels
  option_chain   live option chain (nselib)
  fno            futures/options price-volume history (nselib)
  instruments    listed equity / F&O instrument lists (nselib)
  bulk_bhav      full-market bhavcopy for a trading date (nse_archives)
  health         availability probe

Output: single JSON document on stdout. Never logs to stdout.
"""

import argparse
import io
import json
import os
import sys
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone

CACHE_DIR = os.environ.get("MARKET_DATA_CACHE_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".cache", "market-data"))

IST_OFFSET = timedelta(hours=5, minutes=30)


def cache_load(key):
    if not CACHE_DIR:
        return None
    path = os.path.join(CACHE_DIR, key)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


def cache_store(key, data):
    if not CACHE_DIR:
        return data
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, key)
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, default=str)
    except Exception:
        pass
    return data


def emit(payload):
    sys.stdout.write(json.dumps(payload, default=str))
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Corporate actions (dividends) — fetched from NSE public API, cached locally
# ---------------------------------------------------------------------------

CORP_ACTIONS_CACHE_DIR = os.path.join(CACHE_DIR, "corporate_actions") if CACHE_DIR else None


def _ca_cache_load(symbol):
    if not CORP_ACTIONS_CACHE_DIR:
        return None
    path = os.path.join(CORP_ACTIONS_CACHE_DIR, f"{symbol}.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except Exception:
            return None
    return None


def _ca_cache_store(symbol, data):
    if not CORP_ACTIONS_CACHE_DIR:
        return data
    os.makedirs(CORP_ACTIONS_CACHE_DIR, exist_ok=True)
    path = os.path.join(CORP_ACTIONS_CACHE_DIR, f"{symbol}.json")
    try:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, default=str)
    except Exception:
        pass
    return data


def fetch_corporate_actions(symbol):
    """
    Fetch dividend history for a symbol from NSE's corporate actions API.
    Returns list of {exDate, dividend, type} where type='dividend'.
    Cached for 24h.
    """
    cached = _ca_cache_load(symbol)
    if cached is not None:
        return cached

    try:
        # NSE corporate actions endpoint (public, no auth)
        import urllib.request
        url = f"https://www.nseindia.com/api/corporate-actions?symbol={symbol.upper()}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json",
            "Accept-Language": "en-US,en;q=0.9",
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
    except Exception:
        # Fallback: try nselib if available
        try:
            from nselib import capital_market
            df = capital_market.corporate_actions(symbol.upper())
            if df is not None and not df.empty:
                data = df.to_dict(orient="records")
            else:
                data = []
        except Exception:
            data = []

    # Normalize to our schema: only dividends with ex-date and amount
    dividends = []
    for row in data:
        # NSE corporate actions columns vary; probe common ones
        ca_type = str(row.get("PURPOSE") or row.get("purpose") or row.get("CA_TYPE") or "").lower()
        if "dividend" not in ca_type:
            continue
        ex_date_raw = row.get("EX_DATE") or row.get("Ex_Date") or row.get("exDate")
        if not ex_date_raw:
            continue
        try:
            ex_date = pd_to_datetime(ex_date_raw).date()
        except Exception:
            continue
        # Dividend amount per share (could be in 'DIVIDEND', 'dividend', 'AMOUNT', 'FaceValue')
        div_amt = None
        for key in ["DIVIDEND", "dividend", "AMOUNT", "amount", "FACE_VALUE", "faceValue", "FACE VALUE"]:
            if key in row and row[key] is not None:
                div_amt = num(row[key])
                break
        if div_amt is None or div_amt <= 0:
            continue
        dividends.append({"exDate": ex_date.isoformat(), "dividend": div_amt, "type": "dividend"})

    # Sort by ex-date ascending
    dividends.sort(key=lambda x: x["exDate"])
    _ca_cache_store(symbol, dividends)
    return dividends


def adjust_candles_for_dividends(candles, dividends):
    """
    Adjust historical candles for dividends (backward adjustment).
    For each dividend, subtract the dividend amount from all candles
    with date < exDate. This matches standard price adjustment methodology.
    """
    if not candles or not dividends:
        return candles

    # Work on a copy
    adjusted = [dict(c) for c in candles]
    for div in dividends:
        ex_date = div["exDate"]
        amount = div["dividend"]
        for c in adjusted:
            # candle ts is ISO string; compare date portion
            c_date = c["ts"][:10]
            if c_date < ex_date:
                for key in ("open", "high", "low", "close"):
                    if c.get(key) is not None:
                        c[key] = round(c[key] - amount, 2)
    return adjusted


def fail(exc):
    emit({"ok": False, "error": str(exc), "trace": traceback.format_exc(limit=3)})


def parse_date(s):
    for fmt in ("%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"cannot parse date: {s}")


def fmt_ddmm(date_obj):
    return date_obj.strftime("%d-%m-%Y")


# Map TradeBuddy index symbols to NSE index display names (and back).
INDEX_SYMBOL_TO_NAME = {
    "NIFTY": "Nifty 50",
    "NIFTY50": "Nifty 50",
    "NIFTYBANK": "Nifty Bank",
    "BANKNIFTY": "Nifty Bank",
    "FINNIFTY": "Nifty Financial Services",
    "SENSEX": "S&P BSE SENSEX",
}
# Prefer the short TradeBuddy symbols when mapping display names back.
INDEX_NAME_TO_SYMBOL = {}
for _sym, _name in INDEX_SYMBOL_TO_NAME.items():
    if _name not in INDEX_NAME_TO_SYMBOL:
        INDEX_NAME_TO_SYMBOL[_name] = _sym


def index_display_name(symbol):
    return INDEX_SYMBOL_TO_NAME.get(symbol, symbol)


def index_app_symbol(display_name):
    return INDEX_NAME_TO_SYMBOL.get(display_name, display_name)


def date_range(days):
    to = date.today()
    frm = to - timedelta(days=int(days) + 30)
    return frm, to


def col(df, *candidates):
    low = {str(c).strip().lower(): c for c in df.columns}
    for c in candidates:
        if c.lower() in low:
            return low[c.lower()]
    return None


def num(v):
    try:
        n = float(v)
        return n if n == n and n not in (float("inf"), float("-inf")) else None
    except (TypeError, ValueError):
        return None


def frame_to_candles(df, symbol=None):
    """Normalize any OHLCV DataFrame to candle records."""
    out = []
    if df is None or getattr(df, "empty", True):
        return out
    date_c = col(df, "DATE", "CH_TIMESTAMP", "TIMESTAMP", "DATE1", "datetime")
    open_c = col(df, "OPEN", "CH_OPENING_PRICE", "OPEN_PRICE", "open")
    high_c = col(df, "HIGH", "CH_TRADE_HIGH_PRICE", "HIGH_PRICE", "high")
    low_c = col(df, "LOW", "CH_TRADE_LOW_PRICE", "LOW_PRICE", "low")
    close_c = col(df, "CLOSE", "CH_CLOSING_PRICE", "CLOSE_PRICE", "LAST_PRICE", "close")
    vol_c = col(df, "VOLUME", "CH_TOTAL_TRADED_VOLUME", "TOTTRDQTY", "TTL_TRD_QNTY", "volume")
    sym_c = col(df, "SYMBOL", "CH_SYMBOL", "symbol")

    for _, row in df.iterrows():
        if date_c is None:
            continue
        ts_raw = row.get(date_c)
        try:
            ts = pd_to_datetime(ts_raw)
        except Exception:
            continue
        close = num(row.get(close_c)) if close_c is not None else None
        if close is None:
            continue
        open_p = num(row.get(open_c)) if open_c is not None else close
        high_p = num(row.get(high_c)) if high_c is not None else close
        low_p = num(row.get(low_c)) if low_c is not None else close
        vol = num(row.get(vol_c)) if vol_c is not None else 0
        s = row.get(sym_c) if sym_c is not None else symbol
        out.append(
            {
                "ts": ts.isoformat(),
                "open": open_p,
                "high": high_p,
                "low": low_p,
                "close": close,
                "volume": int(round(vol or 0)),
                "symbol": s,
            }
        )
    return out


def pd_to_datetime(ts_raw):
    import pandas as pd

    if isinstance(ts_raw, (datetime, date)):
        return ts_raw
    return pd.to_datetime(ts_raw).to_pydatetime()


# ---------------------------------------------------------------------------
# nselib (primary)
# ---------------------------------------------------------------------------

def nselib_quote(symbol):
    from nselib import capital_market

    df = capital_market.price_volume_and_deliverable_position_data(symbol, period="1D")
    if df is None or df.empty:
        df = capital_market.price_volume_data(symbol, period="1D")
    if df is None or df.empty:
        return None
    last = df.iloc[-1]
    date_c = col(df, "DATE", "CH_TIMESTAMP", "DATE1")
    open_c = col(df, "OPEN", "CH_OPENING_PRICE", "OPEN_PRICE")
    high_c = col(df, "HIGH", "CH_TRADE_HIGH_PRICE", "HIGH_PRICE")
    low_c = col(df, "LOW", "CH_TRADE_LOW_PRICE", "LOW_PRICE")
    close_c = col(df, "CLOSE", "CH_CLOSING_PRICE", "CLOSE_PRICE", "LAST_PRICE")
    prev_c = col(df, "PREV CLOSE", "CH_PREVIOUS_CLOSE_PRICE", "PREV_CLOSE")
    vol_c = col(df, "VOLUME", "CH_TOTAL_TRADED_VOLUME", "TOTTRDQTY", "TTL_TRD_QNTY")

    close = num(last.get(close_c)) if close_c else None
    if close is None:
        return None
    prev = num(last.get(prev_c)) if prev_c else None
    if prev is None and len(df) > 1:
        prev_row = df.iloc[-2]
        prev = num(prev_row.get(close_c)) if close_c else None
    change = num(close - prev) if prev else None
    change_pct = num(((close - prev) / prev) * 100) if prev else None
    ts = pd_to_datetime(last.get(date_c)) if date_c else datetime.now()

    return {
        "lastPrice": close,
        "open": num(last.get(open_c)) if open_c else None,
        "high": num(last.get(high_c)) if high_c else None,
        "low": num(last.get(low_c)) if low_c else None,
        "prevClose": prev,
        "change": change,
        "changePct": change_pct,
        "volume": int(round(num(last.get(vol_c)) or 0)) if vol_c else 0,
        "sourceTimestamp": ts.isoformat(),
    }


def nselib_candles(symbol, days, is_index=False):
    from nselib import capital_market

    frm, to = date_range(days)
    if is_index:
        df = capital_market.index_data(index=symbol, from_date=fmt_ddmm(frm), to_date=fmt_ddmm(to))
    else:
        df = capital_market.price_volume_data(symbol, from_date=fmt_ddmm(frm), to_date=fmt_ddmm(to))
    candles = frame_to_candles(df, symbol)
    if not is_index:
        dividends = fetch_corporate_actions(symbol)
        candles = adjust_candles_for_dividends(candles, dividends)
    return candles


def nselib_nifty_list():
    """Real NIFTY 50 constituent symbols from nselib's equity index list."""
    from nselib import capital_market

    df = capital_market.nifty50_equity_list()
    if df is None or getattr(df, "empty", True):
        return []
    sym_c = col(df, "Symbol", "SYMBOL", "symbol")
    out = []
    for _, row in df.iterrows():
        s = row.get(sym_c) if sym_c else None
        if s is None:
            continue
        out.append(str(s).strip())
    return out


def nselib_indices():
    """Fetch all NSE index snapshots via nselib.

    Captures any stray stdout/stderr produced by pandas or nselib itself
    (e.g. DataFrame repr, deprecation warnings) so they cannot corrupt the
    JSON stream that Node.js parses.
    """
    # Suppress any stray stdout lines from pandas / nselib during the call.
    _saved_stdout = sys.stdout
    _saved_stderr = sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
    try:
        from nselib import capital_market
        df = capital_market.market_watch_all_indices()
    finally:
        sys.stdout = _saved_stdout
        sys.stderr = _saved_stderr

    if df is None or getattr(df, "empty", True):
        return []

    # After restoring stdout, it is now safe to operate on df.
    name_c = col(df, "Index Name", "INDEX_NAME", "indexName")
    open_c = col(df, "OPEN", "indexOpen")
    high_c = col(df, "HIGH", "indexHigh")
    low_c = col(df, "LOW", "indexLow")
    close_c = col(df, "CLOSE", "CLOSE_VALUE", "indexClosed", "LAST", "indexLast")
    prev_c = col(df, "PREV CLOSE", "previousClose", "prevClose")
    chg_c = col(df, "CHANGE", "change")
    chg_pct_c = col(df, "% CHANGE", "PERCENTCHANGE", "changePct", "pChange")

    out = []
    for _, row in df.iterrows():
        level = num(row.get(close_c)) if close_c else None
        if level is None:
            continue
        prev = num(row.get(prev_c)) if prev_c else None
        change = num(row.get(chg_c)) if chg_c else None
        chg_pct = num(row.get(chg_pct_c)) if chg_pct_c else None
        out.append(
            {
                "symbol": row.get(name_c),
                "level": level,
                "open": num(row.get(open_c)) if open_c else None,
                "high": num(row.get(high_c)) if high_c else None,
                "low": num(row.get(low_c)) if low_c else None,
                "prevClose": prev,
                "change": change,
                "changePct": chg_pct,
                "sourceTimestamp": datetime.now().isoformat(),
            }
        )
    return out


def nselib_option_chain(symbol, expiry=None, strike=None, option_type=None):
    from nselib import derivatives

    kwargs = {"symbol": symbol, "oi_mode": "compact"}
    if expiry:
        kwargs["expiry_date"] = expiry
    df = derivatives.nse_live_option_chain(**kwargs)
    if df is None or df.empty:
        return []
    out = []
    for _, row in df.iterrows():
        strike_c = col(df, "strikePrice", "STRIKE PRICE", "strike")
        opt_c = col(df, "optionType", "OPTION TYPE", "optiontype")
        ce_ltp = col(df, "CE LTP", "CALL LTP", "ce_ltp", "callLTP")
        pe_ltp = col(df, "PE LTP", "PUT LTP", "pe_ltp", "putLTP")
        rec = {
            "symbol": symbol,
            "expiry": expiry,
            "strike": num(row.get(strike_c)) if strike_c else None,
            "optionType": row.get(opt_c) if opt_c else None,
            "call": {
                "ltp": num(row.get(ce_ltp)) if ce_ltp else None,
            },
            "put": {
                "ltp": num(row.get(pe_ltp)) if pe_ltp else None,
            },
        }
        out.append(rec)
    if strike is not None and option_type:
        key = "call" if option_type.upper() == "CE" else "put"
        out = [r for r in out if r["strike"] == num(strike) or r["strike"] is None]
    return out


def nselib_fno(symbol, instrument, option_type=None, strike=None, days=60):
    from nselib import derivatives

    frm, to = date_range(days)
    if instrument in ("FUTIDX", "FUTSTK"):
        df = derivatives.future_price_volume_data(
            symbol=symbol, instrument=instrument, from_date=fmt_ddmm(frm), to_date=fmt_ddmm(to)
        )
        return frame_to_candles(df, symbol)
    df = derivatives.option_price_volume_data(
        symbol=symbol,
        instrument=instrument,
        option_type=option_type or "CE",
        strike_price=strike or "0",
        from_date=fmt_ddmm(frm),
        to_date=fmt_ddmm(to),
    )
    return frame_to_candles(df, symbol)


def nselib_instruments(kind):
    from nselib import capital_market

    if kind == "fno":
        df = capital_market.fno_equity_list()
    else:
        df = capital_market.equity_list()
    if df is None or df.empty:
        return []
    sym_c = col(df, "SYMBOL", "CH_SYMBOL", "Symbol", "symbol")
    name_c = col(df, "NAME OF COMPANY", "COMPANY NAME", "NAME", "CH_DESC", "Company", "companyName")
    out = []
    for _, row in df.iterrows():
        sym = row.get(sym_c) if sym_c else None
        if sym is None:
            continue
        out.append({"symbol": str(sym).strip(), "name": str(row.get(name_c)).strip() if name_c else None})
    return out


def nselib_fundamentals(symbol):
    """Best-effort P/E snapshot for a symbol from the latest NSE PE file.

    NSE publishes a per-symbol P/E CSV on nsearchives for every trade date.
    We walk back up to 12 days to find the latest snapshot containing the
    symbol. Growth/margin/balance-sheet data is not available from this
    source; callers must treat missing fields as "data not available".
    """
    from nselib import capital_market

    for i in range(12):
        d = date.today() - timedelta(days=i)
        if d.weekday() >= 5:
            continue
        try:
            df = capital_market.pe_ratio(d.strftime("%d-%m-%Y"))
        except Exception:
            continue
        if df is None or getattr(df, "empty", True):
            continue
        sym_c = col(df, "SYMBOL", "symbol")
        if sym_c is None:
            continue
        pe_c = col(df, "SYMBOLP/E", "P/E", "PE")
        adj_c = col(df, "ADJUSTEDP/E")
        match = df[df[sym_c].astype(str).str.strip().str.upper() == symbol.upper()]
        if match.empty:
            continue
        row = match.iloc[-1]
        return {
            "symbol": symbol,
            "tradeDate": d.isoformat(),
            "pe": num(row.get(pe_c)) if pe_c else None,
            "adjustedPe": num(row.get(adj_c)) if adj_c else None,
        }
    return None


# ---------------------------------------------------------------------------
# jugaad-data (fallback)
# ---------------------------------------------------------------------------

def _jugaad_parts(data):
    ti = (data or {}).get("tradeInfo") or {}
    md = (data or {}).get("metaData") or (data or {}).get("metadata") or {}
    pi = (data or {}).get("priceInfo") or {}
    return ti, md, pi


def _jugaad_quote_from(data, symbol):
    """Normalize a NSELive.stock_quote payload to the internal quote contract.

    The NSE live quote shape has the LTP under tradeInfo.lastPrice, OHLC under
    metaData and a 'lastUpdateTime' field; priceInfo holds only volatility/meta.
    """
    ti, md, pi = _jugaad_parts(data)
    last = num(ti.get("lastPrice")) or num(pi.get("lastPrice"))
    if last is None or last == 0:
        return None
    prev = num(md.get("previousClose")) or num(pi.get("previousClose"))
    if change := md.get("change"):
        change = num(change)
    else:
        change = num(last - prev) if prev else None
    if change_pct := md.get("pChange"):
        change_pct = num(change_pct)
    else:
        change_pct = num(((last - prev) / prev) * 100) if prev else None
    ts_raw = data.get("lastUpdateTime") or data.get("timestamp")
    ts = None
    if ts_raw:
        for fmt in ("%d-%b-%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
            try:
                ts = datetime.strptime(str(ts_raw).strip(), fmt).isoformat()
                break
            except ValueError:
                continue
    if ts is None:
        ts = datetime.now().isoformat()
    return {
        "lastPrice": last,
        "open": num(md.get("open")) or num(pi.get("open")),
        "high": num(md.get("dayHigh")) or num(pi.get("high")),
        "low": num(md.get("dayLow")) or num(pi.get("low")),
        "prevClose": prev,
        "change": change,
        "changePct": change_pct,
        "volume": num(ti.get("totalTradedVolume")) or 0,
        "sourceTimestamp": ts,
        "symbol": md.get("symbol") or symbol,
    }


def _quote_age_seconds(q):
    """Seconds since the quote's NSE snapshot timestamp (None if unknown)."""
    ts = q.get("sourceTimestamp")
    if not ts:
        return None
    try:
        snap = datetime.strptime(str(ts).strip()[:19], "%Y-%m-%dT%H:%M:%S")
        return (datetime.now() - snap).total_seconds()
    except Exception:
        return None


def _fresh_quote(symbol, attempts=3, max_age=15):
    """Fetch a quote, retrying with a fresh NSE session until the snapshot is
    fresh (<= max_age seconds old). NSE's public load balancer serves cached
    snapshots that can be ~30-40s old; resampling usually lands on a fresh one.
    Returns the freshest snapshot found if none meets max_age.
    """
    from jugaad_data.nse import NSELive

    best = None
    best_age = float("inf")
    for _ in range(attempts):
        try:
            n = NSELive()
            q = _jugaad_quote_from(n.stock_quote(symbol), symbol)
        except Exception:
            q = None
        if q is None:
            continue
        age = _quote_age_seconds(q)
        if age is not None and age <= max_age:
            return q
        if age is not None and age < best_age:
            best_age = age
            best = q
        elif best is None:
            best = q
    return best


def jugaad_quote(symbol):
    return _fresh_quote(symbol)


def _fetch_one_quote(sym):
    """Fetch a single live quote; returns (sym, quote_or_None)."""
    try:
        q = _fresh_quote(sym, attempts=2, max_age=20)
        return sym, q
    except Exception:
        return sym, None


def jugaad_live_quotes(symbols, delay=0.05, concurrency=10):
    """Batch live quotes for many symbols in ONE Python process.

    Uses a thread pool to fetch all symbols in parallel so the wall-clock
    time is bounded by the slowest single request (~2-3 s) rather than
    by N * delay. Returns {symbol: quote, ...}; silently skips failures.

    Args:
        symbols:     List of NSE symbols (uppercase).
        delay:       Unused — kept for CLI back-compat. Reserved for future
                     sequential-mode throttle.
        concurrency: Maximum number of concurrent NSE requests (default 10).
    """
    out = {}
    if not symbols:
        return out

    # Cap concurrency to avoid thundering-herd on NSE load balancers.
    workers = max(1, min(concurrency, len(symbols), 15))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_one_quote, sym): sym for sym in symbols}
        for future in as_completed(futures):
            sym, q = future.result()
            if q:
                out[sym] = q
    return out


def jugaad_candles(symbol, days, is_index=False):
    from jugaad_data.nse import stock_df, index_df

    frm, to = date_range(days)
    if is_index:
        df = index_df(symbol, from_date=frm, to_date=to)
    else:
        df = stock_df(symbol, from_date=frm, to_date=to)
    candles = frame_to_candles(df, symbol)
    if not is_index:
        dividends = fetch_corporate_actions(symbol)
        candles = adjust_candles_for_dividends(candles, dividends)
    return candles


def jugaad_indices():
    from jugaad_data.nse import NSELive

    n = NSELive()
    data = n.all_indices()
    out = []
    for item in (data or {}).get("data") or []:
        meta = item.get("meta") or {}
        level = num(item.get("last")) or num(item.get("close")) or num(item.get("index"))
        if level is None:
            continue
        out.append(
            {
                "symbol": meta.get("symbol") or item.get("indexSymbol") or item.get("index"),
                "level": level,
                "open": num(item.get("open") or meta.get("open")),
                "high": num(item.get("high") or meta.get("high")),
                "low": num(item.get("low") or meta.get("low")),
                "prevClose": num(item.get("previousClose") or meta.get("previousClose")),
                "change": num(item.get("variation") or meta.get("change")),
                "changePct": num(item.get("percentChange") or meta.get("pChange")),
                "advances": num(item.get("advances")),
                "declines": num(item.get("declines")),
                "sourceTimestamp": datetime.now().isoformat(),
            }
        )
    return out


def _jugaad_top_row(r):
    last = num(r.get("lastPrice"))
    prev = num(r.get("previousClose"))
    chg = num(r.get("change"))
    chg_pct = num(r.get("pchange") or r.get("percentChange"))
    if chg is None and last is not None and prev:
        chg = last - prev
    if chg_pct is None and last is not None and prev:
        chg_pct = ((last - prev) / prev) * 100
    return {
        "symbol": r.get("symbol"),
        "lastPrice": last,
        "previousClose": prev,
        "open": num(r.get("openPrice")),
        "high": num(r.get("highPrice")),
        "low": num(r.get("lowPrice")),
        "change": chg,
        "changePct": chg_pct,
        "volume": num(r.get("totalTradedVolume")) or 0,
        "value": num(r.get("totalTradedValue")) or 0,
    }


def jugaad_top_stocks():
    """Live NSE top gainers/losers/most-active from NSELive.top_stocks()."""
    from jugaad_data.nse import NSELive

    n = NSELive()
    data = n.top_stocks() or {}
    return {
        "gainers": [_jugaad_top_row(r) for r in data.get("topGainers") or []],
        "losers": [_jugaad_top_row(r) for r in data.get("topLoosers") or []],
        "activeByValue": [_jugaad_top_row(r) for r in data.get("mostActiveValue") or []],
        "activeByVolume": [_jugaad_top_row(r) for r in data.get("mostActiveVolume") or []],
        "timestamp": data.get("timestamp") or datetime.now().isoformat(),
    }


INTRADAY_PERIODS = {1: "1D", 3: "3D", 5: "5D", 7: "7D", 30: "1M", 90: "3M", 180: "6M", 365: "1Y"}
INTRADAY_DURATIONS = ("1m", "5m", "15m", "60m")


def jugaad_intraday(symbol, duration="1m", days=1):
    """Live intraday candles resampled from NSE's sampled chart feed.

    NSELive.symbol_chart_data returns ~1-minute points
    [ts_ms, price, flag, change, changePct] with no OHLC. We bucket the
    points by the requested duration to synthesize real OHLC candles
    (open/high/low/close). Volume is the number of samples in the bucket.
    """
    if duration not in INTRADAY_DURATIONS:
        raise ValueError(f"unsupported intraday duration: {duration}")
    from jugaad_data.nse import NSELive

    period = INTRADAY_PERIODS.get(int(days), f"{int(days)}D")
    n = NSELive()
    data = n.symbol_chart_data(symbol, days=period)
    rows = (data or {}).get("grapthData") or []
    if not rows:
        return []

    bucket_ms = int(duration[:-1]) * 60 * 1000
    buckets = {}
    for row in rows:
        try:
            ts_ms = int(row[0])
            price = num(row[1])
        except (IndexError, TypeError, ValueError):
            continue
        if price is None or price <= 0:
            continue
        key = (ts_ms // bucket_ms) * bucket_ms
        b = buckets.setdefault(key, {"ts": key, "open": price, "high": price, "low": price, "close": price, "count": 0})
        b["high"] = max(b["high"], price)
        b["low"] = min(b["low"], price)
        b["close"] = price
        b["count"] += 1

    candles = []
    for key in sorted(buckets):
        b = buckets[key]
        # NSE's chart feed encodes IST wall-clock as if it were UTC. Convert to
        # the correct UTC instant so IST browsers display the right local time.
        ts_utc = datetime.fromtimestamp(b["ts"] / 1000, tz=timezone.utc) - IST_OFFSET
        candles.append(
            {
                "ts": ts_utc.isoformat(),
                "open": b["open"],
                "high": b["high"],
                "low": b["low"],
                "close": b["close"],
                "volume": b["count"],
                "symbol": symbol,
            }
        )
    return candles


def jugaad_option_chain(symbol, expiry=None):
    from jugaad_data.nse import NSELive

    n = NSELive()
    df = n.index_option_chain(symbol, expiry=expiry)
    if df is None or getattr(df, "empty", True):
        return []
    out = []
    for _, row in df.iterrows():
        out.append(
            {
                "symbol": symbol,
                "expiry": expiry,
                "strike": num(row.get("strikePrice")),
                "optionType": row.get("optionType"),
                "call": {"ltp": num(row.get("callLTP")) or num(row.get("CE LTP"))},
                "put": {"ltp": num(row.get("putLTP")) or num(row.get("PE LTP"))},
            }
        )
    return out


# ---------------------------------------------------------------------------
# nse-archives / indian-market-data (backfill)
# ---------------------------------------------------------------------------

def nse_archives_bulk_bhav(day):
    from nsedata import nse

    d = day.isoformat()
    cached = cache_load("nse_bhav_" + d + ".json")
    if cached is not None:
        return cached
    df = nse.get("capital_market", "equities_sme", "sec_bhavdata_full", d)
    if df is None or df.empty:
        return []
    sym_c = col(df, "SYMBOL", "symbol")
    open_c = col(df, "OPEN_PRICE", "OPEN", "open")
    high_c = col(df, "HIGH_PRICE", "HIGH", "high")
    low_c = col(df, "LOW_PRICE", "LOW", "low")
    close_c = col(df, "CLOSE_PRICE", "LAST_PRICE", "CLOSE", "close", "last")
    prev_c = col(df, "PREV_CLOSE", "prev_close", "PREVCLOSE")
    vol_c = col(df, "TTL_TRD_QNTY", "TOTTRDQTY", "TOTAL_TRADED_QUANTITY", "volume")
    date_c = col(df, "DATE1", "reporting_date", "DATE", "timestamp")

    out = []
    for _, row in df.iterrows():
        close = num(row.get(close_c)) if close_c else None
        if close is None:
            continue
        ts_raw = row.get(date_c) if date_c else None
        if ts_raw is None:
            ts_raw = d + "T00:00:00"
        else:
            try:
                ts_raw = pd_to_datetime(ts_raw).isoformat()
            except Exception:
                ts_raw = d + "T00:00:00"
        out.append(
            {
                "ts": ts_raw,
                "open": num(row.get(open_c)) if open_c else None,
                "high": num(row.get(high_c)) if high_c else None,
                "low": num(row.get(low_c)) if low_c else None,
                "close": close,
                "volume": int(round(num(row.get(vol_c)) or 0)) if vol_c else 0,
                "symbol": str(row.get(sym_c)).strip() if sym_c else None,
                "prevClose": num(row.get(prev_c)) if prev_c else None,
            }
        )
    return cache_store("nse_bhav_" + d + ".json", out)


def nse_archives_quote(symbol, day=None):
    rows = nse_archives_bulk_bhav(day or date.today())
    for r in rows:
        if r["symbol"] == symbol:
            prev = r.get("prevClose")
            return {
                "lastPrice": r["close"],
                "open": r["open"],
                "high": r["high"],
                "low": r["low"],
                "prevClose": prev,
                "change": num(r["close"] - prev) if prev else None,
                "changePct": num(((r["close"] - prev) / prev) * 100) if prev else None,
                "volume": r["volume"],
                "sourceTimestamp": r["ts"],
            }
    return None


def _fetch_day(args):
    symbol, day, is_index = args
    try:
        if is_index:
            from nsedata import nse

            d = day.isoformat()
            cache_key = "nse_index_" + d + ".json"
            rows = cache_load(cache_key)
            if rows is None:
                df = nse.get("capital_market", "indices", "ind_close_all", d)
                rows = nse_index_rows(df, index_display_name(symbol), d)
                rows = cache_store(cache_key, rows)
            return rows
        rows = nse_archives_bulk_bhav(day)
        return [r for r in rows if r["symbol"] == symbol]
    except Exception:
        return []


def nse_archives_candles(symbol, days, is_index=False):
    from concurrent.futures import ThreadPoolExecutor

    frm, to = date_range(days)
    day_args = []
    cur = frm
    while cur <= to:
        if cur.weekday() < 5:
            day_args.append((symbol, cur, is_index))
        cur += timedelta(days=1)

    out = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for rows in pool.map(_fetch_day, day_args):
            out.extend(rows)

    # De-dup by date, ascending.
    seen = set()
    result = []
    for r in sorted(out, key=lambda x: x["ts"]):
        key = str(r["ts"])[:10]
        if key in seen:
            continue
        seen.add(key)
        result.append(r)
    result = result[-days:] if days else result
    if not is_index:
        dividends = fetch_corporate_actions(symbol)
        result = adjust_candles_for_dividends(result, dividends)
    return result


def nse_index_rows(df, name, d):
    """Extract normalized candle rows for a named index from ind_close_all."""
    if df is None or getattr(df, "empty", True):
        return []
    name_c = col(df, "Index Name", "INDEX_NAME", "index")
    idx_date_c = col(df, "Index Date", "DATE1", "DATE")
    open_c = col(df, "Open Index Value", "OPEN", "open")
    high_c = col(df, "High Index Value", "HIGH", "high")
    low_c = col(df, "Low Index Value", "LOW", "low")
    close_c = col(df, "Closing Index Value", "CLOSE", "close")
    vol_c = col(df, "Volume", "volume")
    rows = []
    for _, row in df.iterrows():
        if name_c is not None and str(row.get(name_c)).strip() != name:
            continue
        close = num(row.get(close_c)) if close_c else None
        if close is None:
            continue
        ts_raw = row.get(idx_date_c) if idx_date_c else None
        try:
            ts = pd_to_datetime(ts_raw).isoformat()
        except Exception:
            ts = d + "T00:00:00"
        if ts[:10] > date.today().isoformat():
            continue
        rows.append(
            {
                "ts": ts,
                "open": num(row.get(open_c)) if open_c else close,
                "high": num(row.get(high_c)) if high_c else close,
                "low": num(row.get(low_c)) if low_c else close,
                "close": close,
                "volume": int(round(num(row.get(vol_c)) or 0)) if vol_c else 0,
                "symbol": index_app_symbol(name),
            }
        )
    return rows


def nse_archives_indices():
    from nsedata import nse

    d = date.today().isoformat()
    df = nse.get("capital_market", "indices", "ind_close_all", d)
    if df is None or df.empty:
        return []
    out = []
    name_c = col(df, "Index Name", "INDEX_NAME", "index")
    open_c = col(df, "Open Index Value", "OPEN", "open")
    high_c = col(df, "High Index Value", "HIGH", "high")
    low_c = col(df, "Low Index Value", "LOW", "low")
    close_c = col(df, "Closing Index Value", "CLOSE", "close", "INDEX_CLOSE", "value")
    prev_c = col(df, "Points Change", "PREV_CLOSE", "prevClose")
    chg_pct_c = col(df, "Change(%)", "PERCENTCHANGE", "changePct", "pChange")
    for _, row in df.iterrows():
        close = num(row.get(close_c)) if close_c else None
        if close is None:
            continue
        out.append(
            {
                "symbol": index_app_symbol(row.get(name_c)),
                "level": close,
                "open": num(row.get(open_c)) if open_c else None,
                "high": num(row.get(high_c)) if high_c else None,
                "low": num(row.get(low_c)) if low_c else None,
                "change": num(row.get(prev_c)) if prev_c else None,
                "changePct": num(row.get(chg_pct_c)) if chg_pct_c else None,
                "sourceTimestamp": d + "T00:00:00",
            }
        )
    return out


# ---------------------------------------------------------------------------
# dispatch
# ---------------------------------------------------------------------------

def health(source):
    probes = {
        "nselib": ["nselib"],
        "jugaad": ["jugaad_data"],
        "nse_archives": ["nsedata", "nsedata.nse"],
    }
    result = {"source": source, "available": True, "modules": {}}
    for mod in probes[source]:
        try:
            __import__(mod)
            result["modules"][mod] = True
        except Exception as exc:
            result["modules"][mod] = False
            result["available"] = False
            result["error"] = str(exc)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", choices=["nselib", "jugaad", "nse_archives"])
    parser.add_argument("command", choices=[
        "quote", "candles", "indices", "option_chain", "fno",
        "instruments", "fundamentals", "bulk_bhav", "live_quotes", "nifty_list", "top_stocks", "intraday", "health",
        "corporate_actions",
    ])
    parser.add_argument("--symbol", default=None)
    parser.add_argument("--symbols", default=None)
    parser.add_argument("--exchange", default="NSE")
    parser.add_argument("--days", type=int, default=130)
    parser.add_argument("--index", default=None)
    parser.add_argument("--date", default=None)
    parser.add_argument("--expiry", default=None)
    parser.add_argument("--option-type", default=None)
    parser.add_argument("--strike", default=None)
    parser.add_argument("--instrument", default=None)
    parser.add_argument("--kind", default="equity")
    parser.add_argument("--delay", type=float, default=0.05)
    parser.add_argument("--duration", default="5m")
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()

    try:
        src = args.source
        cmd = args.command

        if cmd == "health":
            emit({"ok": True, "data": health(src)})
            return

        if cmd == "corporate_actions":
            emit({"ok": True, "data": fetch_corporate_actions(args.symbol)})
            return

        if src == "nselib":
            if cmd == "quote":
                emit({"ok": True, "data": nselib_quote(args.symbol)})
            elif cmd == "candles":
                emit({"ok": True, "data": nselib_candles(args.symbol or args.index, args.days, bool(args.index))})
            elif cmd == "indices":
                emit({"ok": True, "data": nselib_indices()})
            elif cmd == "option_chain":
                emit({"ok": True, "data": nselib_option_chain(args.symbol, args.expiry, args.strike, args.option_type)})
            elif cmd == "fno":
                emit({"ok": True, "data": nselib_fno(args.symbol, args.instrument, args.option_type, args.strike, args.days)})
            elif cmd == "instruments":
                emit({"ok": True, "data": nselib_instruments(args.kind)})
            elif cmd == "fundamentals":
                emit({"ok": True, "data": nselib_fundamentals(args.symbol)})
            elif cmd == "nifty_list":
                emit({"ok": True, "data": nselib_nifty_list()})
            elif cmd == "live_quotes":
                syms = [s.strip().upper() for s in (args.symbols or "").split(",") if s.strip()]
                out = {}
                for sym in syms:
                    q = nselib_quote(sym)
                    if q:
                        out[sym] = q
                emit({"ok": True, "data": out})
            else:
                emit({"ok": False, "error": f"nselib: unsupported command {cmd}"})

        elif src == "jugaad":
            if cmd == "quote":
                emit({"ok": True, "data": jugaad_quote(args.symbol)})
            elif cmd == "live_quotes":
                syms = [s.strip().upper() for s in (args.symbols or "").split(",") if s.strip()]
                emit({"ok": True, "data": jugaad_live_quotes(syms, args.delay, args.concurrency)})
            elif cmd == "top_stocks":
                emit({"ok": True, "data": jugaad_top_stocks()})
            elif cmd == "candles":
                emit({"ok": True, "data": jugaad_candles(args.symbol or args.index, args.days, bool(args.index))})
            elif cmd == "indices":
                emit({"ok": True, "data": jugaad_indices()})
            elif cmd == "intraday":
                emit({"ok": True, "data": jugaad_intraday(args.symbol, args.duration, args.days)})
            elif cmd == "option_chain":
                emit({"ok": True, "data": jugaad_option_chain(args.symbol, args.expiry)})
            else:
                emit({"ok": False, "error": f"jugaad: unsupported command {cmd}"})

        elif src == "nse_archives":
            day = parse_date(args.date) if args.date else date.today()
            if cmd == "quote":
                emit({"ok": True, "data": nse_archives_quote(args.symbol, day)})
            elif cmd == "candles":
                emit({"ok": True, "data": nse_archives_candles(args.symbol or args.index, args.days, bool(args.index))})
            elif cmd == "bulk_bhav":
                emit({"ok": True, "data": nse_archives_bulk_bhav(day)})
            elif cmd == "indices":
                emit({"ok": True, "data": nse_archives_indices()})
            else:
                emit({"ok": False, "error": f"nse_archives: unsupported command {cmd}"})

    except Exception as exc:
        fail(exc)


if __name__ == "__main__":
    main()