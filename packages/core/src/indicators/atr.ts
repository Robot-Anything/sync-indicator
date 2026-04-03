/**
 * ATR 真实波幅：TR_t = max(high-low, |high - close_{t-1}|, |low - close_{t-1}|)，ATR = SMA(TR)
 * 使用 SMA 平滑，更适合波段策略的止损与仓位计算。
 */

const DEFAULT_PERIOD = 14;

/**
 * 对序列做 period 周期简单移动平均（滑动窗口 O(n)）
 */
function sma(values: number[], period: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n);
  for (let i = 0; i < period - 1 && i < n; i++) {
    out[i] = Number.NaN;
  }
  let windowSum = 0;
  for (let i = 0; i < period - 1 && i < n; i++) {
    windowSum += values[i]!;
  }
  for (let i = period - 1; i < n; i++) {
    windowSum += values[i]!;
    out[i] = windowSum / period;
    windowSum -= values[i - period + 1]!;
  }
  return out;
}

/**
 * @param high 最高价序列
 * @param low 最低价序列
 * @param close 收盘价序列（与 high/low 等长、按索引对齐）
 * @param period 周期，默认 14
 * @returns 与输入等长；前 period-1 项为 NaN，之后为有效 ATR
 */
export function atr(
  high: number[],
  low: number[],
  close: number[],
  period: number = DEFAULT_PERIOD
): number[] {
  const n = high.length;
  if (n !== low.length || n !== close.length) {
    throw new Error('[atr] high, low, close must have same length');
  }

  const tr: number[] = new Array(n);
  tr[0] = high[0]! - low[0]!;
  for (let i = 1; i < n; i++) {
    const prevClose = close[i - 1]!;
    const h = high[i]!;
    const l = low[i]!;
    tr[i] = Math.max(
      h - l,
      Math.abs(h - prevClose),
      Math.abs(l - prevClose)
    );
  }

  return sma(tr, period);
}
