# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`sync-indicator` is a standalone TypeScript package for cryptocurrency data synchronization and technical indicator calculation. It was migrated from `auto-financial/sources/` and operates **independently** — it does not depend on `@auto-financial/` packages, and vice versa. Both packages share the same PostgreSQL database as the only integration point.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  sync-indicator                     │
│  (独立部署，数据同步服务)                            │
├─────────────────────────────────────────────────────┤
│  src/scripts/          │  src/indicators/          │
│  - fetch-okx-ohlcv     │  - ema, macd, atr         │
│  - sync-realtime-ohlcv │  - fill-indicators        │
│  - sync-realtime-bbo   │  - macd-cross             │
│  - sync-realtime-trades│                           │
│  - fetch-instruments   │  src/data/                │
│  - backfill-indicators │  - db.ts (PostgreSQL)     │
│  - init-db             │  - sources/okx*.ts        │
├─────────────────────────────────────────────────────┤
│                    PostgreSQL                       │
│         (shared with @auto-financial/)              │
└─────────────────────────────────────────────────────┘
```

## Package Relationship

| Package | Role | Dependency |
|---------|------|------------|
| `@sync-indicator` | Data sync + indicators | None (independent) |
| `@auto-financial/*` | Trading strategies, execution | Reads from same DB |

- **Shared contract**: PostgreSQL tables (`ohlcv`, `ohlcv_indicators`, etc.)
- **No code-level coupling** between packages

## Common Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm run build

# Database initialization
pnpm run init-db

# Data fetching (historical OHLCV)
pnpm run fetch-ohlcv

# Indicator backfill (EMA/MACD/ATR → ohlcv_indicators)
pnpm run backfill-indicators

# Real-time sync (WebSocket → DB)
pnpm run sync-realtime
pnpm run sync-realtime-bbo
pnpm run sync-realtime-trades

# Combined: fetch history then realtime sync
pnpm run sync-ohlcv
```

## Docker

```bash
# Build and run all services
docker compose -f docker/docker-compose.yml up -d

# Run specific service
docker compose -f docker/docker-compose.yml up -d sync-ohlcv
```

## Key Environment Variables

- `DATABASE_URL` - PostgreSQL connection (e.g., `postgresql://quant:quant@localhost:5432/quant`)

## Database Tables

| Table | Description |
|-------|-------------|
| `ohlcv` | K-line data (exchange, symbol, interval, OHLCV) |
| `ohlcv_indicators` | Technical indicators (EMA, MACD, ATR) |
| `trades` | Real-time trade data |
| `bbo` | Best bid/offer (BBO) data |
| `instruments` | Trading pair metadata |

## SQL Migrations

SQL files are in `sql/` directory and should be executed in order:
- `001_ohlcv.sql` - K-line table
- `005_ohlcv_indicators.sql` - Indicators table
- `006_ohlcv_indicators_ema20_50.sql` - EMA20/50 columns
- `011_ohlcv_indicators_ema10.sql` - EMA10 column (for 15m micro-filter)

## Indicators

Exported from `src/indicators/`:
- `ema(close, period)` - Exponential Moving Average
- `macd(close, options?)` - MACD (returns `{ macd, signal, histogram }`)
- `atr(high, low, close, period?)` - Average True Range
- `macdGoldenCross(macd, signal)` - Golden cross detection
- `fillMissingIndicatorsForBars(...)` - In-memory indicator fill for bars missing DB indicators

## Directory Structure

```
sync-indicator/
├── src/
│   ├── config/         # Environment variable loading
│   ├── data/           # DB access, OKX REST/WebSocket sources
│   ├── indicators/     # EMA, MACD, ATR, fill-indicators
│   ├── ops/            # Logger
│   ├── scripts/        # CLI entry points (fetch, sync, backfill)
│   └── types/          # OHLCV, Trade, Bar types
├── sql/                # Database migrations
├── docker/             # Docker Compose for services
├── package.json
└── tsconfig.json
```

## Important Notes

- This package is **independent** from `@auto-financial/` - do not add dependencies on it
- Indicators are pure functions; both packages maintain their own copies to avoid coupling
- Real-time services use WebSocket with automatic reconnection and heartbeat
- All sync scripts write to the same PostgreSQL instance shared with `auto-financial`
