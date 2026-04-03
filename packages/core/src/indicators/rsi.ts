/**
 * RSI (Relative Strength Index) - Wilder 平滑版本
 * alpha = 1/period，先用 SMA 种子，之后用指数平滑
 */

const DEFAULT_PERIOD = 14;

/**
 * @param close 收盘价序列
 * @param period RSI 周期，默认 14
 * @returns 与 close 等长；前 period 项为 NaN，之后为有效 RSI (0-100)
 */
export function rsi(close: number[], period: number = DEFAULT_PERIOD): number[] {
  const n = close.length;
  const out: number[] = new Array(n);

  if (n === 0 || period < 1) return out;

  // 前 period-1 项为 NaN
  for (let i = 0; i < period - 1 && i < n; i++) {
    out[i] = Number.NaN;
  }

  if (n < period + 1) return out;

  // 计算初始涨跌值
  const gains: number[] = new Array(n);
  const losses: number[] = new Array(n);

  for (let i = 1; i < n; i++) {
    const diff = close[i]! - close[i - 1]!;
    gains[i] = diff > 0 ? diff : 0;
    losses[i] = diff < 0 ? -diff : 0;
  }

  // 第一个有效值：用 SMA(period) 作为种子
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    avgGain += gains[i]!;
    avgLoss += losses[i]!;
  }
  avgGain /= period;
  avgLoss /= period;

  // period 位置的 RSI
  if (avgLoss === 0) {
    out[period] = 100;
  } else {
    out[period] = 100 - 100 / (1 + avgGain / avgLoss);
  }

  // 后续用 Wilder 平滑：EMA_alpha = avg * alpha + prev * (1 - alpha)，alpha = 1/period
  const alpha = 1 / period;
  for (let i = period + 1; i < n; i++) {
    avgGain = alpha * gains[i]! + (1 - alpha) * avgGain;
    avgLoss = alpha * losses[i]! + (1 - alpha) * avgLoss;
    if (avgLoss === 0) {
      out[i] = 100;
    } else {
      out[i] = 100 - 100 / (1 + avgGain / avgLoss);
    }
  }

  return out;
}
