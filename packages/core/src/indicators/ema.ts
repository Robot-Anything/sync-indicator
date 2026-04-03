/**
 * 指数移动平均 EMA
 * α = 2 / (period + 1)，首点用前 period 根 SMA 作为种子
 */

function sma(values: number[], start: number, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) {
    sum += values[start + i];
  }
  return sum / count;
}

/**
 * @param close 收盘价序列（与 K 线 time 按索引一一对应）
 * @param period 周期
 * @returns 与 close 等长；前 period-1 项为 NaN，之后为有效 EMA
 */
export function ema(close: number[], period: number): number[] {
  const n = close.length;
  const out: number[] = new Array(n);
  if (n === 0) return out;
  if (period < 1) {
    for (let i = 0; i < n; i++) out[i] = Number.NaN;
    return out;
  }

  const alpha = 2 / (period + 1);

  for (let i = 0; i < period - 1 && i < n; i++) {
    out[i] = Number.NaN;
  }
  if (n < period) return out;

  out[period - 1] = sma(close, 0, period);
  for (let i = period; i < n; i++) {
    out[i] = alpha * close[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}
