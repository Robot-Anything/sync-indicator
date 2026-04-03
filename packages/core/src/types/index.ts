/**
 * 共享类型：K 线、订单、持仓、配置等
 */

export type Symbol = string;

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** 单笔成交（逐笔） */
export interface Trade {
  time: number;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  tradeId: string;
}

export interface Order {
  id: string;
  symbol: Symbol;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price?: number;
  amount: number;
  status: string;
  createdAt: number;
}

export interface Position {
  symbol: Symbol;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  unrealizedPnl?: number;
}

export interface StrategyConfig {
  [key: string]: unknown;
}
