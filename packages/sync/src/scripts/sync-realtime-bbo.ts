/**
 * 实时 BBO（买卖一档）同步：订阅 bbo-tbt，按秒采样写入 bbo 表以控制存储量
 */

import { loadEnv, loadSymbols } from '@sync-indicator/core';
import { initPool, getPool } from '@sync-indicator/core';
import { insertBbo, type BboRow } from '../data/db-bbo.js';
import { connectOkxBboWs, type BboTick, type WsHandle } from '../data/sources/okx-ws-bbo.js';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime-bbo');
const EXCHANGE = 'okx';
const SAMPLE_INTERVAL_MS = 1000;

function toRow(symbol: string, bbo: BboTick): BboRow {
  return {
    exchange: EXCHANGE,
    symbol,
    time_ts: bbo.time,
    bid_px: bbo.bid_px,
    ask_px: bbo.ask_px,
    bid_sz: bbo.bid_sz,
    ask_sz: bbo.ask_sz,
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

  const pendingMap = new Map<string, BboRow>();

  const wsHandle: WsHandle = connectOkxBboWs(symbols, (symbol: string, bbo: BboTick) => {
    pendingMap.set(symbol, toRow(symbol, bbo));
  });

  const flushInterval = setInterval(async () => {
    if (pendingMap.size === 0) return;
    const rows = [...pendingMap.values()];
    pendingMap.clear();
    try {
      const res = await insertBbo(pool, rows);
      if (res.inserted > 0) {
        log.info(`inserted bbo count=${res.inserted}`);
      }
    } catch (err) {
      log.error('insert failed', err instanceof Error ? err.message : err);
    }
  }, SAMPLE_INTERVAL_MS);

  const shutdown = (): void => {
    log.info('shutting down');
    clearInterval(flushInterval);
    wsHandle.close();
    void getPool()
      ?.end()
      .catch((e) => log.error('pool.end', e instanceof Error ? e.message : e))
      .then(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('sync-realtime-bbo running (1s sample), waiting for bbo-tbt...');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
