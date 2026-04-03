/**
 * @sync-indicator/api HTTP 服务入口
 */

import { loadEnv } from '@sync-indicator/core';
import { initPool } from '@sync-indicator/core';
import { buildServer } from './server.js';

loadEnv();

const PORT = parseInt(process.env.API_PORT ?? '3001', 10);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }

  // Initialize DB pool (shared with core)
  initPool(databaseUrl);

  const server = await buildServer(PORT);

  const shutdown = (): void => {
    server.close().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('main', err instanceof Error ? err.message : err);
  process.exit(1);
});
