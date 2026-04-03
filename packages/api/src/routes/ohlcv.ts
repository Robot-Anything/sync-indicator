/**
 * GET /api/v1/ohlcv
 * Query: exchange, symbol, interval, limit(默认200)
 * Response: { bars: [{ time, open, high, low, close, volume }] }
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { fetchRecentOhlcv } from '@sync-indicator/core';
import { getPool } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-ohlcv');

interface OhlcvQuery {
  exchange?: string;
  symbol?: string;
  interval?: string;
  limit?: string;
}

function parseIntOrDefault(s: string | undefined, def: number): number {
  if (!s) return def;
  const n = parseInt(s, 10);
  return isNaN(n) ? def : n;
}

export async function ohlcvRoutes(
  request: FastifyRequest<{ Querystring: OhlcvQuery }>,
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

  try {
    const bars = await fetchRecentOhlcv(pool, exchange, symbol, interval, limit);
    const resultBars = bars.map((bar) => ({
      time: bar.time_ts,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    }));
    reply.send({ bars: resultBars });
  } catch (err) {
    log.error('ohlcv error', err instanceof Error ? err.message : err);
    reply.status(500).send({ error: 'internal server error' });
  }
}
