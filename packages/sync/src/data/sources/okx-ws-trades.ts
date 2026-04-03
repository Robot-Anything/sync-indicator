/**
 * OKX WebSocket 逐笔成交：trades-all channel
 */

import WebSocket from 'ws';
import type { Trade } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('okx-ws-trades');
const WS_URL = 'wss://ws.okx.com:8443/ws/v5/business';
const INST_ID = 'ETH-USDT';
const HEARTBEAT_INTERVAL_MS = 15000;
const IDLE_PING_THRESHOLD_MS = 20000;
const IDLE_TIMEOUT_MS = 45000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

interface OkxTradeItem {
  instId?: string;
  tradeId?: string;
  px?: string;
  sz?: string;
  side?: string;
  ts?: string;
}

interface OkxPushMessage {
  arg?: { channel?: string; instId?: string };
  data?: OkxTradeItem[];
  event?: string;
  code?: string;
  msg?: string;
}

export type OnTradeCallback = (symbol: string, trade: Trade) => void;

export interface WsHandle {
  close(): void;
}

function parseTrade(item: OkxTradeItem, symbol: string): Trade | null {
  if (
    !item?.tradeId ||
    item.px == null ||
    item.sz == null ||
    item.side == null ||
    item.ts == null
  )
    return null;
  const side = item.side.toLowerCase();
  if (side !== 'buy' && side !== 'sell') return null;
  return {
    tradeId: item.tradeId,
    time: Number(item.ts),
    price: Number(item.px),
    size: Number(item.sz),
    side: side as 'buy' | 'sell',
  };
}

/**
 * 建立 OKX WebSocket，订阅 trades-all，收到逐笔成交时调用 onTrade
 */
export function connectOkxTradesWs(onTrade: OnTradeCallback): WsHandle {
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
          args: [{ channel: 'trades-all', instId: INST_ID }],
        })
      );
      log.info(`subscribe trades-all instId=${INST_ID}`);
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
        log.info('subscribed trades-all');
        return;
      }
      if (msg.event === 'error') {
        log.error(`server error code=${msg.code} msg=${msg.msg ?? ''}`);
        return;
      }

      const data = msg.data;
      const instId = msg.arg?.instId ?? INST_ID;
      if (!data || !Array.isArray(data)) return;

      for (const item of data) {
        const trade = parseTrade(item, instId);
        if (trade) onTrade(instId, trade);
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
