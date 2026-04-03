/**
 * MACD：MACD_line = EMA_fast(close) - EMA_slow(close)，Signal = EMA_signal(MACD_line)，Histogram = MACD - Signal
 */

import { ema } from './ema.js';

export interface MacdOptions {
  fast?: number;
  slow?: number;
  signal?: number;
}

const DEFAULT_FAST = 12;
const DEFAULT_SLOW = 26;
const DEFAULT_SIGNAL = 9;

/**
 * @param close 收盘价序列
 * @param fast 快线周期，默认 12
 * @param slow 慢线周期，默认 26
 * @param signal 信号线周期，默认 9
 */
export function macd(
  close: number[],
  options?: MacdOptions | number,
  slow?: number,
  signal?: number
): { macd: number[]; signal: number[]; histogram: number[] } {
  let fastPeriod = DEFAULT_FAST;
  let slowPeriod = DEFAULT_SLOW;
  let signalPeriod = DEFAULT_SIGNAL;

  if (typeof options === 'object' && options != null) {
    fastPeriod = options.fast ?? DEFAULT_FAST;
    slowPeriod = options.slow ?? DEFAULT_SLOW;
    signalPeriod = options.signal ?? DEFAULT_SIGNAL;
  } else if (typeof options === 'number') {
    fastPeriod = options;
    slowPeriod = slow ?? DEFAULT_SLOW;
    signalPeriod = signal ?? DEFAULT_SIGNAL;
  }

  const emaFast = ema(close, fastPeriod);
  const emaSlow = ema(close, slowPeriod);
  const n = close.length;
  const macdLine: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i])) {
      macdLine[i] = Number.NaN;
    } else {
      macdLine[i] = emaFast[i]! - emaSlow[i]!;
    }
  }

  // Signal = EMA(signalPeriod) of MACD line；MACD 前段为 NaN，取有效子序列再算 EMA
  let startIdx = 0;
  while (startIdx < n && Number.isNaN(macdLine[startIdx])) startIdx++;
  const validMacd = macdLine.slice(startIdx) as number[];
  const signalEma = ema(validMacd, signalPeriod);
  const signalLine: number[] = new Array(n);
  for (let i = 0; i < startIdx; i++) signalLine[i] = Number.NaN;
  for (let i = 0; i < signalEma.length; i++) signalLine[startIdx + i] = signalEma[i]!;

  const histogram: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(macdLine[i]) || Number.isNaN(signalLine[i])) {
      histogram[i] = Number.NaN;
    } else {
      histogram[i] = macdLine[i]! - signalLine[i]!;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}
