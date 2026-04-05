/**
 * ADX 平均趋向指数：Wilder 平滑 +DM/-DM/TR → +DI/-DI → DX → ADX
 *
 * 步骤：
 * 1. 计算 +DM, -DM, TR
 * 2. Wilder 平滑（period 周期）得到 +DM14, -DM14, TR14
 * 3. +DI = 100 * +DM14 / TR14, -DI = 100 * -DM14 / TR14
 * 4. DX = 100 * |+DI - -DI| / (+DI + -DI)
 * 5. ADX = Wilder 平滑 DX（period 周期）
 *
 * 输出：前 2*period-1 项为 NaN（第一个 period 平滑 DI，第二个 period 平滑 ADX）
 */

/**
 * @param high 最高价序列
 * @param low 最低价序列
 * @param close 收盘价序列
 * @param period 周期，默认 14
 * @returns { adx, plusDI, minusDI } 与输入等长
 */
export function adx(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): { adx: number[]; plusDI: number[]; minusDI: number[] } {
  const n = high.length;
  if (n !== low.length || n !== close.length) {
    throw new Error('[adx] high, low, close must have same length');
  }

  const plusDM = new Array<number>(n).fill(0);
  const minusDM = new Array<number>(n).fill(0);
  const tr = new Array<number>(n).fill(0);

  // Step 1: raw +DM, -DM, TR
  tr[0] = high[0]! - low[0]!;
  for (let i = 1; i < n; i++) {
    const upMove = high[i]! - high[i - 1]!;
    const downMove = low[i - 1]! - low[i]!;

    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;

    tr[i] = Math.max(
      high[i]! - low[i]!,
      Math.abs(high[i]! - close[i - 1]!),
      Math.abs(low[i]! - close[i - 1]!)
    );
  }

  // Step 2: Wilder smooth
  const plusDM14 = wilderSmooth(plusDM, period);
  const minusDM14 = wilderSmooth(minusDM, period);
  const tr14 = wilderSmooth(tr, period);

  // Step 3: +DI, -DI
  const plusDI = new Array<number>(n).fill(Number.NaN);
  const minusDI = new Array<number>(n).fill(Number.NaN);
  const dx = new Array<number>(n).fill(Number.NaN);

  for (let i = period - 1; i < n; i++) {
    if (tr14[i]! > 0) {
      plusDI[i] = (100 * plusDM14[i]!) / tr14[i]!;
      minusDI[i] = (100 * minusDM14[i]!) / tr14[i]!;
    }
    const diSum = plusDI[i]! + minusDI[i]!;
    if (diSum > 0) {
      dx[i] = (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / diSum;
    }
  }

  // Step 4: ADX = Wilder smooth DX
  const adxArr = wilderSmoothFrom(dx, period, period - 1);

  return { adx: adxArr, plusDI, minusDI };
}

/**
 * Wilder 平滑：seed = SMA[0..period-1], 之后 out[i] = (prev * (period-1) + raw[i]) / period
 * 等价于 out[i] = prev - prev/period + raw[i]/period
 */
function wilderSmooth(raw: number[], period: number): number[] {
  const n = raw.length;
  const out = new Array<number>(n).fill(Number.NaN);
  if (n < period) return out;

  let sum = 0;
  for (let i = 0; i < period; i++) sum += raw[i]!;
  out[period - 1] = sum;

  for (let i = period; i < n; i++) {
    out[i] = out[i - 1]! - out[i - 1]! / period + raw[i]!;
  }
  return out;
}

/**
 * 对 raw 从 startIdx 开始做 Wilder 平滑（period 周期），startIdx 之前的输出为 NaN
 * seed = SMA(raw[startIdx..startIdx+period-1])
 */
function wilderSmoothFrom(raw: number[], period: number, startIdx: number): number[] {
  const n = raw.length;
  const out = new Array<number>(n).fill(Number.NaN);
  const seedEnd = startIdx + period;
  if (seedEnd > n) return out;

  let sum = 0;
  for (let i = startIdx; i < seedEnd; i++) {
    if (!Number.isNaN(raw[i])) sum += raw[i]!;
    else return out; // not enough valid data
  }
  out[seedEnd - 1] = sum / period;

  for (let i = seedEnd; i < n; i++) {
    if (Number.isNaN(raw[i])) continue;
    out[i] = out[i - 1]! - out[i - 1]! / period + raw[i]!;
  }
  return out;
}
