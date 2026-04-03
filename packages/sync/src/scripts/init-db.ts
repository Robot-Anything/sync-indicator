/**
 * 初始化数据库表
 */

import { Pool } from 'pg';
import { loadEnv } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('init-db');

const CREATE_TABLES_SQL = `
-- K 线表
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

-- 成交明细表
CREATE TABLE IF NOT EXISTS trades (
  exchange VARCHAR(32)  NOT NULL,
  symbol   VARCHAR(32)  NOT NULL,
  trade_id VARCHAR(64)  NOT NULL,
  time_ts  BIGINT       NOT NULL,
  price    DECIMAL(20,8) NOT NULL,
  size     DECIMAL(20,8) NOT NULL,
  side     VARCHAR(8)   NOT NULL,
  PRIMARY KEY (exchange, symbol, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_time ON trades (symbol, time_ts);

-- BBO 买卖一档表
CREATE TABLE IF NOT EXISTS bbo (
  exchange VARCHAR(32)  NOT NULL,
  symbol   VARCHAR(32)  NOT NULL,
  time_ts  BIGINT       NOT NULL,
  bid_px   DECIMAL(20,8) NOT NULL,
  ask_px   DECIMAL(20,8) NOT NULL,
  bid_sz   DECIMAL(20,8) NOT NULL,
  ask_sz   DECIMAL(20,8) NOT NULL,
  PRIMARY KEY (exchange, symbol, time_ts)
);

CREATE INDEX IF NOT EXISTS idx_bbo_symbol_time ON bbo (symbol, time_ts);

-- 合约信息表
CREATE TABLE IF NOT EXISTS instruments (
  exchange   VARCHAR(32)  NOT NULL,
  inst_id    VARCHAR(32)  NOT NULL,
  inst_type  VARCHAR(16)  NOT NULL,
  base_ccy   VARCHAR(16)  NOT NULL,
  quote_ccy  VARCHAR(16)  NOT NULL,
  lot_sz     VARCHAR(32)  NOT NULL,
  tick_sz    VARCHAR(32)  NOT NULL,
  ct_val     VARCHAR(32),
  ct_mult    VARCHAR(32),
  state      VARCHAR(16),
  created_at TIMESTAMPTZ  DEFAULT now(),
  updated_at TIMESTAMPTZ  DEFAULT now(),
  PRIMARY KEY (exchange, inst_id)
);

CREATE INDEX IF NOT EXISTS idx_instruments_inst_type ON instruments (exchange, inst_type);

-- 订单簿快照表
CREATE TABLE IF NOT EXISTS orderbook_snapshot (
  exchange VARCHAR(32) NOT NULL,
  symbol   VARCHAR(32) NOT NULL,
  time_ts  BIGINT      NOT NULL,
  bids     JSONB       NOT NULL,
  asks     JSONB       NOT NULL,
  PRIMARY KEY (exchange, symbol)
);

CREATE INDEX IF NOT EXISTS idx_orderbook_symbol ON orderbook_snapshot (symbol, time_ts);
`;

loadEnv();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    log.info('creating tables...');
    await pool.query(CREATE_TABLES_SQL);
    log.info('tables created successfully');

    // 验证表是否存在
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('ohlcv', 'trades', 'bbo', 'instruments', 'orderbook_snapshot')
      ORDER BY table_name
    `);

    log.info(`created tables: ${result.rows.map(r => r.table_name).join(', ')}`);
  } catch (err) {
    log.error('failed to create tables', err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await pool.end();
  }

  log.info('done');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
