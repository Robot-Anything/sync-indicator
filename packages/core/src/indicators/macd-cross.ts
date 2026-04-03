/**
 * MACD 金叉/死叉：由 MACD 线与 Signal 线得到交叉序列
 * 金叉：前一根 MACD < Signal，当前根 MACD >= Signal → 1；否则 0
 */

/**
 * @param macd MACD 线序列（DIFF）
 * @param signal 信号线序列（DEA）
 * @returns 与输入等长；macd_cross[i]=1 表示第 i 根金叉，0 表示否；无效/NaN 视为不满足
 */
export function macdGoldenCross(macd: number[], signal: number[]): number[] {
  const n = macd.length;
  if (n !== signal.length) {
    throw new Error('[macdGoldenCross] macd and signal must have same length');
  }
  const out: number[] = new Array(n);
  out[0] = 0;
  for (let i = 1; i < n; i++) {
    const prevMacd = macd[i - 1]!;
    const prevSig = signal[i - 1]!;
    const currMacd = macd[i]!;
    const currSig = signal[i]!;
    const prevValid = Number.isFinite(prevMacd) && Number.isFinite(prevSig);
    const currValid = Number.isFinite(currMacd) && Number.isFinite(currSig);
    if (prevValid && currValid && prevMacd < prevSig && currMacd >= currSig) {
      out[i] = 1;
    } else {
      out[i] = 0;
    }
  }
  return out;
}
