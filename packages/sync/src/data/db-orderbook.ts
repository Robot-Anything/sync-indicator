/**
 * 订单簿快照写入：orderbook_snapshot 表 UPSERT
 */

import type { Pool } from 'pg';

export interface OrderbookRow {
  exchange: string;
  symbol: string;
  time_ts: number;
  bids: [number, number][]; // [[price, size], ...]
  asks: [number, number][];
}

/**
 * Upsert orderbook snapshot (每个品种只保留最新一条)
 */
export async function upsertOrderbookSnapshot(
  p: Pool,
  row: OrderbookRow
): Promise<void> {
  const client = await p.connect();
  try {
    const sql = `
      INSERT INTO orderbook_snapshot (exchange, symbol, time_ts, bids, asks)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (exchange, symbol) DO UPDATE SET
        time_ts = EXCLUDED.time_ts,
        bids = EXCLUDED.bids,
        asks = EXCLUDED.asks
    `;
    await client.query(sql, [
      row.exchange,
      row.symbol,
      row.time_ts,
      JSON.stringify(row.bids),
      JSON.stringify(row.asks),
    ]);
  } finally {
    client.release();
  }
}
