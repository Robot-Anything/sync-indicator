export interface Bar {
  /** K 线开盘时间，与 OKX / DB 一致为 Unix 毫秒 */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema_20?: number | null;
  ema_50?: number | null;
  rsi_14?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_histogram?: number | null;
  atr_14?: number | null;
  [key: string]: unknown;
}

export interface BboData {
  time: number;
  bid_px: number;
  bid_sz: number;
  ask_px: number;
  ask_sz: number;
}

export interface OrderbookData {
  time: number;
  bids: [number, number][];
  asks: [number, number][];
}

export interface IndicatorParams {
  exchange: string;
  symbol: string;
  interval: string;
  limit: number;
  ema?: number[];
  rsi?: number;
  macd?: number;
  macd_fast?: number;
  macd_slow?: number;
  macd_signal_period?: number;
  atr?: number;
}

async function apiFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  const search = new URLSearchParams(params);
  const res = await fetch(`${path}?${search}`);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchIndicators(params: IndicatorParams): Promise<Bar[]> {
  const query: Record<string, string> = {
    exchange: params.exchange,
    symbol: params.symbol,
    interval: params.interval,
    limit: String(params.limit),
  };

  if (params.ema) {
    for (const period of params.ema) {
      // URLSearchParams handles repeated keys via append, but we use a record.
      // We'll build the query string manually for ema[].
    }
  }
  if (params.rsi) query.rsi = String(params.rsi);
  if (params.macd) query.macd = '1';
  if (params.macd_fast) query.macd_fast = String(params.macd_fast);
  if (params.macd_slow) query.macd_slow = String(params.macd_slow);
  if (params.macd_signal_period) query.macd_signal = String(params.macd_signal_period);
  if (params.atr) query.atr = String(params.atr);

  // Build URL manually to support ema[]=X repeated params
  const searchParams = new URLSearchParams();
  searchParams.set('exchange', params.exchange);
  searchParams.set('symbol', params.symbol);
  searchParams.set('interval', params.interval);
  searchParams.set('limit', String(params.limit));

  if (params.ema) {
    for (const period of params.ema) {
      searchParams.append('ema', String(period));
    }
  }
  if (params.rsi) searchParams.set('rsi', String(params.rsi));
  if (params.macd) searchParams.set('macd', '1');
  if (params.macd_fast) searchParams.set('macd_fast', String(params.macd_fast));
  if (params.macd_slow) searchParams.set('macd_slow', String(params.macd_slow));
  if (params.macd_signal_period) searchParams.set('macd_signal', String(params.macd_signal_period));
  if (params.atr) searchParams.set('atr', String(params.atr));

  const res = await fetch(`/api/v1/indicators?${searchParams}`);
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.bars;
}

export async function fetchBbo(exchange: string, symbol: string): Promise<BboData> {
  return apiFetch('/api/v1/bbo', { exchange, symbol });
}

export async function fetchOrderbook(
  exchange: string,
  symbol: string,
  depth: number
): Promise<OrderbookData> {
  return apiFetch('/api/v1/orderbook', { exchange, symbol, depth: String(depth) });
}

export async function fetchSymbols(exchange: string = 'okx'): Promise<string[]> {
  const data = await apiFetch<{ symbols: string[] }>('/api/v1/symbols', { exchange });
  return data.symbols;
}
