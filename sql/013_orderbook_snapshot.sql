-- 订单簿快照表（每个品种只保留最新快照）
CREATE TABLE IF NOT EXISTS orderbook_snapshot (
  exchange VARCHAR(32) NOT NULL,
  symbol   VARCHAR(32) NOT NULL,
  time_ts  BIGINT      NOT NULL,
  bids     JSONB       NOT NULL,   -- [[price, size], ...]
  asks     JSONB       NOT NULL,   -- [[price, size], ...]
  PRIMARY KEY (exchange, symbol)
);

CREATE INDEX IF NOT EXISTS idx_orderbook_symbol ON orderbook_snapshot (symbol, time_ts);
