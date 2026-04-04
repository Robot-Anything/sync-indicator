/**
 * 拉取 OKX K 线数据（按配置的 symbols）从 2025-01-01 至今的 1H/4H/15m/1D 并写入 Postgres
 */

import { loadEnv, loadSymbols } from '@sync-indicator/core';
import { initPool, upsertOhlcv, type OhlcvRow } from '@sync-indicator/core';
import { fetchOkxFrom2025Jan1 } from '../data/sources/okx.js';
import type { OHLCV } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('fetch-ohlcv');

loadEnv();

async function main(): Promise<void> {
  const symbols = loadSymbols();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  const exchange = 'okx';

  const toRows = (symbol: string, interval: string, rows: OHLCV[]): OhlcvRow[] =>
    rows.map((r) => ({
      exchange,
      symbol,
      interval,
      time: r.time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));

  const pool = initPool(databaseUrl);
  let failed = false;

  for (const symbol of symbols) {
    log.info(`start fetch OKX ${symbol} from 2025-01-01 to now (1H/4H/15m/1D)`);
    let data;
    try {
      data = await fetchOkxFrom2025Jan1(symbol);
    } catch (err) {
      log.error(`fetch error ${symbol}`, err instanceof Error ? err.message : err);
      failed = true;
      continue;
    }
    if (!data) {
      log.info(`no data fetched for ${symbol}`);
      failed = true;
      continue;
    }

    const rows1H = toRows(symbol, '1H', data['1H']);
    const rows4H = toRows(symbol, '4H', data['4H']);
    const rows15m = toRows(symbol, '15m', data['15m']);
    const rows1D = toRows(symbol, '1D', data['1D']);

    log.info(`[${symbol}] fetched 1H=${rows1H.length} 4H=${rows4H.length} 15m=${rows15m.length} 1D=${rows1D.length} bars`);

    try {
      const res1 = await upsertOhlcv(pool, rows1H);
      const res2 = await upsertOhlcv(pool, rows4H);
      const res3 = await upsertOhlcv(pool, rows15m);
      const res4 = await upsertOhlcv(pool, rows1D);
      log.info(
        `[${symbol}] upserted 1H=${res1.upserted} 4H=${res2.upserted} 15m=${res3.upserted} 1D=${res4.upserted}`
      );
    } catch (err) {
      log.error(`[${symbol}] insert failed`, err instanceof Error ? err.message : err);
      failed = true;
    }
  }

  if (failed) {
    log.error('completed with errors for one or more symbols');
    process.exit(1);
  }
  log.info('done');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
