# PRD：将 @auto-financial/ 同步指标相关内容迁移至 @sync-indicator/

| 字段       | 值                          |
| ---------- | --------------------------- |
| 作者       | Codex                       |
| 日期       | 2026-04-02                  |
| 状态       | Draft                       |
| 目标仓库   | `@sync-indicator/`          |
| 源仓库     | `@auto-financial/sources/`  |

---

## 1. 背景与动机

`@auto-financial/` 当前的 `sources/` 包承载了两类职责：

1. **数据同步层** — OHLCV 历史抓取、WebSocket 实时同步、BBO/Trades 流、Instruments 拉取。
2. **技术指标层** — EMA / MACD / ATR 计算、`backfill-ohlcv-indicators` 脚本、`fill-indicators` 实时补齐。

量化策略（`quantification/`）对这些能力有强依赖（import 指标函数、依赖 DB 表 `ohlcv_indicators`），但它们与交易逻辑本身无耦合。将其拆出到独立包 `@sync-indicator/` 可以：

- **职责收敛** — `auto-financial` 只保留交易 / 策略 / 下单相关逻辑。
- **完全独立** — `@sync-indicator` 不依赖 `@auto-financial/`，反之亦然。两个包通过共享数据库协作，无代码层耦合。
- **复用** — 指标计算可被非交易项目（看板、信号监控等）独立引用。
- **独立部署** — 数据同步服务可独立扩缩容，不受量化进程发版节奏影响。

## 2. 迁移范围

### 2.1 文件清单（从 `auto-financial/sources/` 迁出）

| 类别       | 文件 / 目录                                                                 | 说明                                                   |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| 数据同步   | `src/scripts/fetch-okx-ohlcv.ts`                                            | 历史 K 线抓取（OKX REST API → PostgreSQL）             |
| 数据同步   | `src/scripts/sync-realtime-ohlcv.ts`                                        | 实时 K 线 WebSocket 同步                               |
| 数据同步   | `src/scripts/sync-realtime-bbo.ts`                                          | 实时 BBO 流                                            |
| 数据同步   | `src/scripts/sync-realtime-trades.ts`                                       | 实时逐笔成交流                                         |
| 数据同步   | `src/scripts/fetch-instruments.ts`                                          | 交易对元数据拉取                                       |
| 数据同步   | `src/scripts/init-db.ts`                                                    | DB 初始化                                              |
| 指标计算   | `src/strategy/indicators/ema.ts`                                            | EMA（指数移动平均）                                    |
| 指标计算   | `src/strategy/indicators/macd.ts`                                           | MACD（移动平均收敛/发散）                              |
| 指标计算   | `src/strategy/indicators/macd-cross.ts`                                     | MACD 金叉检测                                          |
| 指标计算   | `src/strategy/indicators/atr.ts`                                            | ATR（平均真实波幅）                                    |
| 指标计算   | `src/strategy/indicators/index.ts`                                          | 指标导出入口                                           |
| 指标回填   | `src/scripts/backfill-ohlcv-indicators.ts`                                  | 批量回填指标到 `ohlcv_indicators` 表                   |
| 指标补齐   | `src/strategy/data/fill-indicators.ts`                                      | 内存级指标补齐（为策略/LLM 提供兜底）                  |
| 数据层     | `src/data/db.ts`, `db-bbo.ts`, `db-instruments.ts`, `db-trades.ts`          | DB 访问层                                              |
| 数据层     | `src/data/sources/okx.ts`, `okx-ws.ts`, `okx-ws-bbo.ts`, `okx-ws-trades.ts`| OKX REST / WebSocket 数据源                            |
| 数据层     | `src/data/clean-ohlcv.ts`, `src/data/normalize.ts`                          | 数据清洗与标准化                                       |
| 基础设施   | `src/config/index.ts`, `src/ops/logger.ts`, `src/types/index.ts`            | 配置加载、日志、共享类型                               |
| 类型定义   | `src/strategy/band-types.ts`                                                | Bar / BarWithIndicators 类型（指标与策略共用）         |
| SQL 迁移   | `quantification/core/sql/001_ohlcv.sql`                                     | `ohlcv` 表 DDL                                        |
| SQL 迁移   | `quantification/core/sql/005_ohlcv_indicators.sql`                          | `ohlcv_indicators` 表 DDL                              |
| SQL 迁移   | `quantification/core/sql/006_ohlcv_indicators_ema20_50.sql`                 | EMA20/50 列变更                                        |
| SQL 迁移   | `quantification/core/sql/011_ohlcv_indicators_ema10.sql`                    | EMA10 列变更                                           |
| Docker     | `sources/docker-compose.yml`（sync-realtime 相关 service）                  | 数据同步容器编排                                       |

### 2.2 保留在 @auto-financial/ 的内容

| 类别       | 目录 / 模块                          | 理由                                     |
| ---------- | ------------------------------------ | ---------------------------------------- |
| 策略       | `strategys/`                         | 交易策略逻辑                             |
| 量化核心   | `quantification/core`（除 SQL 上述） | 信号生成、回测、实盘执行                 |
| 量化 LLM   | `quantification/llm`                 | LLM 信号推理                             |
| Server     | `quantification/server`              | NestJS API + WebSocket                   |
| Web        | `quantification/web`                 | Vue 3 前端                               |
| 套利       | `arbitrage/`                         | 套利脚本                                 |
| 类型       | `quantification/core/src/types/`（trading 相关） | 下单 / 仓位类型           |

## 3. 目标目录结构

```
sync-indicator/
├── docs/
│   └── prd-sync-indicator-migration.md   ← 本文档
├── src/
│   ├── config/
│   │   └── index.ts                      # 环境变量加载
│   ├── data/
│   │   ├── db.ts                         # PostgreSQL 连接池
│   │   ├── db-bbo.ts
│   │   ├── db-instruments.ts
│   │   ├── db-trades.ts
│   │   ├── clean-ohlcv.ts
│   │   ├── normalize.ts
│   │   └── sources/
│   │       ├── okx.ts                    # REST 历史 OHLCV
│   │       ├── okx-ws.ts                 # WebSocket 实时 OHLCV
│   │       ├── okx-ws-bbo.ts
│   │       └── okx-ws-trades.ts
│   ├── indicators/
│   │   ├── ema.ts
│   │   ├── macd.ts
│   │   ├── macd-cross.ts
│   │   ├── atr.ts
│   │   └── index.ts
│   ├── scripts/
│   │   ├── fetch-okx-ohlcv.ts
│   │   ├── sync-realtime-ohlcv.ts
│   │   ├── sync-realtime-bbo.ts
│   │   ├── sync-realtime-trades.ts
│   │   ├── fetch-instruments.ts
│   │   ├── backfill-ohlcv-indicators.ts
│   │   └── init-db.ts
│   ├── ops/
│   │   └── logger.ts
│   └── types/
│       ├── index.ts                      # 共享基础类型
│       └── band-types.ts                 # Bar / BarWithIndicators
├── sql/
│   ├── 001_ohlcv.sql
│   ├── 005_ohlcv_indicators.sql
│   ├── 006_ohlcv_indicators_ema20_50.sql
│   └── 011_ohlcv_indicators_ema10.sql
├── docker/
│   └── docker-compose.yml                # sync-realtime 等服务
├── package.json                          # name: @sync-indicator
├── tsconfig.json
└── pnpm-lock.yaml
```

> `src/strategy/data/fill-indicators.ts` 迁入后路径改为 `src/indicators/fill-indicators.ts`，import 路径相应调整。

## 4. 依赖与影响分析

### 4.1 依赖方向：@sync-indicator 完全独立

`@sync-indicator` **不能依赖** `@auto-financial/`，反之亦然。两个包是完全独立的 workspace 包，通过共享数据库和 HTTP/WebSocket 接口协作，不通过 package import 互相引用。

### 4.2 @auto-financial 需要自建的模块（不再从 sources/ 导入）

迁移后 `@auto-financial` **不再引用** `@sync-indicator` 的任何代码。原先从 `sources/` 导入的指标函数、DB 工具等需要在 `auto-financial` 内部自建副本或替换方案：

| 原 import                                             | 迁移后方案                                              |
| ----------------------------------------------------- | ------------------------------------------------------- |
| `from '.../strategy/indicators'` (ema/macd/atr)       | 在 `quantification/core/src/indicators/` 复制实现       |
| `from '.../strategy/data/fill-indicators'`            | 在 `quantification/core/src/data/` 复制实现             |
| `from '.../strategy/band-types.ts'` (Bar/BarWithIndicators) | 保留在 `auto-financial` 内（该类型属于策略领域）  |
| `from '.../data/db.ts'` (initPool)                    | `quantification/core` 已有自己的 DB 模块，直接使用      |
| `from '.../config/index.ts'` (loadEnv)                | `quantification/core` 已有自己的 config，直接使用       |

> **原则**：指标计算是纯函数（输入数组 → 输出数组），复制实现成本极低，且避免了跨包耦合。

### 4.3 共享边界：仅数据库 + 服务端口

两个包的唯一共享契约是 PostgreSQL 表结构和 Docker 网络，不涉及代码层依赖：

| 共享项         | 说明                                                                 |
| -------------- | -------------------------------------------------------------------- |
| PostgreSQL     | 两个包通过 `DATABASE_URL` 连接同一个 DB 实例                         |
| `ohlcv` 表     | DDL 归属 `@sync-indicator`，`@auto-financial` 仅读取                 |
| `ohlcv_indicators` 表 | DDL 归属 `@sync-indicator`，`@auto-financial` 仅读取           |
| Docker network | 两个 docker-compose 文件通过 shared network 互通 PostgreSQL           |

### 4.4 Docker Compose

| 变更       | 说明                                              |
| ---------- | ------------------------------------------------- |
| 移出       | `sources/docker-compose.yml` 中 sync-realtime 等 service 搬至 `sync-indicator/docker/` |
| 保留       | `quantification/core/docker-compose.yml` 不变（live / server / web） |
| 网络       | 两个 compose 文件通过 shared Docker network 互通 PostgreSQL，不互相 import |

## 5. 实施步骤

| 阶段 | 动作 | 验证 |
|------|------|------|
| **Phase 1: 骨架** | 创建 `sync-indicator/` 目录结构、`package.json`、`tsconfig.json` | `pnpm install` + `tsc --noEmit` 通过 |
| **Phase 2: 迁移源码** | 将 2.1 列出的文件移入新目录，调整内部 import | 编译通过 |
| **Phase 3: 导出入口** | 在 `src/index.ts` 中 re-export 所有公开 API（指标函数、DB 初始化、数据源） | 单独 `pnpm run build` 通过 |
| **Phase 4: 重建 auto-financial 内部模块** | 将指标函数、fill-indicators 等纯函数复制到 `quantification/core/src/` 对应位置；删除 `auto-financial` 中对已迁移模块的 import | 全量 `pnpm install` + `tsc` 通过 |
| **Phase 5: 清理源码** | 删除 `auto-financial/sources/` 中已迁移的文件；删除 `package.json` 中 `@sync-indicator` workspace 引用（如有）；更新 `sources/package.json` scripts | 确认无残留引用，`auto-financial` 无 `@sync-indicator` 依赖 |
| **Phase 6: Docker** | 迁移 sync-realtime compose service，验证容器启动 | `docker compose up` 正常 |
| **Phase 7: 集成测试** | 跑 `fetch-ohlcv`、`backfill-indicators`、`sync-realtime`、`fill-indicators` 端到端 | 数据正确写入 DB，策略可正常读取指标 |
| **Phase 8: 文档** | 更新两份仓库的 `CLAUDE.md` 和 `README.md` | — |

## 6. 验收标准

- [ ] `@sync-indicator` 可独立 `pnpm run build`，无 `@auto-financial` 依赖
- [ ] `@sync-indicator` 的 `package.json` dependencies 中无任何 `@auto-financial/*` 引用
- [ ] `@auto-financial` 的 `package.json` dependencies 中无任何 `@sync-indicator` 引用
- [ ] `@auto-financial` 的 `quantification/core`、`quantification/llm`、`strategys/` 全部编译通过
- [ ] `pnpm run fetch-ohlcv` 在 `sync-indicator/` 下正常拉取数据
- [ ] `pnpm run backfill-indicators` 正常写入 `ohlcv_indicators`
- [ ] `pnpm run sync-realtime` WebSocket 正常运行
- [ ] `fillMissingIndicatorsForBars` 在 `quantification/llm` 中调用正常（使用 auto-financial 内部副本）
- [ ] `docker compose up` 容器正常启动（两个 compose 文件通过 shared network 互通）
- [ ] `auto-financial/sources/` 中不再包含已迁移文件

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 指标函数复制后行为不一致 | 信号计算错误 | 两个副本使用相同单元测试，CI 统一跑 |
| import 路径遗漏 | 编译失败 | 用 `grep -r` 全量扫描旧路径 |
| Docker 网络隔离 | 服务无法连 DB | 统一 network name，compose 文件通过 external network 互通 |
| SQL DDL 版本冲突 | 表结构不一致 | 保留原始 SQL 文件内容不变，只变更归属 |
| `band-types.ts` 重复定义 | 类型不兼容 | 两个包各自定义自己的 Bar 类型，DB 层通过统一的 SQL schema 保持一致 |
