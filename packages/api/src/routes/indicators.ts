/**
 * GET /api/v1/indicators
 * Query: exchange, symbol, interval, limit(默认200)
 *       ema[]=20&ema[]=50    （任意多个 period）
 *       rsi=14               （RSI period，可选）
 *       macd=1               （开启 MACD，可选）
 *       macd_fast=12&macd_slow=26&macd_signal=9
 *       atr=14               （ATR period，可选）
 * Response: { bars: [{ time, open, high, low, close, volume,
 *             ema_20, ema_50, rsi_14, macd, macd_signal, macd_histogram, atr_14 }] }
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { fetchRecentOhlcv } from '@sync-indicator/core';
import { ema } from '@sync-indicator/core';
import { macd } from '@sync-indicator/core';
import { atr } from '@sync-indicator/core';
import { rsi } from '@sync-indicator/core';
import { bollinger } from '@sync-indicator/core';
import { adx } from '@sync-indicator/core';
import { getPool } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-indicators');

interface IndicatorsQuery {
  exchange?: string;
  symbol?: string;
  interval?: string;
  limit?: string;
  ema?: string | string[];
  rsi?: string;
  macd?: string;
  macd_fast?: string;
  macd_slow?: string;
  macd_signal?: string;
  atr?: string;
  bollinger?: string;
  adx?: string;
}

function parseIntOrDefault(s: string | undefined, def: number): number {
  if (!s) return def;
  const n = parseInt(s, 10);
  return isNaN(n) ? def : n;
}

function toNumberArr(v: string | string[] | undefined): number[] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
}

/** warmup 缓冲：max(max_ema_period, 35+signal_period, bollinger_period, 2*adx_period) + 50 */
function calcWarmup(emaPeriods: number[], macdFast: number, macdSlow: number, macdSignal: number, bollingerPeriod: number, adxPeriod: number): number {
  const maxEma = emaPeriods.length > 0 ? Math.max(...emaPeriods) : 0;
  const adxWarmup = adxPeriod > 0 ? 2 * adxPeriod : 0;
  return Math.max(maxEma, 35 + macdSignal, bollingerPeriod, adxWarmup) + 50;
}

export async function indicatorsRoutes(
  request: FastifyRequest<{ Querystring: IndicatorsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    reply.status(500).send({ error: 'DB pool not initialized' });
    return;
  }

  const exchange = request.query.exchange ?? 'okx';
  const symbol = request.query.symbol ?? 'ETH-USDT';
  const interval = request.query.interval ?? '1H';
  const limit = parseIntOrDefault(request.query.limit, 200);

  const emaPeriods = toNumberArr(request.query.ema);
  const rsiPeriod = parseIntOrDefault(request.query.rsi, 0);
  const macdEnabled = request.query.macd === '1';
  const macdFast = parseIntOrDefault(request.query.macd_fast, 12);
  const macdSlow = parseIntOrDefault(request.query.macd_slow, 26);
  const macdSignal = parseIntOrDefault(request.query.macd_signal, 9);
  const atrPeriod = parseIntOrDefault(request.query.atr, 0);
  const bollingerParam = request.query.bollinger;
  const adxParam = request.query.adx;

  if (emaPeriods.length === 0 && !rsiPeriod && !macdEnabled && !atrPeriod && !bollingerParam && !adxParam) {
    reply.status(400).send({ error: 'at least one indicator parameter required (ema, rsi, macd, atr, bollinger, adx)' });
    return;
  }

  // Parse bollinger/adx periods for warmup calc
  const bollingerPeriod = bollingerParam ? parseIntOrDefault(bollingerParam.split(',')[0], 20) : 0;
  const adxPeriod = adxParam ? parseIntOrDefault(adxParam, 14) : 0;

  // Calculate warmup
  const warmup = calcWarmup(emaPeriods, macdFast, macdSlow, macdSignal, bollingerPeriod, adxPeriod);
  const fetchLimit = limit + warmup;

  try {
    const bars = await fetchRecentOhlcv(pool, exchange, symbol, interval, fetchLimit);
    if (bars.length === 0) {
      reply.send({ bars: [] });
      return;
    }

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);

    // Compute EMA for each requested period
    const emaResults: Record<string, number[]> = {};
    for (const p of emaPeriods) {
      emaResults[p] = ema(closes, p);
    }

    // Compute RSI if requested
    const rsiResult = rsiPeriod > 0 ? rsi(closes, rsiPeriod) : null;

    // Compute MACD if requested
    const macdResult = macdEnabled
      ? macd(closes, { fast: macdFast, slow: macdSlow, signal: macdSignal })
      : null;

    // Compute ATR if requested
    const atrResult = atrPeriod > 0 ? atr(highs, lows, closes, atrPeriod) : null;

    // Compute Bollinger if requested (format: "period,stdDev" or just "period")
    let bollingerResult: ReturnType<typeof bollinger> | null = null;
    let bollingerStdDev = 2;
    if (bollingerParam) {
      const parts = bollingerParam.split(',');
      bollingerStdDev = parts[1] ? parseFloat(parts[1]) : 2;
      bollingerResult = bollinger(closes, bollingerPeriod, bollingerStdDev);
    }

    // Compute ADX if requested
    let adxResult: ReturnType<typeof adx> | null = null;
    if (adxParam) {
      adxResult = adx(highs, lows, closes, adxPeriod);
    }

    // Build response bars (drop warmup period)
    const resultBars = bars.slice(warmup).map((bar, i) => {
      const idx = warmup + i;
      const out: Record<string, unknown> = {
        time: bar.time_ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      };

      for (const p of emaPeriods) {
        out[`ema_${p}`] = emaResults[p]?.[idx] ?? null;
      }
      if (rsiResult) {
        out[`rsi_${rsiPeriod}`] = rsiResult[idx] ?? null;
      }
      if (macdResult) {
        out['macd'] = macdResult.macd[idx] ?? null;
        out['macd_signal'] = macdResult.signal[idx] ?? null;
        out['macd_histogram'] = macdResult.histogram[idx] ?? null;
      }
      if (atrResult) {
        out[`atr_${atrPeriod}`] = atrResult[idx] ?? null;
      }
      if (bollingerResult) {
        out['bb_upper'] = bollingerResult.upper[idx] ?? null;
        out['bb_middle'] = bollingerResult.middle[idx] ?? null;
        out['bb_lower'] = bollingerResult.lower[idx] ?? null;
      }
      if (adxResult) {
        out[`adx_${adxPeriod}`] = adxResult.adx[idx] ?? null;
        out[`plus_di_${adxPeriod}`] = adxResult.plusDI[idx] ?? null;
        out[`minus_di_${adxPeriod}`] = adxResult.minusDI[idx] ?? null;
      }

      return out;
    });

    reply.send({ bars: resultBars });
  } catch (err) {
    log.error('indicators error', err instanceof Error ? err.message : err);
    reply.status(500).send({ error: 'internal server error' });
  }
}
