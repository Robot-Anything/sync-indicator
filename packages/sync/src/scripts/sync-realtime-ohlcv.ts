/**
 * 实时 K 线同步：订阅 OKX WebSocket candle1H/candle4H，confirm=1 时写入 ohlcv 表
 */

import { loadEnv, loadSymbols } from '@sync-indicator/core';
import { initPool, upsertOhlcv, getPool, type OhlcvRow } from '@sync-indicator/core';
import { connectOkxCandleWs, type WsHandle } from '../data/sources/okx-ws.js';
import type { OHLCV } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('sync-realtime');

const EXCHANGE = 'okx';

function toRow(symbol: string, interval: string, ohlcv: OHLCV): OhlcvRow {
  return {
    exchange: EXCHANGE,
    symbol,
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
  const symbols = loadSymbols();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const pool = initPool(databaseUrl);
  log.info('DB pool ready');

  let wsHandle: WsHandle | null = null;

  wsHandle = connectOkxCandleWs(symbols, async (interval: string, ohlcv: OHLCV, confirmed: boolean, symbol: string) => {
    const row = toRow(symbol, interval, ohlcv);

    // 已收盘 & 未收盘：均用 upsert（DO UPDATE），确保最终数据与交易所一致
    try {
      const res = await upsertOhlcv(pool, [row]);
      log.info(`upserted interval=${interval} time_ts=${ohlcv.time} confirmed=${confirmed} upserted=${res.upserted}`);
    } catch (err) {
      log.error(`write failed interval=${interval} time_ts=${ohlcv.time}`, err instanceof Error ? err.message : err);
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
