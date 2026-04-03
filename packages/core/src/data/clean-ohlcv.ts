/**
 * OHLCV 数据清洗：校验并自动修正 high/low、open/close 关系及 volume
 */

import type { OhlcvRow } from './db.js';

/**
 * 单条 K 线清洗：对调 high/low（若反）、将 open/close 夹紧到 [low, high]、volume 非负
 * 若任意价格字段为 NaN/Infinity，抛出异常——上层应在此之前完成数值校验
 */
export function cleanOhlcvRow(row: OhlcvRow): OhlcvRow {
  let { open, high, low, close, volume } = row;

  for (const [field, val] of [['open', open], ['high', high], ['low', low], ['close', close]] as [string, number][]) {
    if (!Number.isFinite(val)) {
      throw new Error(`cleanOhlcvRow: ${field}=${val} is not a finite number`);
    }
  }
  if (!Number.isFinite(volume) || volume < 0) {
    volume = Number.isFinite(volume) ? Math.max(0, volume) : 0;
  }

  if (high < low) {
    [high, low] = [low, high];
  }
  const minP = low;
  const maxP = high;
  open = Math.max(minP, Math.min(maxP, open));
  close = Math.max(minP, Math.min(maxP, close));

  return {
    ...row,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * 批量清洗：先按 (exchange, symbol, interval, time) 排序，再逐条清洗
 */
export function cleanOhlcvBatch(rows: OhlcvRow[]): OhlcvRow[] {
  if (rows.length === 0) return [];

  const sorted = [...rows].sort((a, b) => {
    if (a.exchange !== b.exchange) return a.exchange.localeCompare(b.exchange);
    if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
    if (a.interval !== b.interval) return a.interval.localeCompare(b.interval);
    return a.time - b.time;
  });

  return sorted.map(cleanOhlcvRow);
}
