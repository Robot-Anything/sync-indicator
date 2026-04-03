/**
 * BBO（买卖一档）写入：bbo 表 INSERT，ON CONFLICT DO NOTHING
 */

import type { Pool } from 'pg';

export interface BboRow {
  exchange: string;
  symbol: string;
  time_ts: number;
  bid_px: number;
  ask_px: number;
  bid_sz: number;
  ask_sz: number;
}

export async function insertBbo(p: Pool, rows: BboRow[]): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const client = await p.connect();
  let totalInserted = 0;
  try {
    const BATCH_SIZE = 100;
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let i = 0;
      for (const r of batch) {
        placeholders.push(
          `($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}, $${i + 7})`
        );
        values.push(r.exchange, r.symbol, r.time_ts, r.bid_px, r.ask_px, r.bid_sz, r.ask_sz);
        i += 7;
      }
      const sql = `
        INSERT INTO bbo (exchange, symbol, time_ts, bid_px, ask_px, bid_sz, ask_sz)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (exchange, symbol, time_ts) DO NOTHING
      `;
      const result = await client.query(sql, values);
      totalInserted += result.rowCount ?? 0;
    }
    return { inserted: totalInserted };
  } finally {
    client.release();
  }
}
