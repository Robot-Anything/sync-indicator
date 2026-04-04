/**
 * GET /api/v1/symbols
 * Query: exchange (optional, default 'okx')
 * Response: { symbols: string[] }
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-symbols');

interface SymbolsQuery {
  exchange?: string;
}

export async function symbolsRoutes(
  request: FastifyRequest<{ Querystring: SymbolsQuery }>,
  reply: FastifyReply
): Promise<void> {
  const pool = getPool();
  if (!pool) {
    reply.status(500).send({ error: 'DB pool not initialized' });
    return;
  }

  const exchange = request.query.exchange ?? 'okx';

  try {
    const sql = `
      SELECT DISTINCT symbol FROM (
        SELECT symbol FROM ohlcv WHERE exchange = $1
        UNION
        SELECT symbol FROM bbo WHERE exchange = $1
        UNION
        SELECT symbol FROM orderbook_snapshot WHERE exchange = $1
        UNION
        SELECT symbol FROM trades WHERE exchange = $1
      ) t
      ORDER BY symbol
    `;
    const result = await pool.query(sql, [exchange]);
    const symbols = result.rows.map((r: { symbol: string }) => r.symbol);
    reply.send({ symbols });
  } catch (err) {
    log.error('symbols error', err instanceof Error ? err.message : err);
    reply.status(500).send({ error: 'internal server error' });
  }
}
