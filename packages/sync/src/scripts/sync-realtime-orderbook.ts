/**
 * 实时订单簿 20 档同步：订阅 OKX books channel，增量维护本地订单簿状态，
 * 每次更新后取前 20 档写入 orderbook_snapshot 表
 */

import { loadEnv } from '@sync-indicator/core';
import { initPool, getPool } from '@sync-indicator/core';
import { upsertOrderbookSnapshot, type OrderbookRow } from '../data/db-orderbook.js';
import { connectOkxOrderbookWs, type OrderbookTick, type WsHandle } from '../data/sources/okx-ws-orderbook.js';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime-orderbook');
const EXCHANGE = 'okx';
const SYMBOL = 'ETH-USDT';
const FLUSH_INTERVAL_MS = 1000; // 每秒最多写一次

function toRow(orderbook: OrderbookTick): OrderbookRow {
  return {
    exchange: EXCHANGE,
    symbol: SYMBOL,
    time_ts: orderbook.time,
    bids: orderbook.bids,
    asks: orderbook.asks,
  };
}

async function main(): Promise<void> {
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = initPool(databaseUrl);
  log.info('DB pool ready');

  let pending: OrderbookRow | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const wsHandle: WsHandle = connectOkxOrderbookWs((symbol: string, orderbook: OrderbookTick) => {
    if (symbol !== SYMBOL) return;
    pending = toRow(orderbook);
  });

  const flush = async (): Promise<void> => {
    if (!pending) return;
    const row = pending;
    pending = null;
    try {
      await upsertOrderbookSnapshot(pool, row);
      log.info(`upserted orderbook time_ts=${row.time_ts} bids=${row.bids.length} asks=${row.asks.length}`);
    } catch (err) {
      log.error('upsert failed', err instanceof Error ? err.message : err);
    }
  };

  // 定时 flush，每秒最多一次
  flushTimer = setInterval(() => {
    void flush();
  }, FLUSH_INTERVAL_MS);

  const shutdown = (): void => {
    log.info('shutting down');
    if (flushTimer) clearInterval(flushTimer);
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
