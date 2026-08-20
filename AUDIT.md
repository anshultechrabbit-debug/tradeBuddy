# TradeBuddy MVP — Full Codebase Audit

Date: 2026-08-20 · Mode: READ-ONLY (no files modified)
Config active: `BROKER_PROVIDER=mock`, `MARKET_DATA_PROVIDER=development`, `MARKET_DATA_MODE=external` (real NSE data), `NOTIFICATION_PROVIDER=development`

---

## Status Legend

- ✅ COMPLETE — implemented, real data, real-time (where required), end-to-end
- 🟡 PARTIAL — implemented but has missing pieces / mock data / dead features
- 🔴 NOT IMPLEMENTED — stub / placeholder only
- ⚠️ IMPLEMENTED BUT NOT REAL-TIME — works but data is delayed/cached/on-demand
- ❌ BROKEN — shipped flow fails

---

## Module Status Table

| Module | Frontend | Backend | Database | Real Data | Real-Time | End-to-End | Status |
|---|---|---|---|---|---|---|---|
| **1. Connections & DPDP** | 🟡 | ✅ | ✅ | ❌ | ❌ | 🟡 | 🟡 PARTIAL |
| **2. Dashboard** | ✅ | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ COMPLETE |
| **3. Opportunity Radar** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE |
| **4. Portfolio Intelligence** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | 🟡 PARTIAL |
| **5. Watchlist** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE |
| **6. AI Strategy Router** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE |
| **7. Alerts** | 🟡 | 🟡 | ✅ | 🟡 | ❌ | ❌ | ❌ BROKEN |
| **8. Trade Journal** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | 🟡 PARTIAL |
| **9. Settings** | 🟡 | ✅ | ✅ | n/a | n/a | 🟡 | 🟡 PARTIAL |
| **10. User Management** | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ COMPLETE |
| **11. System Health** | ✅ | 🟡 | ✅ | 🟡 | ❌ | 🟡 | 🟡 PARTIAL |
| **12. Broker Connection Monitoring** | ✅ | 🟡 | ✅ | 🟡 | ❌ | 🟡 | 🟡 PARTIAL |
| **13. DPDP Compliance Dashboard** | ✅ | 🟡 | ✅ | ✅ | ❌ | 🟡 | 🟡 PARTIAL |
| **14. Scan Universe Management** | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ COMPLETE |
| **15. Authentication** | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | ✅ COMPLETE |
| **16. Zerodha integration** | 🔴 | 🔴 | n/a | 🔴 | ❌ | ❌ | 🔴 NOT IMPLEMENTED |
| **17. Upstox integration** | 🔴 | 🔴 | n/a | 🔴 | ❌ | ❌ | 🔴 NOT IMPLEMENTED |
| **18. Market data integration** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE |
| **19. Real-time WebSocket/REST data** | ✅ | ⚠️ | 🟡 | ✅ | ⚠️ | ✅ | ⚠️ NOT REAL-TIME |
| **20. Technical/feature engine** | ✅ | ✅ | n/a | ✅ | n/a | ✅ | ✅ COMPLETE |
| **21. News/sentiment engine** | ✅ | ✅ | n/a | 🟡 | ✅ | ✅ | 🟡 PARTIAL |
| **22. Radar/scoring engine** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ COMPLETE |
| **23. Notification service** | 🟡 | 🟡 | ✅ | 🟡 | ❌ | 🟡 | 🟡 PARTIAL |
| **24. Database/data integrity** | n/a | ✅ | ✅ | ✅ | n/a | ✅ | ✅ COMPLETE |

---

## Summary Counts

1. **TOTAL MODULES:** 24
2. **COMPLETED:** 11 (Dashboard, Opportunity Radar, Watchlist, AI Strategy Router, User Management, Scan Universe Mgmt, Authentication, Market Data Integration, Technical Engine, Radar/Scoring Engine, Database)
3. **PARTIAL:** 9 (Connections & DPDP, Portfolio Intelligence, Trade Journal, Settings, System Health, Broker Monitoring, DPDP Dashboard, News/Sentiment, Notification Service)
4. **NOT IMPLEMENTED:** 2 (Zerodha, Upstox)
5. **BROKEN:** 1 (Alerts)
6. **NOT REAL-TIME:** 1 (WebSocket/REST data — HTTP polling only, no push)

---

## Mock / Hardcoded Data Found

1. **Mock broker portfolio** — `server/src/providers/broker/MockBrokerProvider.js:5-16` `DEFAULT_PORTFOLIO` (RELIANCE, TCS, HDFCBANK…) + seeded-random noise holdings `:98-113`, orders `:136-164`, funds `:185-203`.
2. **Mock broker tokens** — `MockBrokerProvider.js:57-67` `mock-access-<time>` / `mock-refresh-<time>`, 30-day expiry.
3. **Hardcoded bid/ask spread** — `RealDevelopmentMarketDataProvider.js:182-183` `bid = lastPrice - 0.1`, `ask = lastPrice + 0.1` (not real market depth).
4. **News sentiment keyword lists** — `newsService.js:12-31` hardcoded POSITIVE/NEGATIVE word lists; heuristic classification, not an LLM.
5. **Synthetic price generator** — `development/priceGen.js` deterministic fake OHLCV (only reachable if `MARKET_DATA_MODE=synthetic`, NOT active).
6. **Dashboard fallback symbols** — `DashboardPage.tsx:56` `['RELIANCE','TATAPOWER','HDFCBANK','INFY']`.
7. **Strategy default symbol** — `StrategyPage.tsx:9` `RELIANCE`.
8. **Hardcoded broker `'mock'`** — sync buttons `PortfolioPage.tsx:23`, `JournalPage.tsx:18`.
9. **Health status hardcoded `'UP'`** — `healthService.js:59` (marketData) and `:74` (broker) ignore real provider results.
10. **Hardcoded `dataSource='development'`** — `portfolioService.js:153`, `watchlistService.js:47` regardless of real provider.
11. **Fundamentals P/E-only** — `market_data.py:373-408` walks back P/E from NSE archive; no growth/margin/balance-sheet (gaps disclosed in reasons).
12. **Intraday volume = sample count** — `market_data.py:665` (not true traded volume).
13. **Dead config** — `env.js:63-66` `config.llm` (`LLM_PROVIDER`/`LLM_API_KEY`) never consumed; `server/.env` `LLM_MODEL=llama-3.3--70b-versatile` (typo) unused. Effective LLM uses `AI_API_KEY`.
14. **Dead code** — `radarService.js:260-266` `isMarketOpen()` never called.

---

## Real-Time Data Flow Check (per data type)

| Data | Provider | Endpoint | Connected | Last timestamp | Live/Cached/Static | Refresh | Fallback |
|---|---|---|---|---|---|---|---|
| Live quote | jugaad `NSELive.stock_quote` | `GET /market/quote|quotes` | ✅ | 2s | LIVE (polled, ≤15s NSE snapshot age) | client 2s poll + 2s mem cache | nselib EOD → stale Postgres → null |
| Daily candle | nselib EOD (primary) / jugaad / nse-archives | `GET /market/candles` | ✅ | EOD (≤72h fresh) | CACHED / EOD-DELAYED | on-demand; mem 15min; DB | stale DB rows flagged |
| Intraday candle | jugaad `symbol_chart_data` resampled | `GET /market/candles` | ✅ | 2s poll | LIVE during hours (resampled, not true ticks) | mem 10s | stale mem → [] |
| Index | jugaad `all_indices` → nselib → derived | `GET /market/indices` | ✅ | 2s | LIVE | mem 2s | nselib → candle-derived |
| Breadth | computed from Postgres candles | `GET /market/breadth` | ✅ | up to 5min | CACHED derived metric | mem 5min, radar loop refresh | zeroed result |
| Top movers | jugaad `top_stocks` | `GET /market/top` | ✅ | live | LIVE | no cache | empty arrays |
| News | Google News RSS (no key) | `newsService` (internal) | ✅ | 5s | REAL fetch | 5s cache | neutral score on failure |
| Radar scan | nselib/jugaad + engine | `GET /radar/latest` | ✅ | 15s scheduler + 2s poll | LIVE recompute (full-universe slow) | `startRadarScheduler` 15s | DB persisted group after restart |
| P/E fundamental | nselib archive walk-back | `getFundamentals` | ✅ | EOD | CACHED (10min) | 10min cache | neutral score |

**No WebSocket / SSE / socket.io anywhere in the codebase** (verified 0 matches). "Real-time" = client HTTP polling every 2s + one server background loop (`startRadarScheduler`, `radarService.js:284`).

---

## Missing APIs

1. **Broker OAuth**: no `/auth/zerodha/callback`, `/auth/upstox/callback`, `/authorize`, or `/token` endpoints. No redirect/state handling (`brokerService.connect` passes no credentials, `brokerService.js:42-125`). Zerodha/Upstox providers throw "will be implemented when API access is available" (`ZerodhaBrokerProvider.js:25-28`, `UpstoxBrokerProvider.js:25-28`).
2. **No user-facing broker connect / consent grant / consent revoke / disconnect UI** — APIs exist (`routes/brokers.js:21-113`) but no client page calls them.
3. **DPDP data export/erasure/portability** — `resolveDsr` (`consentService.js:129-140`) only flips status; no export/delete/payload ever produced.
4. **No background alert-evaluation worker** — `evaluateAlerts` only called from `GET /alerts/evaluate` (manual click).
5. **No token-expiry enforcement job** — `expiryAt`/`expiresAt` stored + displayed (`AdminBrokersPage.tsx:58`) but never enforced; no auto `EXPIRED`.
6. **LLM chat endpoints not in UI** — `/api/ai/ask`, `/api/ai/suggest`, `/api/ai/summary` exist and call real Groq, but no React page renders them.
7. **No WebSocket endpoint** for push-style live quotes/alerts.

---

## Missing Database Tables

**None.** All 28 Prisma models are defined and migrated (User, Role, BrokerConnection, BrokerToken, ConsentLedger, DataSubjectRequest, Instrument, ScanUniverse, MarketQuote, MarketCandle, MarketDataAudit, ScanSignal, RadarOpportunity, PortfolioHolding/Position/Snapshot, Watchlist/Item, Alert/Event, Notification, Order/Event, TradeJournal, UserScannerPref, AuditLog, InfraLog). 

Note: index snapshots, breadth, intraday candles and top movers are **memory-cache only, not persisted** (by design).

---

## Missing Environment Variables (empty in `server/.env`)

- `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_REDIRECT_URI` — empty
- `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI` — empty
- `MARKET_DATA_LICENSE_KEY` — empty (LicensedMarketDataProvider is a throwing stub)
- `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` — empty (email stub)
- `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY` — empty (push stub; no `firebase-admin` SDK installed)

Set: `DATABASE_URL`, `ENCRYPTION_KEY` (valid 64-hex), `JWT_SECRET`, `AI_API_KEY` (Groq), `PYTHON_BIN`, `BROKER_PROVIDER=mock`, `MARKET_DATA_PROVIDER=development`, `MARKET_DATA_MODE=external`, `NOTIFICATION_PROVIDER=development`.

⚠️ **Security:** a real Groq API key is committed in `server/.env` (not gitignored content). Must be rotated and removed.

---

## Critical Issues

1. **Alerts module is broken end-to-end** — channel case mismatch: client sends uppercase `['IN_APP','PUSH','EMAIL']` (`AlertsPage.tsx:17,26,42`, `SettingsPage.tsx:10,38`) but server validates lowercase (`alertService.js:10,35-39`, `settingsService.js:6,20-22`). **Verified live**: alert creation and settings save both fail with `Invalid channel: IN_APP`.
2. **No background alert worker** — alerts only evaluate on manual "Evaluate now"; nothing fires them automatically.
3. **Broker integration is mock-only** — Zerodha/Upstox are throwing stubs, no OAuth flow, holdings/orders/funds are hardcoded fake data.
4. **No WebSocket** — "real-time" is 2s HTTP polling; no server push for quotes or alerts.
5. **Token expiry never enforced** — expiry stored/displayed but no auto-expire, no check in `sync()` (`brokerService.js:149-151` checks only status).
6. **DPDP erasure/portability are no-ops** — DSR "resolution" doesn't export or delete data.
7. **Funds endpoint bypasses consent** — `portfolioService.getFunds()` (`:211-221`) checks only `status==='CONNECTED'`, not `isConsentActive`.
8. **Health monitoring lies** — `marketData.status='UP'` and `broker.status='UP'` hardcoded; real `external` provider status (can be DEGRADED) is hidden from the UI.
9. **Notification delivery limited to in-app** — Email/Push providers throw; no SDKs installed; only DB-row + console-log delivery works.
10. **Radar full-universe scan is slow** — `MAX_SCAN_SYMBOLS` defaults to 5000; cold-cache deep fetch is rate-limited (30 calls/min) so the "live" full scan can lag for minutes; `isMarketOpen` gate removed recently so it churns even outside hours.

---

## Top 10 Things To Fix First

| # | Module | Problem | File/Path | Why it matters | Recommended fix |
|---|---|---|---|---|---|
| 1 | **Alerts + Settings** | Client sends uppercase channels, server validates lowercase → creation/save always fails | `client/src/pages/AlertsPage.tsx:17,26,42`; `client/src/pages/SettingsPage.tsx:10,38`; `server/src/services/alertService.js:10,35-39`; `server/src/services/settingsService.js:6,20-22` | Users cannot create alerts or save settings at all (verified failing) | Normalize channels to lowercase on the server (`.map(c => c.toLowerCase())`) or send lowercase from the client |
| 2 | **Alerts** | No background worker evaluates thresholds | `server/src/services/alertService.js:119-190`; `server/src/index.js:11` | Alerts never fire unless user clicks "Evaluate now" | Add a `setInterval` job (e.g. every 60s) in `index.js` calling `evaluateAlerts` for all active alerts/users |
| 3 | **Brokers** | Zerodha/Upstox are throwing stubs; no OAuth flow; user has no connect/consent UI | `server/src/providers/broker/ZerodhaBrokerProvider.js:25-63`, `UpstoxBrokerProvider.js:25-63`, `brokerService.js:42-125`; no client broker page | MVP's central "Connections" requirement is unmet | Implement OAuth authorize/callback/token endpoints, real KiteConnect/Upstox REST calls, and a Broker Connect page with grant/revoke consent toggles |
| 4 | **Notifications** | Email/Push stubs throw; only in-app delivery works; no SDKs | `EmailNotificationProvider.js:19-27`, `PushNotificationProvider.js:21-29`, `server/package.json` | Required "Push notifications + Email" are impossible | Install `nodemailer` + `firebase-admin`, implement real senders, wire channels to providers |
| 5 | **Real-time** | No WebSocket/SSE anywhere; everything is 2s polling | entire `server/src` + `client/src` (grep `WebSocket|socket.io`: 0 hits) | "Real-time" is emulated, not push | Add a WebSocket or SSE hub for quotes/alerts/radar updates, or explicitly document polling as the MVP approach |
| 6 | **Health monitoring** | Status hardcoded `UP`; external provider degradation hidden | `server/src/services/healthService.js:59,74`; `client/src/pages/admin/AdminHealthPage.tsx` | Ops can't see real degradation | Return actual `provider.health()` status for the badge; surface `external` detail in UI; fix `SystemHealth` type in `client/src/lib/types.ts:458` |
| 7 | **DPDP** | DSR resolve is status-only; no export/erasure/portability | `server/src/services/consentService.js:129-140` | Compliance requirement not actually fulfilled | Implement ACCESS export (JSON of user data), ERASURE (delete rows), PORTABILITY (download payload) in `resolveDsr` |
| 8 | **Consent enforcement** | Funds read path bypasses consent | `server/src/services/portfolioService.js:211-221` | Data can leak after consent revoked | Gate reads with `isConsentActive` like the sync path does (`brokerService.js:157`) |
| 9 | **Token lifecycle** | Expiry stored but never enforced; no auto-EXPIRED | `brokerService.js:149-151`, no cron | Stale connections appear healthy | Add expiry check in `sync()` + a daily job flipping expired connections; surface token status in admin |
| 10 | **Radar scan scale** | 5000-symbol scan is rate-limit-bound; live results can lag; churns outside market hours | `server/src/config/env.js:37`; `radarService.js:59-137,269-287` | "Real-time everything" radar is slow to refresh | Bound universe to cached/liquid symbols or stream incremental results; cap default to a feasible size; gate scheduler to market hours via `isMarketOpen` |

---

## Module-by-Module Detail

### USER PORTAL

**1. Connections & DPDP — 🟡 PARTIAL**
- Auth real (bcrypt + JWT, `authService.js`). Consent ledger + AES-256-GCM token encryption fully implemented and enforced on sync (`brokerService.js:157,190,220,227`; `utils/crypto.js`). Revoke deletes tokens + sets connection REVOKED (`consentService.js:63-79`).
- ❌ Broker OAuth absent (stubs throw). No user connect/consent/revoke UI. Funds read bypasses consent. Token expiry never enforced. DSR export/erasure is a no-op. `decryptString` is dead code.

**2. Dashboard — ✅ COMPLETE** (portfolio value rests on mock holdings)
- Real: indices, breadth, radar opportunities, watchlist, AI picks — all live 2s polling (`DashboardPage.tsx:34-39,69`). Caveats: portfolio summary is built from mock holdings; comment at `:62-63` says "3 minutes" but code runs 2s.

**3. Opportunity Radar — ✅ COMPLETE**
- Full pipeline real: universe (`scanUniverse` + external NSE master sync) → candles/quotes → features → conviction → signal → persist (`radarService.js:59-210`). Real-time via 2s polling + 15s scheduler. Signals = real computed conviction (weights trend25/momentum20/volume15/RS15/vol10/breadth15). Full-universe scan slowness is the main caveat.

**4. Portfolio Intelligence — 🟡 PARTIAL**
- Metrics computed (diversification HHI `portfolioService.js:52-70`, concentration `:72-122`, sector exposure `:189-202`). ❌ Holdings are mock; ❌ correlation not implemented (0 grep hits); snapshots only on manual sync; `dataSource` hardcoded `'development'`.

**5. Watchlist — ✅ COMPLETE**
- Single watchlist per user (unique), full CRUD, live prices via provider, 2s polling. Jugaad is NSE-only (BSE live unsupported).

**6. AI Strategy Router — ✅ COMPLETE**
- Deterministic router (radar signal + conviction) fully wired (`strategyService.js`). 7-factor `stockAnalysisService` real (tech+news+market+fundamentals+valuation+risk). News = real Google RSS, keyword sentiment. LLM (Groq) active for `/ai/ask` & `/ai/summary` but those endpoints have no UI. Fundamentals P/E-only.

**7. Alerts — ❌ BROKEN**
- CRUD/evaluate logic exists but **creation always fails** via the shipped UI (channel case bug, verified). No background worker. Email/push stubs. Quiet hours only suppress delivery, not event creation. Alerts pagination is a no-op (`AlertsPage.tsx:181`).

**8. Trade Journal — 🟡 PARTIAL**
- CRUD + notes + pagination real (`journalService.js`). ❌ Broker import = mock seeded orders; no real trade import; P&L never computed on entries.

**9. Settings — 🟡 PARTIAL**
- Persisted (`UserScannerPref`); quiet hours honored by alerts. ❌ Client save fails (channel case bug). `riskProfile`/`universeVisibility`/`notificationChannels` persisted but never consumed. No broker settings UI.

### ADMIN

**10. User Management — ✅ COMPLETE** — list/create/update/delete with real enforcement (SUSPENDED block, admin role guard).
**11. System Health — 🟡 PARTIAL** — DB ping real; marketData/broker badges hardcoded UP; external provider status hidden; no disk/mem checks.
**12. Broker Connection Monitoring — 🟡 PARTIAL** — real DB list + status PATCH; ❌ no token/expiry status surfaced; no live provider probe.
**13. DPDP Compliance Dashboard — 🟡 PARTIAL** — real consent ledger + DSR CRUD; ❌ resolution is status-only (no data work); no user consent UI.
**14. Scan Universe Management — ✅ COMPLETE** — full CRUD + real external NSE master sync (`syncInstrumentMaster`); client lacks create/edit form + bulk ops (minor).

### CORE SERVICES

**15. Authentication — ✅ COMPLETE** — register/login/logout/me/change-password, tokenVersion invalidation, role guards, client e2e.
**16. Zerodha integration — 🔴 NOT IMPLEMENTED** — throwing placeholder; no OAuth; env keys empty.
**17. Upstox integration — 🔴 NOT IMPLEMENTED** — throwing placeholder; no OAuth; env keys empty.
**18. Market data integration — ✅ COMPLETE** — real nselib/jugaad/nse-archives via Python bridge, Postgres cache, audit trail, layered fallbacks. Unofficial/free sources; rate-limited (30/min).
**19. Real-time WebSocket/REST data — ⚠️ NOT REAL-TIME** — REST polling only (client 2s, radar 15s); no WebSocket/SSE; indices/breadth/intraday not persisted.
**20. Technical/feature engine — ✅ COMPLETE** — real indicator math over real candles (SMA/EMA/RSI/ATR/ROC/MACD/zscore/RS); RSI/EMA/ATR simplified vs textbook.
**21. News/sentiment engine — 🟡 PARTIAL** — real Google News RSS (no key) + recency weighting; sentiment = hardcoded keyword lexicons, not an LLM; contributes 20% to score.
**22. Radar/scoring engine — ✅ COMPLETE** — regime + breadth + conviction + signals + reasons, all real computed.
**23. Notification service — 🟡 PARTIAL** — in-app delivery works (DB + log); email/push are stubs; nothing schedules delivery.
**24. Database/data integrity — ✅ COMPLETE** — 28 models, unique constraints, cascades, migrations, seed; audit + infra logs.

---

## Verified Live (this session)

- `GET /api/auth/login` → JWT ✅
- `GET /api/radar/latest` → scan #…, BULLISH, opportunities ✅ (DB fallback works after restart)
- `GET /api/market/indices` → NIFTY 24231.85 +0.64% live ✅
- `GET /api/market/breadth` → adv 779 / dec 1486, source=live ✅
- `GET /api/market/quotes?symbols=RELIANCE` → 1313.20 live ✅
- `POST /api/ai/suggest-market n=3` → ACMESOLAR 69 BUY ON DIP, SHANTIGOLD 63 HOLD, CRSL 60 AVOID ✅
- `POST /api/alerts` → **FAILS** `Invalid channel: IN_APP` ❌
- `PUT /api/settings` → **FAILS** `Invalid channel: IN_APP` ❌
- `GET /api/health` → db/marketData/broker all `UP` (hardcoded badge) ⚠️
- Radar scheduler: active, writing real candle data to Postgres (jugaad source) ✅