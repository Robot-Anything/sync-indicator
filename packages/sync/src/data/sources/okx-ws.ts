/**
 * OKX WebSocket 实时 K 线：Candlesticks channel，仅当 confirm=1（已收盘）时回调
 */

import WebSocket from 'ws';
import type { OHLCV } from '@sync-indicator/core';
import { normalizeOkxCandle } from '@sync-indicator/core';
import { createLogger } from '@sync-indicator/core';

const log = createLogger('okx-ws');
const WS_URL = 'wss://ws.okx.com:8443/ws/v5/business';
const INST_ID = 'ETH-USDT';
const CHANNELS = ['candle1H', 'candle4H', 'candle15m', 'candle1D'] as const;
const HEARTBEAT_INTERVAL_MS = 15000;
const IDLE_PING_THRESHOLD_MS = 20000;
const IDLE_TIMEOUT_MS = 45000;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

/** 从 channel 名解析 interval，如 candle1H -> 1H */
function channelToInterval(channel: string): string {
  const m = channel.match(/^candle(.+)$/);
  return m ? m[1] : channel;
}

/** OKX 推送单根 K 线： [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm] */
function isConfirmedCandle(row: string[]): boolean {
  return row.length > 8 && row[8] === '1';
}

interface OkxPushArg {
  channel?: string;
  instId?: string;
}

interface OkxPushMessage {
  arg?: OkxPushArg;
  data?: string[][];
  event?: string;
  code?: string;
  msg?: string;
}

export type OnCandleCallback = (interval: string, ohlcv: OHLCV) => void;

/** WsHandle 保证 close() 始终操作当前活跃连接，解决重连后引用过期问题 */
export interface WsHandle {
  close(): void;
}

/**
 * 建立 OKX WebSocket，订阅 candle1H / candle4H，收到 confirm=1 的 K 线时调用 onCandle
 */
export function connectOkxCandleWs(onCandle: OnCandleCallback): WsHandle {
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
      const subscribe = {
        op: 'subscribe',
        args: CHANNELS.map((channel) => ({ channel, instId: INST_ID })),
      };
      ws.send(JSON.stringify(subscribe));
      log.info(`subscribe ${CHANNELS.join(', ')} instId=${INST_ID}`);
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
      const arg = msg.arg;
      if (!data || !Array.isArray(data) || !arg?.channel) return;

      const interval = channelToInterval(arg.channel);
      for (const row of data) {
        if (!Array.isArray(row) || row.length < 6) continue;
        if (!isConfirmedCandle(row)) continue;
        try {
          const ohlcv = normalizeOkxCandle(row);
          onCandle(interval, ohlcv);
          log.info(`candle interval=${interval} time=${new Date(ohlcv.time).toISOString()}`);
        } catch (e) {
          log.error(`normalize candle interval=${interval}`, e instanceof Error ? e.message : e);
        }
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
