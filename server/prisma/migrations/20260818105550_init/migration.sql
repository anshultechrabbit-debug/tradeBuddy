-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "subscription_status" TEXT NOT NULL DEFAULT 'free',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "broker_connections" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "display_name" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "last_error" TEXT,
    "expiry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broker_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broker_tokens" (
    "id" SERIAL NOT NULL,
    "connection_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_type" TEXT NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "broker_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_ledger" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consent_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "consent_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" SERIAL NOT NULL,
    "instrument_key" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "name" TEXT,
    "sector" TEXT,
    "segment" TEXT,
    "underlying_symbol" TEXT,
    "expiry" TIMESTAMP(3),
    "strike_price" DECIMAL(65,30),
    "lot_size" INTEGER,
    "tick_size" DECIMAL(65,30),
    "isin" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_universe" (
    "id" SERIAL NOT NULL,
    "instrument_id" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument_type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "excluded" BOOLEAN NOT NULL DEFAULT false,
    "exclusion_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_universe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_quotes" (
    "id" SERIAL NOT NULL,
    "instrument_id" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "last_price" DECIMAL(65,30) NOT NULL,
    "open" DECIMAL(65,30),
    "high" DECIMAL(65,30),
    "low" DECIMAL(65,30),
    "prev_close" DECIMAL(65,30),
    "change" DECIMAL(65,30),
    "change_pct" DECIMAL(65,30),
    "volume" BIGINT,
    "bid" DECIMAL(65,30),
    "ask" DECIMAL(65,30),
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_candles" (
    "id" SERIAL NOT NULL,
    "instrument_id" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL DEFAULT '1d',
    "ts" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(65,30) NOT NULL,
    "high" DECIMAL(65,30) NOT NULL,
    "low" DECIMAL(65,30) NOT NULL,
    "close" DECIMAL(65,30) NOT NULL,
    "volume" BIGINT NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "provider" TEXT NOT NULL,

    CONSTRAINT "market_candles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_data_audit" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "instrument_count" INTEGER,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_data_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_signals" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "instrument_id" INTEGER,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signal" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "conviction_score" INTEGER NOT NULL,
    "features" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,

    CONSTRAINT "scan_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radar_opportunities" (
    "id" SERIAL NOT NULL,
    "scan_id" TEXT NOT NULL,
    "user_id" INTEGER,
    "instrument_id" INTEGER,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "price" DECIMAL(65,30),
    "signal" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "conviction_score" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "data_source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radar_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_holdings" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "average_price" DECIMAL(65,30) NOT NULL,
    "current_price" DECIMAL(65,30),
    "cost_value" DECIMAL(65,30),
    "current_value" DECIMAL(65,30),
    "pnl" DECIMAL(65,30),
    "pnl_pct" DECIMAL(65,30),
    "source" TEXT NOT NULL DEFAULT 'broker',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_positions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "instrument_id" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "average_price" DECIMAL(65,30),
    "last_price" DECIMAL(65,30),
    "day_quantity" INTEGER NOT NULL DEFAULT 0,
    "day_avg_price" DECIMAL(65,30),
    "pnl" DECIMAL(65,30),
    "product" TEXT NOT NULL DEFAULT 'CNC',
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "snapshot_date" TIMESTAMP(3) NOT NULL,
    "invested_value" DECIMAL(65,30),
    "current_value" DECIMAL(65,30),
    "total_pnl" DECIMAL(65,30),
    "pnl_pct" DECIMAL(65,30),
    "holdings_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Watchlist',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" SERIAL NOT NULL,
    "watchlist_id" INTEGER NOT NULL,
    "instrument_id" INTEGER,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "alert_type" TEXT NOT NULL,
    "threshold" DECIMAL(65,30) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "channels" JSONB NOT NULL DEFAULT '["in_app"]',
    "last_triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" SERIAL NOT NULL,
    "alert_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "symbol" TEXT,
    "value" DECIMAL(65,30) NOT NULL,
    "threshold" DECIMAL(65,30) NOT NULL,
    "alert_type" TEXT NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "provider" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "broker" TEXT NOT NULL,
    "broker_order_id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "order_type" TEXT NOT NULL DEFAULT 'MARKET',
    "product" TEXT NOT NULL DEFAULT 'CNC',
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(65,30),
    "average_price" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "filled_quantity" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_journal" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "pnl" DECIMAL(65,30),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_scanner_prefs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "risk_profile" TEXT NOT NULL DEFAULT 'moderate',
    "universe_visibility" TEXT NOT NULL DEFAULT 'default',
    "notification_channels" JSONB NOT NULL DEFAULT '["in_app"]',
    "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '08:00',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_scanner_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "infra_logs" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "component" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "infra_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "broker_connections_status_idx" ON "broker_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "broker_connections_user_id_broker_key" ON "broker_connections"("user_id", "broker");

-- CreateIndex
CREATE INDEX "consent_ledger_status_idx" ON "consent_ledger"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consent_ledger_user_id_broker_scope_key" ON "consent_ledger"("user_id", "broker", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_instrument_key_key" ON "instruments"("instrument_key");

-- CreateIndex
CREATE INDEX "instruments_symbol_idx" ON "instruments"("symbol");

-- CreateIndex
CREATE INDEX "instruments_instrument_type_idx" ON "instruments"("instrument_type");

-- CreateIndex
CREATE INDEX "instruments_sector_idx" ON "instruments"("sector");

-- CreateIndex
CREATE UNIQUE INDEX "scan_universe_instrument_id_key" ON "scan_universe"("instrument_id");

-- CreateIndex
CREATE INDEX "scan_universe_enabled_priority_idx" ON "scan_universe"("enabled", "priority");

-- CreateIndex
CREATE INDEX "scan_universe_symbol_idx" ON "scan_universe"("symbol");

-- CreateIndex
CREATE INDEX "market_quotes_symbol_idx" ON "market_quotes"("symbol");

-- CreateIndex
CREATE INDEX "market_quotes_timestamp_idx" ON "market_quotes"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "market_quotes_instrument_id_timestamp_key" ON "market_quotes"("instrument_id", "timestamp");

-- CreateIndex
CREATE INDEX "market_candles_symbol_timeframe_ts_idx" ON "market_candles"("symbol", "timeframe", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "market_candles_instrument_id_timeframe_ts_key" ON "market_candles"("instrument_id", "timeframe", "ts");

-- CreateIndex
CREATE INDEX "market_data_audit_created_at_idx" ON "market_data_audit"("created_at");

-- CreateIndex
CREATE INDEX "scan_signals_user_id_timestamp_idx" ON "scan_signals"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "scan_signals_symbol_idx" ON "scan_signals"("symbol");

-- CreateIndex
CREATE INDEX "radar_opportunities_scan_id_idx" ON "radar_opportunities"("scan_id");

-- CreateIndex
CREATE INDEX "radar_opportunities_created_at_idx" ON "radar_opportunities"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_holdings_user_id_broker_symbol_key" ON "portfolio_holdings"("user_id", "broker", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_positions_user_id_broker_symbol_key" ON "portfolio_positions"("user_id", "broker", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_user_id_snapshot_date_key" ON "portfolio_snapshots"("user_id", "snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "watchlists_user_id_key" ON "watchlists"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlist_id_symbol_exchange_key" ON "watchlist_items"("watchlist_id", "symbol", "exchange");

-- CreateIndex
CREATE INDEX "notifications_user_id_delivered_at_idx" ON "notifications"("user_id", "delivered_at");

-- CreateIndex
CREATE INDEX "orders_user_id_timestamp_idx" ON "orders"("user_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "orders_broker_broker_order_id_key" ON "orders"("broker", "broker_order_id");

-- CreateIndex
CREATE INDEX "trade_journal_user_id_timestamp_idx" ON "trade_journal"("user_id", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "user_scanner_prefs_user_id_key" ON "user_scanner_prefs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "infra_logs_component_created_at_idx" ON "infra_logs"("component", "created_at");

-- CreateIndex
CREATE INDEX "infra_logs_level_idx" ON "infra_logs"("level");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_connections" ADD CONSTRAINT "broker_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_tokens" ADD CONSTRAINT "broker_tokens_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "broker_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broker_tokens" ADD CONSTRAINT "broker_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_ledger" ADD CONSTRAINT "consent_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_universe" ADD CONSTRAINT "scan_universe_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_candles" ADD CONSTRAINT "market_candles_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_signals" ADD CONSTRAINT "scan_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_signals" ADD CONSTRAINT "scan_signals_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_opportunities" ADD CONSTRAINT "radar_opportunities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "radar_opportunities" ADD CONSTRAINT "radar_opportunities_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_holdings" ADD CONSTRAINT "portfolio_holdings_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_positions" ADD CONSTRAINT "portfolio_positions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_journal" ADD CONSTRAINT "trade_journal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_journal" ADD CONSTRAINT "trade_journal_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_scanner_prefs" ADD CONSTRAINT "user_scanner_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
