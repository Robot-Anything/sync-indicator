/**
 * 成交明细写入：trades 表 INSERT，ON CONFLICT DO NOTHING
 */

import type { Pool } from 'pg';

export interface TradeRow {
  exchange: string;
  symbol: string;
  trade_id: string;
  time_ts: number;
  price: number;
  size: number;
  side: string;
}

const BATCH_SIZE = 100;

export async function insertTrades(
  p: Pool,
  rows: TradeRow[]
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const client = await p.connect();
  let totalInserted = 0;
  try {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let i = 0;
      for (const r of batch) {
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7})`
        );
        values.push(
          r.exchange,
          r.symbol,
          r.trade_id,
          r.time_ts,
          r.price,
          r.size,
          r.side
        );
        i += 7;
      }
      const sql = `
        INSERT INTO trades (exchange, symbol, trade_id, time_ts, price, size, side)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (exchange, symbol, trade_id) DO NOTHING
      `;
      const result = await client.query(sql, values);
      totalInserted += result.rowCount ?? 0;
    }
    return { inserted: totalInserted };
  } finally {
    client.release();
  }
}
