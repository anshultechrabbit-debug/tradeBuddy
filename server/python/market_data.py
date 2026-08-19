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
import json
import os
import sys
import traceback
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
    return frame_to_candles(df, symbol)


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
    from nselib import capital_market

    df = capital_market.market_watch_all_indices()
    if df is None or df.empty:
        return []
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


def jugaad_quote(symbol):
    from jugaad_data.nse import NSELive

    n = NSELive()
    q = _jugaad_quote_from(n.stock_quote(symbol), symbol)
    # NSE's public cache occasionally serves an old snapshot; if the quote's
    # lastUpdateTime is much older than now, re-request once to stay fresh.
    if q and q.get("sourceTimestamp"):
        try:
            ts = datetime.strptime(str(q["sourceTimestamp"]).strip()[:19], "%Y-%m-%dT%H:%M:%S")
            if datetime.now() - ts > timedelta(seconds=20):
                q = _jugaad_quote_from(n.stock_quote(symbol), symbol)
        except Exception:
            pass
    return q


def jugaad_live_quotes(symbols, delay=0.1):
    """Batch live quotes for many symbols in ONE Python process (one NSE session).

    Loops NSELive.stock_quote with a small inter-request delay so NSE is not
    hammered. Returns {symbol: quote, ...} and silently skips failures.
    """
    import time as _time

    from jugaad_data.nse import NSELive

    n = NSELive()
    out = {}
    for sym in symbols:
        try:
            q = _jugaad_quote_from(n.stock_quote(sym), sym)
            if q:
                out[sym] = q
        except Exception:
            pass
        if delay > 0:
            _time.sleep(delay)
    return out


def jugaad_candles(symbol, days, is_index=False):
    from jugaad_data.nse import stock_df, index_df

    frm, to = date_range(days)
    if is_index:
        df = index_df(symbol, from_date=frm, to_date=to)
    else:
        df = stock_df(symbol, from_date=frm, to_date=to)
    return frame_to_candles(df, symbol)


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
    return result[-days:] if days else result


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
        "instruments", "bulk_bhav", "live_quotes", "nifty_list", "top_stocks", "intraday", "health",
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
    parser.add_argument("--delay", type=float, default=0.1)
    parser.add_argument("--duration", default="5m")
    args = parser.parse_args()

    try:
        src = args.source
        cmd = args.command

        if cmd == "health":
            emit({"ok": True, "data": health(src)})
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
            elif cmd == "nifty_list":
                emit({"ok": True, "data": nselib_nifty_list()})
            else:
                emit({"ok": False, "error": f"nselib: unsupported command {cmd}"})

        elif src == "jugaad":
            if cmd == "quote":
                emit({"ok": True, "data": jugaad_quote(args.symbol)})
            elif cmd == "live_quotes":
                syms = [s.strip().upper() for s in (args.symbols or "").split(",") if s.strip()]
                emit({"ok": True, "data": jugaad_live_quotes(syms, args.delay)})
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