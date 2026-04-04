/**
 * OKX WebSocket 买卖一档：bbo-tbt channel（/ws/v5/public）
 */

import WebSocket from 'ws';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('okx-ws-bbo');
const WS_URL = 'wss://ws.okx.com:8443/ws/v5/public';

export interface BboTick {
  time: number;
  bid_px: number;
  ask_px: number;
  bid_sz: number;
  ask_sz: number;
}

interface OkxBboLevel {
  [index: number]: string;
}

interface OkxBboItem {
  asks?: OkxBboLevel[][];
  bids?: OkxBboLevel[][];
  ts?: string;
}

interface OkxPushMessage {
  arg?: { channel?: string; instId?: string };
  data?: OkxBboItem[];
  event?: string;
  code?: string;
  msg?: string;
}

export type OnBboCallback = (symbol: string, bbo: BboTick) => void;

export interface WsHandle {
  close(): void;
}
const HEARTBEAT_INTERVAL_MS = 15000;
const IDLE_PING_THRESHOLD_MS = 20000;
const IDLE_TIMEOUT_MS = 45000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

function parseBbo(item: OkxBboItem, symbol: string): BboTick | null {
  const ts = item?.ts;
  const bids = item?.bids?.[0];
  const asks = item?.asks?.[0];
  if (!ts || !bids || !Array.isArray(bids) || bids.length < 2 || !asks || !Array.isArray(asks) || asks.length < 2)
    return null;
  const bidPx = Number(bids[0]);
  const bidSz = Number(bids[1]);
  const askPx = Number(asks[0]);
  const askSz = Number(asks[1]);
  if (!Number.isFinite(bidPx) || !Number.isFinite(askPx) ||
      !Number.isFinite(bidSz) || !Number.isFinite(askSz)) return null;
  return {
    time: Number(ts),
    bid_px: bidPx,
    ask_px: askPx,
    bid_sz: bidSz,
    ask_sz: askSz,
  };
}

/**
 * 建立 OKX WebSocket，订阅 bbo-tbt，收到买卖一档时调用 onBbo
 */
export function connectOkxBboWs(symbols: string[], onBbo: OnBboCallback): WsHandle {
  let ws = new WebSocket(WS_URL);
  let lastMessageTs = Date.now();
  let reconnectAttempts = 0;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

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
      ws.send(
        JSON.stringify({
          op: 'subscribe',
          args: symbols.map(s => ({ channel: 'bbo-tbt', instId: s })),
        })
      );
      log.info(`subscribe bbo-tbt instId=${symbols.join(',')}`);
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
        log.info('subscribed bbo-tbt');
        return;
      }
      if (msg.event === 'error') {
        log.error(`server error code=${msg.code} msg=${msg.msg ?? ''}`, new Error(msg.msg ?? ''));
        return;
      }

      const data = msg.data;
      const instId = msg.arg?.instId ?? '';
      if (!data || !Array.isArray(data)) return;

      for (const item of data) {
        const bbo = parseBbo(item, instId);
        if (bbo) onBbo(instId, bbo);
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
