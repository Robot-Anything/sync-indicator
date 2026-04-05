/**
 * 布林带：middle = SMA(close, period), upper = middle + stdDev * σ, lower = middle - stdDev * σ
 */

function sma(values: number[], period: number): number[] {
  const n = values.length;
  const out: number[] = new Array(n).fill(Number.NaN);
  if (n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  out[period - 1] = sum / period;
  for (let i = period; i < n; i++) {
    sum += values[i]! - values[i - period]!;
    out[i] = sum / period;
  }
  return out;
}

/**
 * @param close 收盘价序列
 * @param period 周期，默认 20
 * @param stdDev 标准差倍数，默认 2
 * @returns { upper, middle, lower } 与输入等长；前 period-1 项为 NaN
 */
export function bollinger(
  close: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const n = close.length;
  const middle = sma(close, period);
  const upper = new Array<number>(n).fill(Number.NaN);
  const lower = new Array<number>(n).fill(Number.NaN);

  for (let i = period - 1; i < n; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = close[j]! - middle[i]!;
      sumSq += diff * diff;
    }
    const sd = Math.sqrt(sumSq / period);
    upper[i] = middle[i]! + stdDev * sd;
    lower[i] = middle[i]! - stdDev * sd;
  }

  return { upper, middle, lower };
}
