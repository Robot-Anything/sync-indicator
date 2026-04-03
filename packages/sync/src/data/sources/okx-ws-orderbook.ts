/**
 * OKX WebSocket 订单簿 20 档：books channel（支持增量更新，最多 400 档）
 * 本地维护 Map<price, size> bid/ask 状态（价格排序），每次更新后取前 20 档写库
 */

import WebSocket from 'ws';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('okx-ws-orderbook');
const WS_URL = 'wss://ws.okx.com:8443/ws/v5/public'; // books channel is on public endpoint
const INST_ID = 'ETH-USDT';
const DEPTH = 20; // 20 档
const HEARTBEAT_INTERVAL_MS = 15000;
const IDLE_PING_THRESHOLD_MS = 20000;
const IDLE_TIMEOUT_MS = 45000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

export interface OrderbookTick {
  time: number;
  bids: [number, number][]; // [price, size][]
  asks: [number, number][];
}

interface OkxBookLevel {
  [index: number]: string;
}

interface OkxBookItem {
  asks?: OkxBookLevel[][];  // each entry: [price, size, deprecated, orderCount]
  bids?: OkxBookLevel[][];
  ts?: string;
  seqId?: number | string;
  checksum?: number;
}

interface OkxPushMessage {
  arg?: { channel?: string; instId?: string };
  action?: string; // "snapshot" | "update" — on outer message, not inside data items
  data?: OkxBookItem[];
  event?: string;
  code?: string;
  msg?: string;
}

export type OnOrderbookCallback = (symbol: string, orderbook: OrderbookTick) => void;

export interface WsHandle {
  close(): void;
}

/**
 * 解析 OKX 档位数据为 [price, size][]
 * OKX 格式：levels = [["price", "size", "deprecated", "count"], ...]
 * 每个 level 是 [price, size, ...] 的一维数组，直接取 [0] 和 [1]
 */
function parseLevels(levels?: OkxBookLevel[][]): [number, number][] {
  if (!levels) return [];
  const result: [number, number][] = [];
  for (const level of levels) {
    if (!Array.isArray(level) || level.length < 2) continue;
    const px = Number(level[0]);
    const sz = Number(level[1]);
    if (Number.isFinite(px) && Number.isFinite(sz)) {
      result.push([px, sz]);
    }
  }
  return result;
}

/**
 * 从 Map 提取前 N 档（bid 降序，ask 升序）
 */
function extractTopN(
  bids: Map<number, number>,
  asks: Map<number, number>,
  n: number
): { bids: [number, number][]; asks: [number, number][] } {
  // bids 降序
  const sortedBids = [...bids.entries()]
    .filter(([, sz]) => sz > 0)
    .sort((a, b) => b[0] - a[0])
    .slice(0, n);
  // asks 升序
  const sortedAsks = [...asks.entries()]
    .filter(([, sz]) => sz > 0)
    .sort((a, b) => a[0] - b[0])
    .slice(0, n);
  return { bids: sortedBids, asks: sortedAsks };
}

/**
 * 建立 OKX WebSocket，订阅 books，收到增量/全量更新时调用 onOrderbook（前 20 档）
 * books channel 返回增量更新（type=snap）和全量快照（type=snap）
 */
export function connectOkxOrderbookWs(onOrderbook: OnOrderbookCallback): WsHandle {
  let ws = new WebSocket(WS_URL);
  let lastMessageTs = Date.now();
  let reconnectAttempts = 0;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

  // 本地订单簿状态
  const bidMap = new Map<number, number>(); // price -> size
  const askMap = new Map<number, number>();

  let lastSeqId: string | null = null;
  let lastUpdateTs = 0;

  const clearHeartbeat = (): void => {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  const clearReconnect = (): void => {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const scheduleReconnect = (): void => {
    clearReconnect();
    reconnectAttempts += 1;
    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempts - 1),
      RECONNECT_MAX_DELAY_MS
    );
    reconnectTimer = setTimeout(() => {
      log.info(`reconnect start attempt=${reconnectAttempts}`);
      bind(new WebSocket(WS_URL));
    }, delay);
    log.info(`reconnect scheduled attempt=${reconnectAttempts} delayMs=${delay}`);
  };

  const emit = (ts: number): void => {
    const { bids, asks } = extractTopN(bidMap, askMap, DEPTH);
    if (bids.length > 0 || asks.length > 0) {
      onOrderbook(INST_ID, { time: ts, bids, asks });
    }
  };

  const bind = (nextWs: WebSocket): void => {
    ws = nextWs;
    lastMessageTs = Date.now();

    ws.on('open', () => {
      clearReconnect();
      reconnectAttempts = 0;
      lastMessageTs = Date.now();
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        const idleMs = Date.now() - lastMessageTs;
        if (idleMs >= IDLE_TIMEOUT_MS) {
          log.error(`heartbeat timeout idleMs=${idleMs}, terminate and reconnect`);
          ws.terminate();
          return;
        }
        if (idleMs >= IDLE_PING_THRESHOLD_MS && ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
          log.info(`heartbeat ping idleMs=${idleMs}`);
        }
      }, HEARTBEAT_INTERVAL_MS);

      log.info('connected');
      // 订阅 books channel，depth=400 获取更多档位
      ws.send(
        JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'books', instId: INST_ID, depth: 400 }],
        })
      );
      log.info(`subscribe books instId=${INST_ID}`);
    });

    ws.on('message', (raw: Buffer | string) => {
      lastMessageTs = Date.now();
      const text = raw.toString();
      if (text === 'pong') {
        log.info('heartbeat pong');
        return;
      }

      let msg: OkxPushMessage;
      try {
        msg = JSON.parse(text) as OkxPushMessage;
      } catch (e) {
        log.error('parse message', e instanceof Error ? e.message : e);
        return;
      }

      if (msg.event === 'subscribe') {
        log.info(`subscribed channel=${msg.arg?.channel ?? '?'}`);
        return;
      }
      if (msg.event === 'error') {
        log.error(`server error code=${msg.code} msg=${msg.msg ?? ''}`);
        return;
      }

      const data = msg.data;
      const action = msg.action; // "snapshot" | "update" — on outer message
      if (!data || !Array.isArray(data)) return;

      for (const item of data) {
        const ts = Number(item?.ts ?? 0);

        // 全量快照：action === 'snapshot'（首次连接及重连后第一条消息）
        if (action === 'snapshot') {
          bidMap.clear();
          askMap.clear();
          for (const [px, sz] of parseLevels(item.bids)) bidMap.set(px, sz);
          for (const [px, sz] of parseLevels(item.asks)) askMap.set(px, sz);
          lastSeqId = item.seqId != null ? String(item.seqId) : null;
          lastUpdateTs = ts;
          emit(ts);
          continue;
        }

        // 增量更新：按 seqId 顺序处理，防止乱序重放
        const seqId = item.seqId != null ? String(item.seqId) : null;
        if (seqId && lastSeqId) {
          if (parseInt(seqId) <= parseInt(lastSeqId)) {
            log.warn(`seqId ${seqId} <= lastSeqId ${lastSeqId}, skip`);
            continue;
          }
        }

        // 增量更新 bids — 每个 level = [price, size, deprecated, count]
        if (item.bids) {
          for (const level of item.bids) {
            if (!Array.isArray(level) || level.length < 2) continue;
            const px = Number(level[0]);
            const sz = Number(level[1]);
            if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
            if (sz === 0) {
              bidMap.delete(px);
            } else {
              bidMap.set(px, sz);
            }
          }
        }

        // 增量更新 asks — 每个 level = [price, size, deprecated, count]
        if (item.asks) {
          for (const level of item.asks) {
            if (!Array.isArray(level) || level.length < 2) continue;
            const px = Number(level[0]);
            const sz = Number(level[1]);
            if (!Number.isFinite(px) || !Number.isFinite(sz)) continue;
            if (sz === 0) {
              askMap.delete(px);
            } else {
              askMap.set(px, sz);
            }
          }
        }

        if (seqId) lastSeqId = seqId;
        if (ts > 0) lastUpdateTs = ts;
        emit(ts);
      }
    });

    ws.on('error', (err) => {
      log.error('websocket error', err instanceof Error ? err.message : err);
    });

    ws.on('close', (code, reason) => {
      clearHeartbeat();
      const reasonText = reason.toString() || 'none';
      const idleMs = Date.now() - lastMessageTs;
      log.info(`closed code=${code} reason=${reasonText} idleMs=${idleMs}`);
      if (code === 1006) {
        log.error(`abnormal close(1006), usually network/timeout, reason=${reasonText}`);
      }
      scheduleReconnect();
    });
  };

  bind(ws);

  return {
    close: () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    },
  };
}
