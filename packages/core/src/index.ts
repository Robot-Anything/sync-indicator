/**
 * @sync-indicator/core
 * Types, indicators, and shared data access
 */

// Types
export type { OHLCV, Trade, Order, Position, Symbol, StrategyConfig } from './types/index.js';

// Indicators
export { ema } from './indicators/ema.js';
export { macd, type MacdOptions } from './indicators/macd.js';
export { atr } from './indicators/atr.js';
export { macdGoldenCross } from './indicators/macd-cross.js';
export { rsi } from './indicators/rsi.js';

// Data access
export { initPool, getPool, insertOhlcv, upsertOhlcv, type OhlcvRow } from './data/db.js';
export { fetchRecentOhlcv, type OhlcvBar } from './data/db-ohlcv-query.js';
export { normalizeOkxCandle } from './data/normalize.js';
export { cleanOhlcvRow, cleanOhlcvBatch } from './data/clean-ohlcv.js';

// Config
export { loadEnv, loadConfig, type AppConfig } from './config/index.js';

// Logger
export { createLogger, type Logger } from './ops/logger.js';
