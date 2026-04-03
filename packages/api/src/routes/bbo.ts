/**
 * GET /api/v1/bbo
 * Query: exchange, symbol
 * Response: { time, bid_px, bid_sz, ask_px, ask_sz }
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import { getPool } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-bbo');

interface BboQuery {
  exchange?: string;
  symbol?: string;
}

export async function bboRoutes(
  request: FastifyRequest<{ Querystring: BboQuery }>,
  reply: FastifyReply
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    reply.status(500).send({ error: 'DB pool not initialized' });
    return;
  }

  const exchange = request.query.exchange ?? 'okx';
  const symbol = request.query.symbol ?? 'ETH-USDT';

  try {
    const row = await queryLatestBbo(pool, exchange, symbol);
    if (!row) {
      reply.status(404).send({ error: 'bbo not found' });
      return;
    }

    reply.send({
      time: row.time_ts,
      bid_px: row.bid_px,
      bid_sz: row.bid_sz,
      ask_px: row.ask_px,
      ask_sz: row.ask_sz,
    });
  } catch (err) {
    log.error('bbo error', err instanceof Error ? err.message : err);
    reply.status(500).send({ error: 'internal server error' });
  }
}

async function queryLatestBbo(
  pool: Pool,
  exchange: string,
  symbol: string
): Promise<{ time_ts: number; bid_px: number; bid_sz: number; ask_px: number; ask_sz: number } | null> {
  const sql = `
    SELECT time_ts, bid_px, bid_sz, ask_px, ask_sz
    FROM bbo
    WHERE exchange = $1 AND symbol = $2
    ORDER BY time_ts DESC
    LIMIT 1
  `;
  const result = await pool.query(sql, [exchange, symbol]);
  if (result.rows.length === 0) return null;
  const r = result.rows[0]!;
  return {
    time_ts: Number(r.time_ts),
    bid_px: Number(r.bid_px),
    bid_sz: Number(r.bid_sz),
    ask_px: Number(r.ask_px),
    ask_sz: Number(r.ask_sz),
  };
}
