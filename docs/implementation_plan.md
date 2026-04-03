# 设计基于 `sync-indicator` API 的前端应用

根据现有的后端 HTTP 接口（K线/指标、订单簿、买卖一档），我们需要在当前的 Monorepo 中增加一个前端应用（Web 端），将其设计为一个**高级暗色主题的量化交易终端（Premium, Dark-Themed Crypto Trading Terminal）**。

## User Review Required

> [!IMPORTANT]
> 这是应用的核心架构与技术选型，请检查以下方案是否符合您的期望。如果符合，请批准该计划，我将开始自动为您生成代码。
> 1. 我们将在 `packages/web` 目录下创建一个新的前端项目。
> 2. 我们将使用 React + Vite （基于之前的全栈偏好和构建效率）。
> 3. 不使用 TailwindCSS（默认遵守您的提示词规则，使用 Vanilla CSS 实现灵活且高端的视觉效果和微交互），除非您明确要求使用。
> 4. 使用 `lightweight-charts` 或 `echarts` 绘制高端的专业 K 线和指标图表。建议使用**TradingView Lightweight Charts** 以达到最专业的交易图表效果。

## Proposed Changes

### UI 界面设计核心（Premium Dark Mode）
前端将采用极简且极具质感的深色模式：
- 颜色主基调为深灰黑色（如 `#0B0E11` 或 `#121212`）。
- 强调色（Accent Colors）采用高饱和度的荧光色调：霓虹绿（如 `#00C087`）代表上涨/买入，玫红色（如 `#FF3062`）代表下跌/卖出。
- 并通过毛玻璃特效（Glassmorphism）、平滑过渡动画和现代字体（如 `Inter` / `Roboto Mono`）提升视觉品质。

界面布局：
- **顶部控制栏 (Top Bar)**：用于选择品种（如 `ETH-USDT`）、切换时间周期（`15m`, `1H`, `4H`, `1D`）和动态勾选需要计算的指标（EMA、MACD、RSI、ATR）。
- **左侧主内容区 (Main Chart)**：专业的图表组件，默认展示 OHLCV 蜡烛图，并根据用户选择动态叠加 `GET /api/v1/indicators` 接口返回的指标数据。
- **右侧面板 (Right Sidebar)**：
  - **BBO (Best Bid/Offer) 面板**：每秒轮询或定时获取最新 `GET /api/v1/bbo`。
  - **订单簿 (Orderbook) 深度面板**：获取 `GET /api/v1/orderbook` 的快照数据并在 UI 上实时可视化红绿深度量。

---

### packages/web
本项目将包含以下关键文件和结构：

#### [NEW] `packages/web/package.json`
Vite/React 项目配置。

#### [NEW] `packages/web/vite.config.ts`
配置开发服务器并代理 API 请求（`/api` 转发至 `http://localhost:3001`）。

#### [NEW] `packages/web/src/index.css`
统一定义现代黑灰配色方案的 CSS 变量，定制滚动条，以及添加平滑变化的类。

#### [NEW] `packages/web/src/App.tsx`
整个应用的布局组件，负责统筹头部、主图表和右侧面板。

#### [NEW] `packages/web/src/components/ChartWidget.tsx`
结合 `lightweight-charts` 渲染 K 线数据和对应的量能柱、EMA、MACD、RSI 等图线。

#### [NEW] `packages/web/src/components/OrderbookWidget.tsx`
轮询并展示 Orderbook 数据，带有类似原生交易所红绿背景柱状深度的视觉效果。

#### [NEW] `packages/web/src/components/Toolbar.tsx`
顶部的工具栏组件。

#### [NEW] `packages/web/src/api/client.ts`
用于与后端 `/api/v1/indicators`、`/api/v1/orderbook` 和 `/api/v1/bbo` 进行数据交互的网络层面封装。

## Open Questions

> [!WARNING]
> 1. 图表库倾向：您更倾向于使用专业的金融图表库 `lightweight-charts`，还是用通用强大的 `echarts` （如果未来需要绘制更杂乱的可视化）？本计划默认推荐 `lightweight-charts`。
> 2. 由于实时接口尚未实现 WebSocket，我们将通过**定时轮询 (Polling)** 的方式每秒请求 Orderbook 和 BBO 接口以更新右侧面板，接受这种做法吗？

## Verification Plan

### Automated Tests
1. 运行 `pnpm --filter web build` 检查前端否成功编译。

### Manual Verification
1. 运行整个工作流 `pnpm install` 后，在 `web` 项目 `pnpm dev` 启动前端。
2. 打开浏览器查看看是否实现了一个有着高端深色风格的交易界面，K 线和指标切换顺滑无报错。
3. 观察订单簿与 BBO 面板是否有数据定时拉取和更新。
