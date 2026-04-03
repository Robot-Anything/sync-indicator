-- K 线表：交易所、标的、周期、OHLCV
-- 主键 (exchange, symbol, interval, time_ts) 用于幂等写入

CREATE TABLE IF NOT EXISTS ohlcv (
  exchange VARCHAR(32) NOT NULL,
  symbol   VARCHAR(32) NOT NULL,
  interval VARCHAR(8)  NOT NULL,
  time_ts  BIGINT       NOT NULL,
  open     DECIMAL(20,8) NOT NULL,
  high     DECIMAL(20,8) NOT NULL,
  low      DECIMAL(20,8) NOT NULL,
  close    DECIMAL(20,8) NOT NULL,
  volume   DECIMAL(20,8) NOT NULL,
  PRIMARY KEY (exchange, symbol, "interval", time_ts)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_interval ON ohlcv (symbol, "interval", time_ts);
