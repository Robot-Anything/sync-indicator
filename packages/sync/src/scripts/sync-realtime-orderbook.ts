/**
 * 实时订单簿 20 档同步：订阅 OKX books channel，增量维护本地订单簿状态，
 * 每次更新后取前 20 档写入 orderbook_snapshot 表
 */

import { loadEnv, loadSymbols } from '@sync-indicator/core';
import { initPool, getPool } from '@sync-indicator/core';
import { upsertOrderbookSnapshot, type OrderbookRow } from '../data/db-orderbook.js';
import { connectOkxOrderbookWs, type OrderbookTick, type WsHandle } from '../data/sources/okx-ws-orderbook.js';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime-orderbook');
const EXCHANGE = 'okx';
const FLUSH_INTERVAL_MS = 1000; // 每秒最多写一次

function toRow(symbol: string, orderbook: OrderbookTick): OrderbookRow {
  return {
    exchange: EXCHANGE,
    symbol,
    time_ts: orderbook.time,
    bids: orderbook.bids,
    asks: orderbook.asks,
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

  const pendingMap = new Map<string, OrderbookRow>();

  const wsHandle: WsHandle = connectOkxOrderbookWs(symbols, (symbol: string, orderbook: OrderbookTick) => {
    pendingMap.set(symbol, toRow(symbol, orderbook));
  });

  const flush = async (): Promise<void> => {
    if (pendingMap.size === 0) return;
    const rows = [...pendingMap.values()];
    pendingMap.clear();
    for (const row of rows) {
      try {
        await upsertOrderbookSnapshot(pool, row);
        log.info(`upserted orderbook symbol=${row.symbol} time_ts=${row.time_ts} bids=${row.bids.length} asks=${row.asks.length}`);
      } catch (err) {
        log.error('upsert failed', err instanceof Error ? err.message : err);
      }
    }
  };

  // 定时 flush，每秒最多一次
  const flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  const shutdown = (): void => {
    log.info('shutting down');
    clearInterval(flushTimer);
    wsHandle.close();
    void flush()
      .then(() => getPool()?.end())
      .catch((e) => log.error('shutdown', e instanceof Error ? e.message : e))
      .then(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('sync-realtime-orderbook running, waiting for books channel...');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
