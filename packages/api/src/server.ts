/**
 * Fastify HTTP API Server
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { indicatorsRoutes } from './routes/indicators.js';
import { ohlcvRoutes } from './routes/ohlcv.js';
import { orderbookRoutes } from './routes/orderbook.js';
import { bboRoutes } from './routes/bbo.js';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('api-server');

export async function buildServer(port: number): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: false });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  // Register routes
  fastify.get('/api/v1/indicators', indicatorsRoutes);
  fastify.get('/api/v1/ohlcv', ohlcvRoutes);
  fastify.get('/api/v1/orderbook', orderbookRoutes);
  fastify.get('/api/v1/bbo', bboRoutes);

  // Start listening
  await fastify.listen({ port, host: '0.0.0.0' });
  log.info(`Fastify server listening on port ${port}`);

  return fastify;
}
