-- Add uniqueness constraints for deterministic upserts

-- BrokerToken: one access/refresh token per connection
CREATE UNIQUE INDEX "broker_tokens_connection_id_token_type_key" ON "broker_tokens"("connection_id", "token_type");

-- TradeJournal: one journal entry per order
CREATE UNIQUE INDEX "trade_journal_order_id_key" ON "trade_journal"("order_id");