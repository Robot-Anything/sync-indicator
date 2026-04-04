/**
 * 实时成交明细同步：订阅 OKX trades-all，写入 trades 表（带小批量缓冲）
 */

import { loadEnv, loadSymbols } from '@sync-indicator/core';
import { initPool, getPool } from '@sync-indicator/core';
import { insertTrades, type TradeRow } from '../data/db-trades.js';
import { connectOkxTradesWs, type WsHandle } from '../data/sources/okx-ws-trades.js';
import type { Trade } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime-trades');
const EXCHANGE = 'okx';
const FLUSH_SIZE = 50;
const FLUSH_MS = 2000;

function toRow(symbol: string, trade: Trade): TradeRow {
  return {
    exchange: EXCHANGE,
    symbol,
    trade_id: trade.tradeId,
    time_ts: trade.time,
    price: trade.price,
    size: trade.size,
    side: trade.side,
  };
}

async function main(): Promise<void> {
  loadEnv();
  const symbols = loadSymbols();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = initPool(databaseUrl);
  log.info('DB pool ready');

  const buffer: TradeRow[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const rows = buffer.splice(0, buffer.length);
    try {
      const res = await insertTrades(pool, rows);
      log.info(`inserted trades=${res.inserted} (batch ${rows.length})`);
    } catch (err) {
      log.error('insert failed', err instanceof Error ? err.message : err);
      buffer.unshift(...rows);
    }
  }

  const wsHandle: WsHandle = connectOkxTradesWs(symbols, (symbol: string, trade: Trade) => {
    buffer.push(toRow(symbol, trade));
    if (buffer.length >= FLUSH_SIZE) {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      void flush();
    } else if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flush();
      }, FLUSH_MS);
    }
  });

  const shutdown = (): void => {
    log.info('shutting down');
    if (flushTimer) clearTimeout(flushTimer);
    wsHandle.close();
    void flush()
      .then(() => getPool()?.end())
      .catch((e) => log.error('shutdown', e instanceof Error ? e.message : e))
      .then(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('sync-realtime-trades running, waiting for trades...');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
