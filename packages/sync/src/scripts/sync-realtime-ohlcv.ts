/**
 * 实时 K 线同步：订阅 OKX WebSocket candle1H/candle4H，confirm=1 时写入 ohlcv 表
 */

import { loadEnv } from '@sync-indicator/core';
import { initPool, insertOhlcv, getPool, type OhlcvRow } from '@sync-indicator/core';
import { connectOkxCandleWs, type WsHandle } from '../data/sources/okx-ws.js';
import type { OHLCV } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime');

const EXCHANGE = 'okx';
const SYMBOL = 'ETH-USDT';

function toRow(interval: string, ohlcv: OHLCV): OhlcvRow {
  return {
    exchange: EXCHANGE,
    symbol: SYMBOL,
    interval,
    time: ohlcv.time,
    open: ohlcv.open,
    high: ohlcv.high,
    low: ohlcv.low,
    close: ohlcv.close,
    volume: ohlcv.volume,
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

  let wsHandle: WsHandle | null = null;

  wsHandle = connectOkxCandleWs(async (interval: string, ohlcv: OHLCV) => {
    const row = toRow(interval, ohlcv);

    // 写入 K 线
    try {
      const res = await insertOhlcv(pool, [row]);
      log.info(`inserted interval=${interval} time_ts=${ohlcv.time} inserted=${res.inserted}`);
    } catch (err) {
      log.error(`insert failed interval=${interval} time_ts=${ohlcv.time}`, err instanceof Error ? err.message : err);
    }
  });

  const shutdown = (): void => {
    log.info('shutting down');
    wsHandle?.close();
    const p = getPool();
    if (p) void p.end().catch((e) => log.error('pool.end', e instanceof Error ? e.message : e));
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log.info('sync-realtime running, waiting for candle pushes (confirm=1)...');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
