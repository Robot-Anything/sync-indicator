/**
 * ohlcv 表查询：取最近 N 根 K 线，供指标增量计算预热用
 */

import type { Pool } from 'pg';

export interface OhlcvBar {
  time_ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 查询某标的最近 limit 根 K 线（按 time_ts ASC 排列，最新的在末尾）
 */
export async function fetchRecentOhlcv(
  pool: Pool,
  exchange: string,
  symbol: string,
  interval: string,
  limit: number
): Promise<OhlcvBar[]> {
  const sql = `
    SELECT time_ts, open, high, low, close, volume
    FROM (
      SELECT time_ts, open, high, low, close, volume
      FROM ohlcv
      WHERE exchange = $1 AND symbol = $2 AND "interval" = $3
      ORDER BY time_ts DESC
      LIMIT $4
    ) sub
    ORDER BY time_ts ASC
  `;
  const result = await pool.query(sql, [exchange, symbol, interval, limit]);
  return result.rows.map((r) => ({
    time_ts: Number(r.time_ts),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  }));
}
