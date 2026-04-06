# sync-indicator

OKX 行情数据同步 + 技术指标 HTTP API。pnpm monorepo，三个包：

| 包 | 职责 |
|----|------|
| `@sync-indicator/core` | 共享：指标纯函数（EMA/MACD/ATR/RSI/BB/ADX）、类型、DB 工具 |
| `@sync-indicator/sync` | 数据同步：K 线、成交、BBO、订单簿 → PostgreSQL |
| `@sync-indicator/api` | HTTP API：Fastify，指标按请求即时计算 |
| `sync-indicator-web` | Web 前端：React + lightweight-charts 行情图表 |

---

## 目录结构

```
sync-indicator/
├── packages/
│   ├── core/          # 共享指标函数、DB 查询工具
│   ├── sync/          # OKX WebSocket/REST 同步脚本
│   ├── api/           # Fastify HTTP API
│   └── web/           # React 前端（lightweight-charts）
├── sql/               # 数据库初始化 SQL
├── docker/            # Docker Compose + Dockerfile
└── pnpm-workspace.yaml
```

---

## 快速开始

### 环境变量

根目录新建 `.env`：

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/quant
API_PORT=3001
```

### 安装 & 构建

```bash
pnpm install
pnpm run build          # 构建全部包（core → sync → api）
```

### 初始化数据库

```bash
pnpm run init-db        # 创建所有表
```

### 单独运行各服务

```bash
# 拉取历史 K 线（2025-01-01 至今）+ 启动实时同步
pnpm --filter @sync-indicator/sync run sync-ohlcv

# 实时成交明细
pnpm --filter @sync-indicator/sync run sync-realtime-trades

# 实时 BBO（买卖一档，1 秒采样）
pnpm --filter @sync-indicator/sync run sync-realtime-bbo

# 实时订单簿（20 档快照）
pnpm --filter @sync-indicator/sync run sync-realtime-orderbook

# HTTP API 服务
pnpm --filter @sync-indicator/api run start

# 开发模式（热重载）
pnpm --filter @sync-indicator/api run dev

# Web 前端开发
pnpm --filter sync-indicator-web run dev

# 构建 Web 前端
pnpm --filter sync-indicator-web run build
```

---

## Docker 部署

```bash
# 启动所有服务
docker compose -f docker/docker-compose.yml up -d

# 只启动数据同步
docker compose -f docker/docker-compose.yml up -d sync-ohlcv sync-realtime-trades sync-realtime-bbo sync-realtime-orderbook

# 只启动 API
docker compose -f docker/docker-compose.yml up -d indicator-api
```

**Docker 服务列表：**

| 服务 | 说明 | restart |
|------|------|---------|
| `init-db` | 初始化表结构（一次性） | no |
| `fetch-instruments` | 拉取合约信息（一次性） | no |
| `sync-ohlcv` | 历史 K 线 + 实时 K 线 WebSocket | unless-stopped |
| `sync-realtime-trades` | 实时逐笔成交 | unless-stopped |
| `sync-realtime-bbo` | 实时买卖一档 | unless-stopped |
| `sync-realtime-orderbook` | 实时订单簿 20 档 | unless-stopped |
| `indicator-api` | HTTP API（默认 :3001） | unless-stopped |
| `web` | Web 前端（nginx，默认 :3000） | unless-stopped |

---

## HTTP API

Base URL：`http://localhost:3001`

### `GET /health`

```json
{ "status": "ok" }
```

---

### `GET /api/v1/indicators`

**即时计算指标**，从原始 K 线出发，按请求参数灵活组合。

**Query 参数：**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `exchange` | string | `okx` | 交易所 |
| `symbol` | string | `ETH-USDT` | 交易对 |
| `interval` | string | `1H` | K 线周期：`1H` `4H` `15m` `1D` |
| `limit` | number | `200` | 返回 bar 数量 |
| `ema[]` | number[] | — | EMA 周期，可多个 |
| `rsi` | number | — | RSI 周期 |
| `macd` | `1` | — | 开启 MACD（使用默认参数） |
| `macd_fast` | number | `12` | MACD 快线周期 |
| `macd_slow` | number | `26` | MACD 慢线周期 |
| `macd_signal` | number | `9` | MACD 信号线周期 |
| `atr` | number | — | ATR 周期 |
| `bollinger` | string | — | Bollinger Bands 参数，格式 `"period,stdDev"`（如 `20,2`） |
| `adx` | number | — | ADX 周期 |

至少需要传一个指标参数。

**示例：**

```bash
# EMA20 + EMA50 + RSI14
GET /api/v1/indicators?symbol=ETH-USDT&interval=1H&limit=100&ema[]=20&ema[]=50&rsi=14

# MACD（自定义参数）+ ATR14
GET /api/v1/indicators?interval=4H&macd=1&macd_fast=12&macd_slow=26&macd_signal=9&atr=14

# 多指标组合
GET /api/v1/indicators?interval=15m&ema[]=10&ema[]=20&ema[]=50&rsi=14&macd=1&atr=14

# Bollinger Bands + ADX
GET /api/v1/indicators?interval=1H&ema[]=20&bollinger=20,2&adx=14
```

**响应：**

```json
{
  "bars": [
    {
      "time": 1735689600000,
      "open": 3400.5,
      "high": 3450.0,
      "low": 3380.2,
      "close": 3420.1,
      "volume": 12345.67,
      "ema_20": 3398.4,
      "ema_50": 3350.2,
      "rsi_14": 58.3,
      "macd": 12.5,
      "macd_signal": 10.2,
      "macd_histogram": 2.3,
      "atr_14": 45.6,
      "bb_upper": 3480.2,
      "bb_middle": 3400.0,
      "bb_lower": 3319.8,
      "adx_14": 25.3,
      "plus_di_14": 30.1,
      "minus_di_14": 18.5
    }
  ]
}
```

响应字段名根据参数动态生成：`ema_<period>`、`rsi_<period>`、`atr_<period>`、`adx_<period>`、`plus_di_<period>`、`minus_di_<period>`、`bb_upper`/`bb_middle`/`bb_lower`。

---

### `GET /api/v1/symbols`

获取支持的交易对列表。

| 参数 | 默认 |
|------|------|
| `exchange` | `okx` |

```json
{
  "symbols": ["BTC-USDT", "ETH-USDT"]
}
```

---

### `GET /api/v1/ohlcv`

原始 K 线数据。

| 参数 | 默认 |
|------|------|
| `exchange` | `okx` |
| `symbol` | `ETH-USDT` |
| `interval` | `1H` |
| `limit` | `200` |

```json
{
  "bars": [
    { "time": 1735689600000, "open": 3400.5, "high": 3450.0, "low": 3380.2, "close": 3420.1, "volume": 12345.67 }
  ]
}
```

---

### `GET /api/v1/orderbook`

最新订单簿快照（由 sync-realtime-orderbook 持续更新）。

| 参数 | 默认 |
|------|------|
| `exchange` | `okx` |
| `symbol` | `ETH-USDT` |
| `depth` | `20` |

```json
{
  "time": 1735689600123,
  "bids": [[3420.1, 5.2], [3419.8, 12.0]],
  "asks": [[3420.5, 3.1], [3420.9, 8.4]]
}
```

---

### `GET /api/v1/bbo`

最新买卖一档。

| 参数 | 默认 |
|------|------|
| `exchange` | `okx` |
| `symbol` | `ETH-USDT` |

```json
{
  "time": 1735689600456,
  "bid_px": 3420.1,
  "bid_sz": 5.2,
  "ask_px": 3420.5,
  "ask_sz": 3.1
}
```

---

## 数据库表

| 表 | 说明 | 写入方 |
|----|------|--------|
| `ohlcv` | K 线（exchange, symbol, interval, time_ts → OHLCV） | sync-ohlcv |
| `trades` | 逐笔成交明细 | sync-realtime-trades |
| `bbo` | 买卖一档（1 秒采样） | sync-realtime-bbo |
| `orderbook_snapshot` | 订单簿最新快照（每个品种一行，JSONB） | sync-realtime-orderbook |
| `instruments` | 合约基本信息 | fetch-instruments |

---

## Web 前端

基于 React + lightweight-charts 的行情图表界面，位于 `packages/web/`。

**功能：**
- K 线图 + 成交量柱状图
- 切换交易对、K 线周期（15m / 1H / 4H / 1D）
- 实时 BBO + 订单簿面板
- 可切换技术指标叠加/子图：
  - EMA（20/50）
  - RSI（14）
  - MACD
  - ATR（14）
  - Bollinger Bands（20,2）
  - ADX / +DI / -DI（14）

**开发：**

```bash
pnpm --filter sync-indicator-web run dev    # http://localhost:5173
```

**Docker：** 通过 nginx 打包，默认端口 3000，反向代理 API 到 `indicator-api:3001`。

---

## 指标说明

所有指标均为纯函数，位于 `@sync-indicator/core`，API 请求时即时计算，不落库。

| 指标 | 算法 | 参数 |
|------|------|------|
| EMA | α = 2/(period+1)，SMA 种子 | 任意 period |
| MACD | EMA(fast) - EMA(slow)，Signal = EMA(macd\_line) | fast/slow/signal 可配 |
| RSI | Wilder 平滑（α = 1/period），SMA 种子 | 任意 period |
| ATR | SMA(TR, period)，滑动窗口 O(n) | 任意 period |
| MACD 金叉 | 前根 MACD < Signal 且当根 MACD ≥ Signal | — |
| Bollinger Bands | SMA ± stdDev × σ | period, stdDev |
| ADX / +DI / -DI | Wilder 平滑 TR/DX | period |

---

## 同步数据范围

| 维度 | 当前值 |
|------|--------|
| 交易所 | OKX |
| 品种 | ETH-USDT |
| K 线周期 | 1H、4H、15m、1D |
| 历史起点 | 2025-01-01 00:00:00 UTC |
| 实时同步 | 启动后持续，自动重连 |
