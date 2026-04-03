/**
 * 数据归一化：OKX K 线原始数据 → OHLCV
 */

import type { OHLCV } from '../types/index.js';

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`normalizeOkxCandle: ${field}=${value} is not a finite number`);
  }
  return value;
}

/** OKX history-candles 单根 K 线： [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] */
export function normalizeOkxCandle(row: string[]): OHLCV {
  if (row.length < 6) {
    throw new Error(`normalizeOkxCandle: row length ${row.length} < 6`);
  }
  return {
    time: requireFinite(Number(row[0]), 'time'),
    open: requireFinite(Number(row[1]), 'open'),
    high: requireFinite(Number(row[2]), 'high'),
    low: requireFinite(Number(row[3]), 'low'),
    close: requireFinite(Number(row[4]), 'close'),
    volume: requireFinite(Number(row[5]), 'volume'),
  };
}
