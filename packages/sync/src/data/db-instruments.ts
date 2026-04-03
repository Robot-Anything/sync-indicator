/**
 * 基础资产信息写入：instruments 表 UPSERT
 */

import type { Pool } from 'pg';

export interface InstrumentRow {
  exchange: string;
  inst_id: string;
  inst_type: string;
  base_ccy: string;
  quote_ccy: string;
  lot_sz: string;
  tick_sz: string;
  ct_val?: string;
  ct_mult?: string;
  state?: string;
}

const BATCH_SIZE = 100;

export async function upsertInstruments(
  p: Pool,
  rows: InstrumentRow[]
): Promise<{ upserted: number }> {
  if (rows.length === 0) return { upserted: 0 };

  const client = await p.connect();
  let total = 0;
  try {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE);
      for (const r of batch) {
        const sql = `
          INSERT INTO instruments (exchange, inst_id, inst_type, base_ccy, quote_ccy, lot_sz, tick_sz, ct_val, ct_mult, state, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
          ON CONFLICT (exchange, inst_id) DO UPDATE SET
            inst_type = EXCLUDED.inst_type,
            base_ccy = EXCLUDED.base_ccy,
            quote_ccy = EXCLUDED.quote_ccy,
            lot_sz = EXCLUDED.lot_sz,
            tick_sz = EXCLUDED.tick_sz,
            ct_val = EXCLUDED.ct_val,
            ct_mult = EXCLUDED.ct_mult,
            state = EXCLUDED.state,
            updated_at = now()
        `;
        await client.query(sql, [
          r.exchange,
          r.inst_id,
          r.inst_type,
          r.base_ccy,
          r.quote_ccy,
          r.lot_sz,
          r.tick_sz,
          r.ct_val ?? null,
          r.ct_mult ?? null,
          r.state ?? null,
        ]);
        total += 1;
      }
    }
    return { upserted: total };
  } finally {
    client.release();
  }
}
