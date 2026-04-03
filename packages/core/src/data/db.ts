/**
 * Postgres 连接与 K 线写入
 */

import { Pool } from 'pg';
import type { OHLCV } from '../types/index.js';
import { cleanOhlcvBatch } from './clean-ohlcv.js';

export interface OhlcvRow extends OHLCV {
  exchange: string;
  symbol: string;
  interval: string;
}

let pool: Pool | null = null;

export function initPool(databaseUrl: string): Pool {
  if (pool) return pool;
  pool = new Pool({ connectionString: databaseUrl });
  return pool;
}

export function getPool(): Pool | null {
  return pool;
}

const BATCH_SIZE = 100;

export async function insertOhlcv(
  p: Pool,
  rows: OhlcvRow[]
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const cleaned = cleanOhlcvBatch(rows);

  const client = await p.connect();
  let totalInserted = 0;
  try {
    for (let start = 0; start < cleaned.length; start += BATCH_SIZE) {
      const batch = cleaned.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let i = 0;
      for (const r of batch) {
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7}, $${i + 8}, $${i + 9})`
        );
        values.push(
          r.exchange,
          r.symbol,
          r.interval,
          r.time,
          r.open,
          r.high,
          r.low,
          r.close,
          r.volume
        );
        i += 9;
      }
      const sql = `
        INSERT INTO ohlcv (exchange, symbol, "interval", time_ts, open, high, low, close, volume)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (exchange, symbol, "interval", time_ts) DO NOTHING
      `;
      const result = await client.query(sql, values);
      totalInserted += result.rowCount ?? 0;
    }
    return { inserted: totalInserted };
  } finally {
    client.release();
  }
}
