/**
 * GET /api/v1/orderbook
 * Query: exchange, symbol, depth(默认20)
 * Response: { time, bids: [[price, size]], asks: [[price, size]] }
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { getPool } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-orderbook');

interface OrderbookQuery {
  exchange?: string;
  symbol?: string;
  depth?: string;
}

function parseIntOrDefault(s: string | undefined, def: number): number {
  if (!s) return def;
  const n = parseInt(s, 10);
  return isNaN(n) ? def : n;
}

export async function orderbookRoutes(
  request: FastifyRequest<{ Querystring: OrderbookQuery }>,
  reply: FastifyReply
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    reply.status(500).send({ error: 'DB pool not initialized' });
    return;
  }

  const exchange = request.query.exchange ?? 'okx';
  const symbol = request.query.symbol ?? 'ETH-USDT';
  const depth = parseIntOrDefault(request.query.depth, 20);

  try {
    const row = await queryOrderbook(pool, exchange, symbol);
    if (!row) {
      reply.status(404).send({ error: 'orderbook not found' });
      return;
    }

    // Parse JSONB bids/asks and slice to requested depth
    const bids: [number, number][] = (row.bids as [number, number][]).slice(0, depth);
    const asks: [number, number][] = (row.asks as [number, number][]).slice(0, depth);

    reply.send({
      time: row.time_ts,
      bids,
      asks,
    });
  } catch (err) {
    log.error('orderbook error', err instanceof Error ? err.message : err);
    reply.status(500).send({ error: 'internal server error' });
  }
}

async function queryOrderbook(
  pool: Pool,
  exchange: string,
  symbol: string
): Promise<{ time_ts: number; bids: unknown; asks: unknown } | null> {
  const sql = `
    SELECT time_ts, bids, asks
    FROM orderbook_snapshot
    WHERE exchange = $1 AND symbol = $2
  `;
  const result = await pool.query(sql, [exchange, symbol]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0]!;
  return {
    time_ts: Number(r.time_ts),
    bids: typeof r.bids === 'string' ? JSON.parse(r.bids) : r.bids,
    asks: typeof r.asks === 'string' ? JSON.parse(r.asks) : r.asks,
  };
}
