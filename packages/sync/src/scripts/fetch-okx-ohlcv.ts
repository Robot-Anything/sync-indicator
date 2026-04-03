/**
 * 拉取 OKX ETH-USDT 从 2025-01-01 至今的 1H/4H/15m/1D K 线并写入 Postgres
 */

import { loadEnv } from '@sync-indicator/core';
import { initPool, upsertOhlcv, type OhlcvRow } from '@sync-indicator/core';
import { fetchOkxEthUsdtFrom2025Jan1 } from '../data/sources/okx.js';
import type { OHLCV } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('fetch-ohlcv');

loadEnv();

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log.error('DATABASE_URL is not set');
    process.exit(1);
  }

  log.info('start fetch OKX ETH-USDT from 2025-01-01 to now (1H/4H/15m/1D)');
  let data;
  try {
    data = await fetchOkxEthUsdtFrom2025Jan1();
  } catch (err) {
    log.error('fetch error (will save partial data)', err instanceof Error ? err.message : err);
  }
  if (!data) {
    log.info('no data fetched');
    return;
  }
  log.info('fetch completed, 1H:', data['1H'].length, '4H:', data['4H'].length);

  const exchange = 'okx';
  const symbol = 'ETH-USDT';

  const toRows = (interval: string, rows: OHLCV[]): OhlcvRow[] =>
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

  const rows1H = toRows('1H', data['1H']);
  const rows4H = toRows('4H', data['4H']);
  const rows15m = toRows('15m', data['15m']);
  const rows1D = toRows('1D', data['1D']);

  log.info(`fetched 1H=${rows1H.length} 4H=${rows4H.length} 15m=${rows15m.length} 1D=${rows1D.length} bars`);

  const pool = initPool(databaseUrl);
  try {
    const res1 = await upsertOhlcv(pool, rows1H);
    const res2 = await upsertOhlcv(pool, rows4H);
    const res3 = await upsertOhlcv(pool, rows15m);
    const res4 = await upsertOhlcv(pool, rows1D);
    log.info(
      `upserted 1H=${res1.upserted} 4H=${res2.upserted} 15m=${res3.upserted} 1D=${res4.upserted}`
    );
    const allTimes = [
      ...rows1H.map((r) => r.time),
      ...rows4H.map((r) => r.time),
      ...rows15m.map((r) => r.time),
      ...rows1D.map((r) => r.time),
    ];
    if (allTimes.length > 0) {
      const minTs = Math.min(...allTimes);
      const maxTs = Math.max(...allTimes);
      log.info(`time range ${new Date(minTs).toISOString()} ~ ${new Date(maxTs).toISOString()}`);
    } else {
      log.info('time range N/A (no bars)');
    }
  } catch (err) {
    log.error('insert failed', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  log.info('done');
}

main().catch((err) => {
  log.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
